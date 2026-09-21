"""
Data Repository with DB-Level Dedup (ON CONFLICT DO NOTHING) and Audit Logging.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from dateutil import parser as date_parser
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from db.models import OptionChainSnapshot, FuturesSnapshot, GapLog, RetrievalAuditLog
from db.connection import get_db_session
from fetchers.base import OptionChainRow, FuturesRow


def now_utc():
    return datetime.now(timezone.utc)


class DataRepository:
    """Handles persistence, deduplication, and gap/audit logging."""

    def __init__(self, engine=None):
        self.engine = engine

    def record_gap(
        self,
        data_type: str,
        underlying: str,
        expected_timestamp: datetime,
        reason: str,
        details: Optional[str] = None,
        retry_count: int = 0,
        session: Optional[Session] = None
    ) -> GapLog:
        """Records a missing or failed snapshot cycle into gap_log."""
        def _execute(s: Session):
            gap_entry = GapLog(
                data_type=data_type,
                underlying=underlying,
                expected_timestamp=expected_timestamp,
                reason=reason,
                details=details,
                retry_count=retry_count,
                resolved=False,
                created_at=now_utc()
            )
            s.add(gap_entry)
            s.flush()
            return gap_entry

        if session:
            return _execute(session)
        with get_db_session(self.engine) as s:
            return _execute(s)

    def record_audit(
        self,
        run_timestamp: datetime,
        data_type: str,
        underlying: str,
        rows_expected: int,
        rows_captured: int,
        rows_rejected: int,
        rows_deduped: int,
        source_used: str,
        severity: str,
        message: Optional[str] = None,
        session: Optional[Session] = None
    ) -> RetrievalAuditLog:
        """Records an execution cycle audit into retrieval_audit_log."""
        def _execute(s: Session):
            audit_entry = RetrievalAuditLog(
                run_timestamp=run_timestamp,
                data_type=data_type,
                underlying=underlying,
                rows_expected=rows_expected,
                rows_captured=rows_captured,
                rows_rejected_incomplete=rows_rejected,
                rows_deduped=rows_deduped,
                source_used=source_used,
                severity=severity,
                message=message,
                created_at=now_utc()
            )
            s.add(audit_entry)
            s.flush()
            return audit_entry

        if session:
            return _execute(session)
        with get_db_session(self.engine) as s:
            return _execute(s)

    def save_option_chain_snapshot(
        self,
        rows: List[OptionChainRow],
        source_used: str = "primary",
        session: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Saves option chain rows into option_chain_snapshots with ON CONFLICT DO NOTHING.
        Computes exact inserted vs deduplicated rows and logs to retrieval_audit_log.
        """
        if not rows:
            return {"inserted": 0, "deduped": 0, "status": "empty"}

        underlying = rows[0].underlying
        captured_at = rows[0].captured_at
        expected_count = len(rows)

        def _execute(s: Session):
            inserted_count = 0
            deduped_count = 0

            is_postgres = s.bind.dialect.name == "postgresql"

            if is_postgres:
                values = [
                    {
                        "underlying": r.underlying,
                        "expiry": date_parser.parse(r.expiry).date(),
                        "strike": r.strike,
                        "option_type": r.option_type,
                        "oi": r.oi,
                        "change_in_oi": r.change_in_oi,
                        "volume": r.volume,
                        "iv": r.iv,
                        "ltp": r.ltp,
                        "spot_price": r.spot_price,
                        "source": r.source,
                        "snapshot_status": r.snapshot_status,
                        "captured_at": r.captured_at,
                    }
                    for r in rows
                ]
                stmt = pg_insert(OptionChainSnapshot).values(values)
                stmt = stmt.on_conflict_do_nothing(
                    constraint="uq_option_chain_snapshot"
                )
                res = s.execute(stmt)
                inserted_count = res.rowcount if res.rowcount is not None and res.rowcount >= 0 else len(rows)
                deduped_count = expected_count - inserted_count
            else:
                # SQLite / test fallback:
                for r in rows:
                    exp_date = date_parser.parse(r.expiry).date()
                    existing = s.query(OptionChainSnapshot).filter_by(
                        underlying=r.underlying,
                        expiry=exp_date,
                        strike=r.strike,
                        option_type=r.option_type,
                        captured_at=r.captured_at
                    ).first()

                    if existing is None:
                        obj = OptionChainSnapshot(
                            underlying=r.underlying,
                            expiry=exp_date,
                            strike=r.strike,
                            option_type=r.option_type,
                            oi=r.oi,
                            change_in_oi=r.change_in_oi,
                            volume=r.volume,
                            iv=r.iv,
                            ltp=r.ltp,
                            spot_price=r.spot_price,
                            source=r.source,
                            snapshot_status=r.snapshot_status,
                            captured_at=r.captured_at
                        )
                        s.add(obj)
                        inserted_count += 1
                    else:
                        deduped_count += 1

            s.flush()
            severity = "OK" if deduped_count == 0 else "MINOR"
            msg = f"Captured {inserted_count} rows, deduped {deduped_count} duplicate rows"

            self.record_audit(
                run_timestamp=captured_at,
                data_type="option_chain",
                underlying=underlying,
                rows_expected=expected_count,
                rows_captured=inserted_count,
                rows_rejected=0,
                rows_deduped=deduped_count,
                source_used=source_used,
                severity=severity,
                message=msg,
                session=s
            )

            return {
                "underlying": underlying,
                "expected": expected_count,
                "inserted": inserted_count,
                "deduped": deduped_count,
                "status": "complete"
            }

        if session:
            return _execute(session)
        with get_db_session(self.engine) as s:
            return _execute(s)

    def save_futures_snapshot(
        self,
        rows: List[FuturesRow],
        source_used: str = "primary",
        session: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Saves futures rows into futures_snapshots with ON CONFLICT DO NOTHING.
        """
        if not rows:
            return {"inserted": 0, "deduped": 0, "status": "empty"}

        underlying = rows[0].underlying
        captured_at = rows[0].captured_at
        expected_count = len(rows)

        def _execute(s: Session):
            inserted_count = 0
            deduped_count = 0
            is_postgres = s.bind.dialect.name == "postgresql"

            if is_postgres:
                values = [
                    {
                        "underlying": r.underlying,
                        "expiry": date_parser.parse(r.expiry).date(),
                        "open": r.open,
                        "high": r.high,
                        "low": r.low,
                        "close": r.close,
                        "volume": r.volume,
                        "oi": r.oi,
                        "source": r.source,
                        "snapshot_status": r.snapshot_status,
                        "captured_at": r.captured_at
                    }
                    for r in rows
                ]
                stmt = pg_insert(FuturesSnapshot).values(values)
                stmt = stmt.on_conflict_do_nothing(
                    constraint="uq_futures_snapshot"
                )
                res = s.execute(stmt)
                inserted_count = res.rowcount if res.rowcount is not None and res.rowcount >= 0 else len(rows)
                deduped_count = expected_count - inserted_count
            else:
                for r in rows:
                    exp_date = date_parser.parse(r.expiry).date()
                    existing = s.query(FuturesSnapshot).filter_by(
                        underlying=r.underlying,
                        expiry=exp_date,
                        captured_at=r.captured_at
                    ).first()

                    if existing is None:
                        obj = FuturesSnapshot(
                            underlying=r.underlying,
                            expiry=exp_date,
                            open=r.open,
                            high=r.high,
                            low=r.low,
                            close=r.close,
                            volume=r.volume,
                            oi=r.oi,
                            source=r.source,
                            snapshot_status=r.snapshot_status,
                            captured_at=r.captured_at
                        )
                        s.add(obj)
                        inserted_count += 1
                    else:
                        deduped_count += 1

            s.flush()
            severity = "OK" if deduped_count == 0 else "MINOR"
            msg = f"Captured {inserted_count} futures rows, deduped {deduped_count} rows"

            self.record_audit(
                run_timestamp=captured_at,
                data_type="futures",
                underlying=underlying,
                rows_expected=expected_count,
                rows_captured=inserted_count,
                rows_rejected=0,
                rows_deduped=deduped_count,
                source_used=source_used,
                severity=severity,
                message=msg,
                session=s
            )

            return {
                "underlying": underlying,
                "expected": expected_count,
                "inserted": inserted_count,
                "deduped": deduped_count,
                "status": "complete"
            }

        if session:
            return _execute(session)
        with get_db_session(self.engine) as s:
            return _execute(s)
