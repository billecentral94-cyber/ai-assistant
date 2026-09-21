"""
Comprehensive Audit Gate H Test Suite: Signal Generator & Risk Engine.
Validates confluence-based signal triggering, capital protection rules,
daily loss kill switches, drawdown circuit breakers, and hedged strategy selection.
"""

from datetime import datetime
import pytest
from strategy.signal_generator import SignalGenerator, Signal
from strategy.risk_manager import RiskManager
from strategy.trade_recommender import recommend_hedged_strategy


class TestSignalGeneratorAuditGate:
    """Audit Gate H: Verifies signal confluence and strict risk limits."""

    @pytest.fixture
    def setup_engines(self):
        risk_mgr = RiskManager(
            max_risk_per_trade_pct=1.5,
            daily_loss_limit_pct=2.0,
            max_drawdown_limit_pct=8.0
        )
        sig_gen = SignalGenerator(risk_manager=risk_mgr)
        return {"risk_mgr": risk_mgr, "sig_gen": sig_gen}

    def test_bullish_confluence_3_of_5(self, setup_engines):
        sig_gen = setup_engines["sig_gen"]

        # 4 Bullish factors: Long Buildup, High PCR, Spot > Max Pain, IV pctl < 50
        buildup = {"buildup_type": "Long Buildup"}
        pcr = {"overall_pcr": 1.25, "pcr_trend": "rising", "sentiment_zone": "neutral"}
        max_pain = {"max_pain_strike": 24300.0}
        iv = {"iv_percentile": 35.0, "iv_regime": "normal"}
        oi_walls = [
            {"strike": 24200.0, "option_type": "PE", "wall_rank": 1},
            {"strike": 24800.0, "option_type": "CE", "wall_rank": 1}
        ]

        signal = sig_gen.generate_signal(
            underlying="NIFTY",
            spot_price=24500.0,
            oi_walls=oi_walls,
            pcr_data=pcr,
            buildup_data=buildup,
            iv_data=iv,
            max_pain_data=max_pain,
            account_capital=500000.0
        )

        assert signal.direction == "BULLISH"
        assert signal.is_actionable is True
        assert signal.confluence_score >= 3
        assert len(signal.confluences_triggered) >= 3
        assert signal.entry_price == 24500.0
        assert signal.stop_loss < signal.entry_price
        assert signal.target_1 > signal.entry_price
        assert signal.recommended_strategy["bias"] == "Bullish"
        assert signal.recommended_strategy["max_loss_defined"] is True

    def test_bearish_confluence_3_of_5(self, setup_engines):
        sig_gen = setup_engines["sig_gen"]

        # 4 Bearish factors: Short Buildup, Low PCR, Spot < Max Pain, IV pctl < 50
        buildup = {"buildup_type": "Short Buildup"}
        pcr = {"overall_pcr": 0.68, "pcr_trend": "falling", "sentiment_zone": "overbought_bearish"}
        max_pain = {"max_pain_strike": 24700.0}
        iv = {"iv_percentile": 42.0, "iv_regime": "normal"}
        oi_walls = [
            {"strike": 24800.0, "option_type": "CE", "wall_rank": 1},
            {"strike": 24100.0, "option_type": "PE", "wall_rank": 1}
        ]

        signal = sig_gen.generate_signal(
            underlying="NIFTY",
            spot_price=24500.0,
            oi_walls=oi_walls,
            pcr_data=pcr,
            buildup_data=buildup,
            iv_data=iv,
            max_pain_data=max_pain,
            account_capital=500000.0
        )

        assert signal.direction == "BEARISH"
        assert signal.is_actionable is True
        assert signal.confluence_score >= 3
        assert signal.stop_loss > signal.entry_price
        assert signal.target_1 < signal.entry_price
        assert signal.recommended_strategy["bias"] == "Bearish"
        assert signal.recommended_strategy["max_loss_defined"] is True

    def test_no_signal_on_insufficient_confluence(self, setup_engines):
        sig_gen = setup_engines["sig_gen"]

        # Mixed conflicting signals (1 bullish, 1 bearish, neither reaching 3)
        buildup = {"buildup_type": "Short Covering"}  # mild bullish
        pcr = {"overall_pcr": 0.82, "pcr_trend": "falling", "sentiment_zone": "neutral"} # mild bearish
        max_pain = {"max_pain_strike": 24500.0}
        iv = {"iv_percentile": 85.0, "iv_regime": "elevated_sell_options"} # high IV
        oi_walls = []

        signal = sig_gen.generate_signal(
            underlying="NIFTY",
            spot_price=24500.0,
            oi_walls=oi_walls,
            pcr_data=pcr,
            buildup_data=buildup,
            iv_data=iv,
            max_pain_data=max_pain,
            account_capital=500000.0
        )

        assert signal.direction == "NEUTRAL"
        assert signal.is_actionable is False
        assert signal.confluence_score < 3

    def test_position_sizing_never_exceeds_1_5_pct(self, setup_engines):
        risk_mgr = setup_engines["risk_mgr"]

        capitals = [50000.0, 100000.0, 500000.0, 2000000.0]
        loss_per_lot_values = [1200.0, 2500.0, 4000.0, 7500.0]

        for cap in capitals:
            for loss_per_lot in loss_per_lot_values:
                sizing = risk_mgr.calculate_position_size(
                    account_capital=cap,
                    max_loss_per_lot=loss_per_lot,
                    lot_size=25
                )

                # Hard constraint: Risk in rupees must NEVER exceed 1.5% of capital
                max_allowed_rupees = cap * 0.015
                assert sizing["allocated_risk_rupees"] <= max_allowed_rupees
                assert sizing["risk_pct"] <= 1.50

    def test_daily_loss_kill_switch(self, setup_engines):
        risk_mgr = setup_engines["risk_mgr"]
        capital = 500000.0

        # Loss within limit (1% = ₹5,000) -> Allowed
        allowed, reason = risk_mgr.check_trade_allowed(
            account_capital=capital,
            current_open_positions=1,
            daily_realized_loss=-5000.0,
            current_drawdown_pct=1.0
        )
        assert allowed is True
        assert reason == "APPROVED"
        assert risk_mgr.kill_switch_active is False

        # Loss hits 2% limit (₹10,000) -> Kill switch activates
        allowed, reason = risk_mgr.check_trade_allowed(
            account_capital=capital,
            current_open_positions=1,
            daily_realized_loss=-10500.0, # 2.1% loss
            current_drawdown_pct=2.1
        )
        assert allowed is False
        assert "Kill Switch" in reason
        assert risk_mgr.kill_switch_active is True

    def test_drawdown_circuit_breaker(self, setup_engines):
        risk_mgr = setup_engines["risk_mgr"]
        capital = 500000.0

        # Normal drawdown (3%) -> Allowed
        allowed, _ = risk_mgr.check_trade_allowed(
            account_capital=capital,
            current_open_positions=1,
            daily_realized_loss=0.0,
            current_drawdown_pct=3.0
        )
        assert allowed is True

        # Severe drawdown (8.5% >= 8.0%) -> Observation Mode triggered
        allowed, reason = risk_mgr.check_trade_allowed(
            account_capital=capital,
            current_open_positions=1,
            daily_realized_loss=0.0,
            current_drawdown_pct=8.5
        )
        assert allowed is False
        assert "Observation Mode" in reason
        assert risk_mgr.observation_mode_active is True

    def test_hedged_strategy_selection(self):
        spot = 24500.0

        # 1. Bullish + Low/Normal IV -> Bull Call Spread (Debit)
        s1 = recommend_hedged_strategy("BULLISH", "cheap_buy_options", spot, step_size=50.0)
        assert s1["strategy_name"] == "Bull Call Spread"
        assert s1["strategy_type"] == "Debit Spread"
        assert s1["max_loss_defined"] is True

        # 2. Bullish + High IV -> Bull Put Spread (Credit)
        s2 = recommend_hedged_strategy("BULLISH", "elevated_sell_options", spot, step_size=50.0)
        assert s2["strategy_name"] == "Bull Put Spread"
        assert s2["strategy_type"] == "Credit Spread"
        assert s2["max_loss_defined"] is True

        # 3. Bearish + Low/Normal IV -> Bear Put Spread (Debit)
        s3 = recommend_hedged_strategy("BEARISH", "cheap_buy_options", spot, step_size=50.0)
        assert s3["strategy_name"] == "Bear Put Spread"
        assert s3["strategy_type"] == "Debit Spread"
        assert s3["max_loss_defined"] is True

        # 4. Bearish + High IV -> Bear Call Spread (Credit)
        s4 = recommend_hedged_strategy("BEARISH", "elevated_sell_options", spot, step_size=50.0)
        assert s4["strategy_name"] == "Bear Call Spread"
        assert s4["strategy_type"] == "Credit Spread"
        assert s4["max_loss_defined"] is True

        # 5. Neutral + High IV -> Iron Condor
        s5 = recommend_hedged_strategy("NEUTRAL", "elevated_sell_options", spot, step_size=50.0)
        assert s5["strategy_name"] == "Iron Condor"
        assert s5["max_loss_defined"] is True
        assert len(s5["legs"]) == 4
