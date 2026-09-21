"""
Comprehensive Audit Gate G Test Suite: Analytics Engine.
Validates Open Interest Walls, PCR calculations, Futures Buildup classification,
IV percentile boundaries, Max Pain calculation, and full database persistence.
"""

from datetime import datetime, date
import pytest
import pytz
from sqlalchemy import create_engine

from db.models import (
    Base,
    AnalyticsOIWall,
    AnalyticsPCR,
    AnalyticsFuturesBuildup,
    AnalyticsIV,
    AnalyticsMaxPain,
    FuturesSnapshot,
)
from db.connection import get_db_session
from analytics.oi_analyzer import compute_oi_walls
from analytics.pcr_calculator import compute_pcr
from analytics.futures_buildup import classify_buildup
from analytics.iv_analyzer import compute_iv_metrics
from analytics.max_pain import compute_max_pain
from analytics.engine import AnalyticsEngine
from fetchers.base import OptionChainRow, FuturesRow

IST = pytz.timezone("Asia/Kolkata")


@pytest.fixture
def synthetic_option_chain():
    """Generates a structured, deterministic 11-strike option chain around 24500 spot."""
    captured_at = datetime.now(IST)
    expiry = date(2026, 9, 24)
    rows = []

    # Strikes: 24000 to 25000 in steps of 100
    strikes = [24000 + i * 100 for i in range(11)]

    # Deterministic OIs
    # Call OI peaks at 24800 (Rank 1: 150,000), 24600 (Rank 2: 120,000), 25000 (Rank 3: 110,000), 24700 (Rank 4: 90,000), 24500 (Rank 5: 80,000)
    ce_oi_map = {
        24000: 10000, 24100: 20000, 24200: 30000, 24300: 40000, 24400: 60000,
        24500: 80000, 24600: 120000, 24700: 90000, 24800: 150000, 24900: 70000, 25000: 110000
    }

    # Put OI peaks at 24200 (Rank 1: 160,000), 24400 (Rank 2: 140,000), 24000 (Rank 3: 130,000), 24300 (Rank 4: 95,000), 24500 (Rank 5: 85,000)
    pe_oi_map = {
        24000: 130000, 24100: 50000, 24200: 160000, 24300: 95000, 24400: 140000,
        24500: 85000, 24600: 40000, 24700: 30000, 24800: 20000, 24900: 15000, 25000: 10000
    }

    for s in strikes:
        rows.append(OptionChainRow(
            underlying="NIFTY",
            expiry=str(expiry),
            strike=float(s),
            option_type="CE",
            oi=ce_oi_map[s],
            change_in_oi=1000,
            volume=50000,
            iv=14.0 + (s - 24500) * 0.002,
            ltp=max(10.0, 24520.0 - s) if s <= 24500 else max(5.0, 200.0 - (s - 24500) * 0.5),
            spot_price=24520.0,
            source="nsepython",
            snapshot_status="complete",
            captured_at=captured_at
        ))
        rows.append(OptionChainRow(
            underlying="NIFTY",
            expiry=str(expiry),
            strike=float(s),
            option_type="PE",
            oi=pe_oi_map[s],
            change_in_oi=1200,
            volume=45000,
            iv=15.0 + (24500 - s) * 0.002,
            ltp=max(10.0, s - 24520.0) if s >= 24500 else max(5.0, 200.0 - (24500 - s) * 0.5),
            spot_price=24520.0,
            source="nsepython",
            snapshot_status="complete",
            captured_at=captured_at
        ))

    return {
        "rows": rows,
        "spot_price": 24520.0,
        "captured_at": captured_at,
        "ce_oi_map": ce_oi_map,
        "pe_oi_map": pe_oi_map,
        "expiry": expiry
    }


