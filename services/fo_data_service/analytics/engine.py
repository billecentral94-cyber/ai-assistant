"""
Analytics Orchestrator Engine.
Coordinates post-fetch execution of all analytical models and persists metrics to the database.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc

from db.models import (
    AnalyticsOIWall,
    AnalyticsPCR,
    AnalyticsFuturesBuildup,
    AnalyticsIV,
    AnalyticsMaxPain,
    OptionChainSnapshot,
    FuturesSnapshot,
)
from db.connection import get_db_session, get_engine
from .oi_analyzer import compute_oi_walls
from .pcr_calculator import compute_pcr
from .futures_buildup import classify_buildup
from .iv_analyzer import compute_iv_metrics
from .max_pain import compute_max_pain

logger = logging.getLogger(__name__)


class AnalyticsEngine:
    """Orchestrates F&O analytics post-fetch computation and database persistence."""

    def __init__(self, engine=None):
        self.engine = engine or get_engine()

    def run_post_fetch(
        self,
        underlying: str,
        captured_at: datetime,
        option_rows: Optional[List[Any]] = None,
        futures_rows: Optional[List[Any]] = None
    ) -> Dict[str, Any]:
        """
        Executes all analytics algorithms on freshly retrieved market data.
        """
        results = {
            "underlying": underlying,
            "captured_at": captured_at,
            "oi_walls": [],
            "pcr": {},
            "futures_buildup": {},
            "iv_metrics": {},
            "max_pain": {}
        }

        with get_db_session(self.engine) as session:
            # 1. Option Chain Analytics
            if option_rows and len(option_rows) > 0:
                spot_price = float(getattr(option_rows[0], "spot_price", 0.0) if not isinstance(option_rows[0], dict) else option_rows[0].get("spot_price", 0.0))

                # Fetch prior walls for shift detection
                prev_walls_db = (
                    session.query(AnalyticsOIWall)
                    .filter_by(underlying=underlying)
                    .order_by(desc(AnalyticsOIWall.captured_at))
                    .limit(10)
                    .all()
                )
                prev_walls_list = [
                    {"strike": float(w.strike), "option_type": w.option_type, "wall_rank": w.wall_rank}
                    for w in prev_walls_db
                ]

                # A. OI Walls
                walls = compute_oi_walls(
                    option_rows=option_rows,
                    underlying=underlying,
                    captured_at=captured_at,
                    prev_walls=prev_walls_list,
                    top_n=5
                )
                for w in walls:
                    session.add(AnalyticsOIWall(**w))
                results["oi_walls"] = walls

                # B. PCR & Trend
                prior_pcrs_db = (
                    session.query(AnalyticsPCR.overall_pcr)
                    .filter_by(underlying=underlying)
                    .order_by(desc(AnalyticsPCR.captured_at))
                    .limit(5)
                    .all()
                )
                prior_pcrs = [float(p[0]) for p in reversed(prior_pcrs_db)]
                pcr_data = compute_pcr(
                    option_rows=option_rows,
                    underlying=underlying,
                    captured_at=captured_at,
                    spot_price=spot_price,
                    prior_pcr_values=prior_pcrs
                )
                session.add(AnalyticsPCR(**pcr_data))
                results["pcr"] = pcr_data

                # C. IV Metrics
                prior_ivs_db = (
                    session.query(AnalyticsIV.atm_iv)
                    .filter_by(underlying=underlying)
                    .order_by(desc(AnalyticsIV.captured_at))
                    .limit(30)
                    .all()
                )
                prior_ivs = [float(iv[0]) for iv in prior_ivs_db]
                iv_data = compute_iv_metrics(
                    option_rows=option_rows,
                    underlying=underlying,
                    captured_at=captured_at,
                    spot_price=spot_price,
                    historical_ivs=prior_ivs
                )
                session.add(AnalyticsIV(**iv_data))
                results["iv_metrics"] = iv_data

                # D. Max Pain
                max_pain_data = compute_max_pain(
                    option_rows=option_rows,
                    underlying=underlying,
                    captured_at=captured_at,
                    spot_price=spot_price
                )
                session.add(AnalyticsMaxPain(**max_pain_data))
                results["max_pain"] = max_pain_data

            # 2. Futures Analytics
            if futures_rows and len(futures_rows) > 0:
                current_fut = futures_rows[0]
                prev_fut_db = (
                    session.query(FuturesSnapshot)
                    .filter(
                        FuturesSnapshot.underlying == underlying,
                        FuturesSnapshot.captured_at < captured_at
                    )
                    .order_by(desc(FuturesSnapshot.captured_at))
                    .first()
                )
                buildup_data = classify_buildup(
                    current_row=current_fut,
                    prev_row=prev_fut_db
                )
                session.add(AnalyticsFuturesBuildup(**buildup_data))
                results["futures_buildup"] = buildup_data

            session.commit()

        logger.info(f"Analytics computed and persisted for {underlying} at {captured_at}")
        return results

    def get_latest_analytics(self, underlying: str) -> Dict[str, Any]:
        """
        Query DB for the latest computed analytics for signal generation.
        Returns a dict with oi_walls, pcr_data, buildup_data, iv_data, max_pain_data, spot_price.
        """
        result: Dict[str, Any] = {
            "oi_walls": [],
            "pcr_data": {},
            "buildup_data": {},
            "iv_data": {},
            "max_pain_data": {},
            "spot_price": 0.0
        }

        with get_db_session(self.engine) as session:
            # Latest OI Walls (top 10 from most recent snapshot)
            walls = (
                session.query(AnalyticsOIWall)
                .filter_by(underlying=underlying)
                .order_by(desc(AnalyticsOIWall.captured_at))
                .limit(10)
                .all()
            )
            result["oi_walls"] = [
                {
                    "strike": float(w.strike),
                    "option_type": w.option_type,
                    "oi": w.oi,
                    "wall_rank": w.wall_rank
                }
                for w in walls
            ]

            # Latest PCR
            pcr = (
                session.query(AnalyticsPCR)
                .filter_by(underlying=underlying)
                .order_by(desc(AnalyticsPCR.captured_at))
                .first()
            )
            if pcr:
                result["pcr_data"] = {
                    "overall_pcr": float(pcr.overall_pcr),
                    "pcr_trend": pcr.pcr_trend,
                    "sentiment_zone": pcr.sentiment_zone
                }

            # Latest Futures Buildup
            buildup = (
                session.query(AnalyticsFuturesBuildup)
                .filter_by(underlying=underlying)
                .order_by(desc(AnalyticsFuturesBuildup.captured_at))
                .first()
            )
            if buildup:
                result["buildup_data"] = {
                    "buildup_type": buildup.buildup_type,
                    "confidence_pct": float(buildup.confidence_pct)
                }

            # Latest IV
            iv = (
                session.query(AnalyticsIV)
                .filter_by(underlying=underlying)
                .order_by(desc(AnalyticsIV.captured_at))
                .first()
            )
            if iv:
                result["iv_data"] = {
                    "iv_percentile": float(iv.iv_percentile) if iv.iv_percentile else 50.0,
                    "iv_regime": iv.iv_regime
                }

            # Latest Max Pain
            mp = (
                session.query(AnalyticsMaxPain)
                .filter_by(underlying=underlying)
                .order_by(desc(AnalyticsMaxPain.captured_at))
                .first()
            )
            if mp:
                result["max_pain_data"] = {
                    "max_pain_strike": float(mp.max_pain_strike)
                }
                result["spot_price"] = float(mp.spot_price)

            # Fallback spot price from option chain if max pain has none
            if result["spot_price"] == 0:
                opt = (
                    session.query(OptionChainSnapshot.spot_price)
                    .filter_by(underlying=underlying)
                    .order_by(desc(OptionChainSnapshot.captured_at))
                    .first()
                )
                if opt:
                    result["spot_price"] = float(opt[0])

        return result

    def get_market_context(self, underlying: str) -> Dict[str, Any]:
        """
        Computes intraday market context for chop/VWAP filtering.
        Returns:
            rolling_range: High - Low of underlying over recent snapshots (30-min proxy)
            session_vwap_bias: 'ABOVE' if spot > session midpoint, 'BELOW' if spot < midpoint, 'NEUTRAL' otherwise
            chop_detected: True if range is below threshold (BN < 80, Nifty < 40)
            spot_price: latest spot
            session_high / session_low / session_open: intraday OHLC from futures snapshots
        """
        from datetime import timedelta
        context: Dict[str, Any] = {
            "rolling_range": 0.0,
            "session_vwap_bias": "NEUTRAL",
            "chop_detected": False,
            "spot_price": 0.0,
            "session_high": 0.0,
            "session_low": 0.0,
            "session_open": 0.0,
        }

        chop_threshold = 40.0 if underlying.upper() == "NIFTY" else 80.0

        with get_db_session(self.engine) as session:
            today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

            # Get all today's futures snapshots for intraday H/L/O
            today_futures = (
                session.query(FuturesSnapshot)
                .filter(
                    FuturesSnapshot.underlying == underlying,
                    FuturesSnapshot.captured_at >= today_start
                )
                .order_by(FuturesSnapshot.captured_at)
                .all()
            )

            if today_futures:
                # Session open = first snapshot's open price
                context["session_open"] = float(today_futures[0].open)

                # Intraday high = max of all highs, low = min of all lows
                all_highs = [float(f.high) for f in today_futures]
                all_lows = [float(f.low) for f in today_futures if float(f.low) > 0]
                context["session_high"] = max(all_highs) if all_highs else 0.0
                context["session_low"] = min(all_lows) if all_lows else 0.0

                # Latest close as spot
                latest = today_futures[-1]
                context["spot_price"] = float(latest.close)

                # Rolling range from recent 2 snapshots (approx 30 min with 15-min cycles)
                recent = today_futures[-2:] if len(today_futures) >= 2 else today_futures
                recent_high = max(float(f.high) for f in recent)
                recent_low = min(float(f.low) for f in recent if float(f.low) > 0)
                context["rolling_range"] = round(recent_high - recent_low, 2)

                # VWAP proxy: simple midpoint of session range, compare spot
                session_mid = (context["session_high"] + context["session_low"]) / 2.0
                spot = context["spot_price"]
                if session_mid > 0:
                    if spot > session_mid:
                        context["session_vwap_bias"] = "ABOVE"
                    elif spot < session_mid:
                        context["session_vwap_bias"] = "BELOW"

            # Fallback: use option chain spot if no futures data
            if context["spot_price"] == 0:
                opt = (
                    session.query(OptionChainSnapshot.spot_price)
                    .filter_by(underlying=underlying)
                    .order_by(desc(OptionChainSnapshot.captured_at))
                    .first()
                )
                if opt:
                    context["spot_price"] = float(opt[0])

            # Chop detection
            if context["rolling_range"] > 0:
                context["chop_detected"] = context["rolling_range"] < chop_threshold
            else:
                # Not enough data to determine range (first cycle of day) — allow trading
                context["chop_detected"] = False

        return context

