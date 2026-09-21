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
