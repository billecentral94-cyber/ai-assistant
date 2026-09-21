"""
Audit Gate Test Suite for Phase F: Gap Detection & Daily Audit Report.
Simulates a full trading day with 1 intentional gap, verifying 100% snapshot accounting and zero unexplained discrepancies.
"""

from datetime import datetime, date, timedelta
import pytest
import pytz
from sqlalchemy import create_engine

from db.models import Base, OptionChainSnapshot, FuturesSnapshot, GapLog, RetrievalAuditLog
from db.connection import get_db_session
from db.repository import DataRepository
from orchestrator.scheduler import get_trading_slots_for_date, IST
from audit.gap_detector import EODGapDetector
from audit.reporter import DailyAuditReporter
from fetchers.base import OptionChainRow, FuturesRow


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    repo = DataRepository(engine=engine)
    return {"engine": engine, "repo": repo}


class TestPhaseFAuditGate:
    """Audit Gate F: Full trading day simulation with intentional gap accounting."""

    def test_full_trading_day_with_one_intentional_gap(self, test_db):
        engine = test_db["engine"]
        repo = test_db["repo"]
        trade_date = date(2026, 8, 26)  # Regular Wednesday trading day

        expected_slots = get_trading_slots_for_date(trade_date, interval_minutes=15)
        assert len(expected_slots) == 26  # Standard 26 intervals

        # Choose slot 12 (12:15 IST) as the intentional gap
        gap_slot_index = 12
        gap_timestamp = expected_slots[gap_slot_index]
        captured_slots = [s for idx, s in enumerate(expected_slots) if idx != gap_slot_index]

        assert len(captured_slots) == 25

        # 1. Populate database with 25 captured slots for NIFTY & BANKNIFTY
        for slot in captured_slots:
            # Insert Option Chain rows
            opt_rows = [
                OptionChainRow(
                    underlying="NIFTY",
                    expiry="2026-09-04",
                    strike=24000.0,
                    option_type="CE",
                    oi=50000,
                    change_in_oi=100,
                    volume=80000,
                    iv=14.0,
                    ltp=150.0,
                    spot_price=24150.0,
                    source="nsepython",
                    snapshot_status="complete",
                    captured_at=slot
                )
            ]
            repo.save_option_chain_snapshot(opt_rows, source_used="primary")

            # Insert Futures rows
            fut_rows = [
                FuturesRow(
                    underlying="NIFTY",
                    expiry="2026-09-24",
                    open=24100.0,
                    high=24200.0,
                    low=24050.0,
                    close=24150.0,
                    volume=300000,
                    oi=10000000,
                    source="angelone",
                    snapshot_status="complete",
                    captured_at=slot
                )
            ]
            repo.save_futures_snapshot(fut_rows, source_used="primary")

        # 2. Record the intentional gap at 12:15 IST in gap_log (simulate timeout during cycle)
        repo.record_gap(
            data_type="option_chain",
            underlying="NIFTY",
            expected_timestamp=gap_timestamp,
            reason="timeout",
            details="Simulated gateway timeout during live cycle"
        )
        repo.record_gap(
            data_type="futures",
            underlying="NIFTY",
            expected_timestamp=gap_timestamp,
            reason="timeout",
            details="Simulated gateway timeout during live cycle"
        )

        # 3. Run EOD Gap Detector
        gap_detector = EODGapDetector(repo=repo, engine=engine)
        recon = gap_detector.reconcile_day(trade_date=trade_date, underlyings=["NIFTY"])

        nifty_opt = recon["underlyings"]["NIFTY"]["option_chain"]
        assert nifty_opt["expected_slots"] == 26
        assert nifty_opt["captured_slots"] == 25
        assert nifty_opt["missing_slots_count"] == 1
        assert nifty_opt["unexplained_gaps_count"] == 0  # Was known in gap_log
        assert nifty_opt["coverage_pct"] == round(25 / 26 * 100, 2)
        assert nifty_opt["severity"] == "MAJOR"

        # 4. Generate Daily Audit Report
        reporter = DailyAuditReporter(gap_detector=gap_detector, repo=repo, engine=engine)
        report = reporter.generate_report(trade_date=trade_date, underlyings=["NIFTY"])

        assert report["total_expected"] == 52  # 26 options + 26 futures
        assert report["total_captured"] == 50  # 25 options + 25 futures
        assert report["total_missing"] == 2    # 1 option gap + 1 future gap (at 12:15 IST)

        # Verify 100% accounting: Total Captured + Total Missing == Total Expected
        assert report["total_captured"] + report["total_missing"] == report["total_expected"]

        # Confirm report text details the exact missing interval
        assert "12:15:00" in report["report_text"]
        assert "Daily F&O Data Retrieval Audit" in report["report_text"]

        # 5. Confirm EOD reconciliation is persisted in retrieval_audit_log
        with get_db_session(engine) as s:
            eod_audit = s.query(RetrievalAuditLog).filter_by(data_type="eod_reconciliation").first()
            assert eod_audit is not None
            assert eod_audit.rows_expected == 52
            assert eod_audit.rows_captured == 50
            assert eod_audit.severity == "MAJOR"
