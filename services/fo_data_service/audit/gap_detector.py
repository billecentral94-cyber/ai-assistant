"""
End-of-Day (EOD) Gap Detection and Snapshot Reconciliation Engine.
Reconciles expected trading slots against database captures per underlying and data-type.
"""

from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
import pytz
from sqlalchemy.orm import Session
from sqlalchemy import select, distinct, func

from config.settings import settings
from orchestrator.scheduler import get_trading_slots_for_date, is_trading_day, IST
from db.models import OptionChainSnapshot, FuturesSnapshot, GapLog, RetrievalAuditLog
from db.connection import get_db_session
from db.repository import DataRepository


class EODGapDetector:
    """
    Analyzes trading day coverage, detects missing intervals, and populates gap logs.
    """

    def __init__(self, repo: Optional[DataRepository] = None, engine=None):
        self.engine = engine
        self.repo = repo or DataRepository(engine=engine)

    def reconcile_day(
        self,
        trade_date: date,
        underlyings: Optional[List[str]] = None,
        interval_minutes: int = 15,
        session: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Performs end-of-day reconciliation for all underlyings across option_chain and futures.
        """
        if underlyings is None:
            underlyings = settings.UNDERLYINGS

        if not is_trading_day(trade_date):
            return {
                "trade_date": trade_date.isoformat(),
                "is_trading_day": False,
                "status": "skipped_non_trading_day",
                "underlyings": {}
            }

        expected_slots = get_trading_slots_for_date(trade_date, interval_minutes=interval_minutes)
        total_expected_per_type = len(expected_slots)

        def _execute(s: Session):
            reconciliation_result = {
                "trade_date": trade_date.isoformat(),
                "is_trading_day": True,
                "expected_slots_count": total_expected_per_type,
                "underlyings": {}
            }

            for sym in underlyings:
                sym = sym.upper()
                reconciliation_result["underlyings"][sym] = {
                    "option_chain": self._reconcile_channel(
                        s=s,
                        data_type="option_chain",
                        underlying=sym,
                        trade_date=trade_date,
                        expected_slots=expected_slots
                    ),
                    "futures": self._reconcile_channel(
                        s=s,
                        data_type="futures",
                        underlying=sym,
                        trade_date=trade_date,
                        expected_slots=expected_slots
                    )
                }

            return reconciliation_result

        if session:
            return _execute(session)
        with get_db_session(self.engine) as s:
            return _execute(s)

    def _reconcile_channel(
        self,
        s: Session,
        data_type: str,
        underlying: str,
        trade_date: date,
        expected_slots: List[datetime]
    ) -> Dict[str, Any]:
        """
        Reconciles a specific data channel for a given day.
        """
        start_day = datetime.combine(trade_date, datetime.min.time())
        end_day = datetime.combine(trade_date, datetime.max.time())

        # 1. Fetch captured timestamps from the main table
        captured_timestamps = set()
        if data_type == "option_chain":
            query = s.query(distinct(OptionChainSnapshot.captured_at)).filter(
                OptionChainSnapshot.underlying == underlying,
                OptionChainSnapshot.captured_at >= start_day,
                OptionChainSnapshot.captured_at <= end_day
            )
            for row in query.all():
                captured_timestamps.add(row[0])
        else:
            query = s.query(distinct(FuturesSnapshot.captured_at)).filter(
                FuturesSnapshot.underlying == underlying,
                FuturesSnapshot.captured_at >= start_day,
                FuturesSnapshot.captured_at <= end_day
            )
            for row in query.all():
                captured_timestamps.add(row[0])

        # 2. Fetch existing gap_log entries for this channel & date
        gaps_query = s.query(GapLog).filter(
            GapLog.data_type == data_type,
            GapLog.underlying == underlying,
            GapLog.expected_timestamp >= start_day,
            GapLog.expected_timestamp <= end_day
        )
        known_gaps = {g.expected_timestamp: g for g in gaps_query.all()}

        # 3. Identify missing slots and classify
        missing_slots = []
        unexplained_gaps = []
        newly_logged_gaps = []

        for slot in expected_slots:
            # Check if any captured timestamp matches this slot within a 2-minute tolerance
            is_captured = any(abs((c.astimezone(IST) - slot).total_seconds()) < 120 for c in captured_timestamps)

            if not is_captured:
                missing_slots.append(slot.isoformat())
                # Check if already recorded in gap_log
                matched_known_gap = any(abs((g_time.astimezone(IST) - slot).total_seconds()) < 120 for g_time in known_gaps)

                if not matched_known_gap:
                    # Unrecorded gap found -> Automatically log it as an unexplained gap
                    gap_obj = self.repo.record_gap(
                        data_type=data_type,
                        underlying=underlying,
                        expected_timestamp=slot,
                        reason="unexplained_gap",
                        details="Missing snapshot identified during EOD reconciliation",
                        session=s
                    )
                    unexplained_gaps.append(slot.isoformat())
                    newly_logged_gaps.append(gap_obj)

        # 4. Fetch audit log entries for fallback and dedup statistics
        audit_records = s.query(RetrievalAuditLog).filter(
            RetrievalAuditLog.data_type == data_type,
            RetrievalAuditLog.underlying == underlying,
            RetrievalAuditLog.run_timestamp >= start_day,
            RetrievalAuditLog.run_timestamp <= end_day
        ).all()

        fallback_count = sum(1 for a in audit_records if a.source_used == "fallback")
        total_deduped_rows = sum(a.rows_deduped for a in audit_records)
        total_captured_rows = sum(a.rows_captured for a in audit_records)

        captured_slots_count = len(expected_slots) - len(missing_slots)
        coverage_pct = (captured_slots_count / len(expected_slots) * 100.0) if expected_slots else 100.0

        # Determine severity
        if len(unexplained_gaps) > 0:
            severity = "CRITICAL"
        elif len(missing_slots) > 0:
            severity = "MAJOR"
        elif fallback_count > 0 or total_deduped_rows > 0:
            severity = "MINOR"
        else:
            severity = "OK"

        return {
            "expected_slots": len(expected_slots),
            "captured_slots": captured_slots_count,
            "missing_slots_count": len(missing_slots),
            "missing_timestamps": missing_slots,
            "unexplained_gaps_count": len(unexplained_gaps),
            "known_gaps_count": len(known_gaps),
            "coverage_pct": round(coverage_pct, 2),
            "fallback_cycles": fallback_count,
            "total_deduped_rows": total_deduped_rows,
            "total_captured_rows": total_captured_rows,
            "severity": severity
        }