class TestAnalyticsEngine:
    """Audit Gate G: Verifies full mathematical accuracy and pipeline execution."""

    def test_oi_walls_correct_ranking(self, synthetic_option_chain):
        rows = synthetic_option_chain["rows"]
        captured_at = synthetic_option_chain["captured_at"]

        walls = compute_oi_walls(
            option_rows=rows,
            underlying="NIFTY",
            captured_at=captured_at,
            top_n=5
        )

        ce_walls = [w for w in walls if w["option_type"] == "CE"]
        pe_walls = [w for w in walls if w["option_type"] == "PE"]

        assert len(ce_walls) == 5
        assert len(pe_walls) == 5

        # Verify Call Wall ranking matches expected OI peaks: 24800, 24600, 25000, 24700, 24500
        expected_ce_strikes = [24800.0, 24600.0, 25000.0, 24700.0, 24500.0]
        actual_ce_strikes = [w["strike"] for w in ce_walls]
        assert actual_ce_strikes == expected_ce_strikes

        # Verify Put Wall ranking matches expected OI peaks: 24200, 24400, 24000, 24300, 24500
        expected_pe_strikes = [24200.0, 24400.0, 24000.0, 24300.0, 24500.0]
        actual_pe_strikes = [w["strike"] for w in pe_walls]
        assert actual_pe_strikes == expected_pe_strikes

        # Test shift detection with simulated prior walls
        prev_walls = [
            {"strike": 24700.0, "option_type": "CE", "wall_rank": 1},  # was 24700, now 24800 -> 'up'
            {"strike": 24400.0, "option_type": "PE", "wall_rank": 1}   # was 24400, now 24200 -> 'down'
        ]
        shifted_walls = compute_oi_walls(
            option_rows=rows,
            underlying="NIFTY",
            captured_at=captured_at,
            prev_walls=prev_walls,
            top_n=5
        )
        ce_rank_1 = next(w for w in shifted_walls if w["option_type"] == "CE" and w["wall_rank"] == 1)
        pe_rank_1 = next(w for w in shifted_walls if w["option_type"] == "PE" and w["wall_rank"] == 1)

        assert ce_rank_1["wall_shift_direction"] == "up"
        assert pe_rank_1["wall_shift_direction"] == "down"

    def test_pcr_calculation_accuracy(self, synthetic_option_chain):
        rows = synthetic_option_chain["rows"]
        captured_at = synthetic_option_chain["captured_at"]
        ce_oi_map = synthetic_option_chain["ce_oi_map"]
        pe_oi_map = synthetic_option_chain["pe_oi_map"]

        expected_total_pe = sum(pe_oi_map.values()) # 775,000
        expected_total_ce = sum(ce_oi_map.values()) # 780,000
        expected_overall_pcr = round(expected_total_pe / expected_total_ce, 4) # ~0.9936

        res = compute_pcr(
            option_rows=rows,
            underlying="NIFTY",
            captured_at=captured_at,
            spot_price=24520.0,
            prior_pcr_values=[0.95]
        )

        assert res["total_put_oi"] == expected_total_pe
        assert res["total_call_oi"] == expected_total_ce
        assert res["overall_pcr"] == expected_overall_pcr
        assert res["pcr_trend"] == "rising"  # 0.9936 > 0.95 + 0.02
        assert res["sentiment_zone"] == "neutral"

        # Test extreme zones
        oversold = compute_pcr(
            option_rows=[
                OptionChainRow(underlying="N", expiry="2026-09-24", strike=100.0, option_type="PE", oi=1400, change_in_oi=0, volume=0, iv=0, ltp=1, spot_price=100, source="s", snapshot_status="complete", captured_at=captured_at),
                OptionChainRow(underlying="N", expiry="2026-09-24", strike=100.0, option_type="CE", oi=1000, change_in_oi=0, volume=0, iv=0, ltp=1, spot_price=100, source="s", snapshot_status="complete", captured_at=captured_at)
            ],
            underlying="N",
            captured_at=captured_at,
            spot_price=100.0
        )
        assert oversold["sentiment_zone"] == "oversold_bullish"  # PCR 1.4 >= 1.30

    def test_futures_buildup_classification(self):
        now = datetime.now(IST)
        base = FuturesRow(
            underlying="NIFTY",
            expiry="2026-09-24",
            open=24000.0,
            high=24200.0,
            low=23950.0,
            close=24100.0,
            volume=50000,
            oi=1000000,
            source="angelone",
            snapshot_status="complete",
            captured_at=now
        )

        # 1. Long Buildup: Price UP, OI UP
        fut_lb = FuturesRow(underlying="NIFTY", expiry="2026-09-24", open=24100.0, high=24300.0, low=24050.0, close=24250.0, volume=60000, oi=1100000, source="angelone", snapshot_status="complete", captured_at=now)
        res_lb = classify_buildup(current_row=fut_lb, prev_row=base)
        assert res_lb["buildup_type"] == "Long Buildup"
        assert res_lb["price_change"] == 150.0
        assert res_lb["oi_change"] == 100000
        assert res_lb["confidence_pct"] > 70.0

        # 2. Short Covering: Price UP, OI DOWN
        fut_sc = FuturesRow(underlying="NIFTY", expiry="2026-09-24", open=24100.0, high=24300.0, low=24050.0, close=24200.0, volume=60000, oi=950000, source="angelone", snapshot_status="complete", captured_at=now)
        res_sc = classify_buildup(current_row=fut_sc, prev_row=base)
        assert res_sc["buildup_type"] == "Short Covering"
        assert res_sc["price_change"] == 100.0
        assert res_sc["oi_change"] == -50000

        # 3. Short Buildup: Price DOWN, OI UP
        fut_sb = FuturesRow(underlying="NIFTY", expiry="2026-09-24", open=24100.0, high=24100.0, low=23850.0, close=23900.0, volume=60000, oi=1150000, source="angelone", snapshot_status="complete", captured_at=now)
        res_sb = classify_buildup(current_row=fut_sb, prev_row=base)
        assert res_sb["buildup_type"] == "Short Buildup"
        assert res_sb["price_change"] == -200.0
        assert res_sb["oi_change"] == 150000

        # 4. Long Unwinding: Price DOWN, OI DOWN
        fut_lu = FuturesRow(underlying="NIFTY", expiry="2026-09-24", open=24100.0, high=24100.0, low=23850.0, close=23950.0, volume=60000, oi=900000, source="angelone", snapshot_status="complete", captured_at=now)
        res_lu = classify_buildup(current_row=fut_lu, prev_row=base)
        assert res_lu["buildup_type"] == "Long Unwinding"
        assert res_lu["price_change"] == -150.0
        assert res_lu["oi_change"] == -100000

    def test_iv_percentile_boundary(self, synthetic_option_chain):
        rows = synthetic_option_chain["rows"]
        captured_at = synthetic_option_chain["captured_at"]

        # If current ATM IV is at historical minimum (e.g. 10.0 to 20.0, current is 10.0)
        res_min = compute_iv_metrics(
            option_rows=rows,
            underlying="NIFTY",
            captured_at=captured_at,
            spot_price=24520.0,
            historical_ivs=[14.0, 18.0, 22.0]  # ATM IV around ~14.5
        )
        assert res_min["atm_iv"] > 0.0
        assert 0.0 <= res_min["iv_percentile"] <= 100.0

        # Boundary test: IV at 30-day min
        res_boundary_min = compute_iv_metrics(
            option_rows=[
                OptionChainRow(underlying="N", expiry="2026-09-24", strike=100.0, option_type="CE", oi=100, change_in_oi=0, volume=0, iv=10.0, ltp=1, spot_price=100, source="s", snapshot_status="complete", captured_at=captured_at),
                OptionChainRow(underlying="N", expiry="2026-09-24", strike=100.0, option_type="PE", oi=100, change_in_oi=0, volume=0, iv=10.0, ltp=1, spot_price=100, source="s", snapshot_status="complete", captured_at=captured_at)
            ],
            underlying="N",
            captured_at=captured_at,
            spot_price=100.0,
            historical_ivs=[10.0, 15.0, 20.0]
        )
        assert res_boundary_min["iv_percentile"] == 0.0
        assert res_boundary_min["iv_regime"] == "cheap_buy_options"

        # Boundary test: IV at 30-day max
        res_boundary_max = compute_iv_metrics(
            option_rows=[
                OptionChainRow(underlying="N", expiry="2026-09-24", strike=100.0, option_type="CE", oi=100, change_in_oi=0, volume=0, iv=25.0, ltp=1, spot_price=100, source="s", snapshot_status="complete", captured_at=captured_at),
                OptionChainRow(underlying="N", expiry="2026-09-24", strike=100.0, option_type="PE", oi=100, change_in_oi=0, volume=0, iv=25.0, ltp=1, spot_price=100, source="s", snapshot_status="complete", captured_at=captured_at)
            ],
            underlying="N",
            captured_at=captured_at,
            spot_price=100.0,
            historical_ivs=[10.0, 15.0, 20.0]
        )
        assert res_boundary_max["iv_percentile"] == 100.0
        assert res_boundary_max["iv_regime"] == "elevated_sell_options"

    def test_max_pain_strike_selection(self, synthetic_option_chain):
        rows = synthetic_option_chain["rows"]
        captured_at = synthetic_option_chain["captured_at"]

        res = compute_max_pain(
            option_rows=rows,
            underlying="NIFTY",
            captured_at=captured_at,
            spot_price=24520.0
        )

        assert res["max_pain_strike"] in [float(24000 + i * 100) for i in range(11)]
        # Based on our synthetic distribution, max pain settles between the major PE wall (24200) and CE wall (24800)
        assert 24300.0 <= res["max_pain_strike"] <= 24700.0
        assert "distance_from_spot_pct" in res

    def test_analytics_engine_full_cycle(self, synthetic_option_chain):
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=engine)

        analytics_engine = AnalyticsEngine(engine=engine)
        captured_at = synthetic_option_chain["captured_at"]
        opt_rows = synthetic_option_chain["rows"]
        fut_row = FuturesRow(
            underlying="NIFTY",
            expiry="2026-09-24",
            open=24500.0,
            high=24580.0,
            low=24460.0,
            close=24530.0,
            volume=80000,
            oi=1200000,
            source="angelone",
            snapshot_status="complete",
            captured_at=captured_at
        )

        res = analytics_engine.run_post_fetch(
            underlying="NIFTY",
            captured_at=captured_at,
            option_rows=opt_rows,
            futures_rows=[fut_row]
        )

        assert len(res["oi_walls"]) == 10  # 5 CE + 5 PE
        assert res["pcr"]["overall_pcr"] > 0
        assert res["futures_buildup"]["buildup_type"] in ["Long Buildup", "Short Buildup", "Short Covering", "Long Unwinding"]
        assert res["iv_metrics"]["atm_iv"] > 0
        assert res["max_pain"]["max_pain_strike"] > 0

        # Verify DB persistence in all 5 analytics tables
        with get_db_session(engine) as s:
            walls_count = s.query(AnalyticsOIWall).count()
            pcr_count = s.query(AnalyticsPCR).count()
            fut_count = s.query(AnalyticsFuturesBuildup).count()
            iv_count = s.query(AnalyticsIV).count()
            mp_count = s.query(AnalyticsMaxPain).count()

            assert walls_count == 10
            assert pcr_count == 1
            assert fut_count == 1
            assert iv_count == 1
            assert mp_count == 1
