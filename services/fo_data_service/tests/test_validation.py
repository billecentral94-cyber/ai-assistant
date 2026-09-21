"""
Audit Gate Test Suite for Phase D: Validation Layer & Zero-Error Persistence.
Tests malformed/partial payload rejection, database isolation, ON CONFLICT dedup, and gap logging.
"""

from datetime import datetime, date
import pytest
import pytz
from sqlalchemy import create_engine, select, func

from db.models import Base, OptionChainSnapshot, FuturesSnapshot, GapLog, RetrievalAuditLog
from db.connection import init_db, get_db_session
from db.repository import DataRepository
from orchestrator.validator import validate_option_chain_batch, validate_futures_batch
from fetchers.base import OptionChainRow, FuturesRow

IST = pytz.timezone("Asia/Kolkata")


@pytest.fixture
def test_db():
    """Provides a fresh in-memory SQLite database for isolated test runs."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    repo = DataRepository(engine=engine)
    return {"engine": engine, "repo": repo}


def make_valid_opt_rows(underlying="NIFTY", count=15, timestamp=None):
    if timestamp is None:
        timestamp = datetime.now(IST)
    rows = []
    for i in range(count):
        strike = 24000.0 + (i * 50)
        rows.append(OptionChainRow(
            underlying=underlying,
            expiry="2026-09-04",
            strike=strike,
            option_type="CE",
            oi=50000 + (100 * i),
            change_in_oi=500,
            volume=80000,
            iv=14.5,
            ltp=150.0,
            spot_price=24200.0,
            source="nsepython",
            snapshot_status="complete",
            captured_at=timestamp
        ))
        rows.append(OptionChainRow(
            underlying=underlying,
            expiry="2026-09-04",
            strike=strike,
            option_type="PE",
            oi=60000 + (100 * i),
            change_in_oi=-200,
            volume=95000,
            iv=15.2,
            ltp=120.0,
            spot_price=24200.0,
            source="nsepython",
            snapshot_status="complete",
            captured_at=timestamp
        ))
    return rows


class TestOptionChainValidation:
    """Validates rejection of malformed/partial option chain rows."""

    def test_valid_batch_passes(self):
        rows = make_valid_opt_rows()
        res = validate_option_chain_batch(rows, "NIFTY")
        assert res.is_valid is True
        assert len(res.errors) == 0

    def test_reject_null_ltp(self, test_db):
        rows = make_valid_opt_rows()
        rows[3].ltp = None  # type: ignore

        res = validate_option_chain_batch(rows, "NIFTY")
        assert res.is_valid is False
        assert any("Invalid LTP" in err for err in res.errors)

        # Confirm zero rows reach database on validation failure
        repo = test_db["repo"]
        engine = test_db["engine"]
        if not res.is_valid:
            repo.record_gap(
                data_type="option_chain",
                underlying="NIFTY",
                expected_timestamp=rows[0].captured_at,
                reason="validation_error",
                details="; ".join(res.errors)
            )

        with get_db_session(engine) as s:
            snap_count = s.query(OptionChainSnapshot).count()
            gap_count = s.query(GapLog).count()
            assert snap_count == 0, "No bad row should ever be inserted in main table"
            assert gap_count == 1, "Validation failure must be logged in gap_log"

    def test_reject_invalid_strike(self):
        rows = make_valid_opt_rows()
        rows[0].strike = -50.0
        res = validate_option_chain_batch(rows, "NIFTY")
        assert res.is_valid is False
        assert any("Invalid strike" in err for err in res.errors)

    def test_reject_invalid_spot(self):
        rows = make_valid_opt_rows()
        for r in rows:
            r.spot_price = 0.0
        res = validate_option_chain_batch(rows, "NIFTY")
        assert res.is_valid is False
        assert any("Invalid spot price" in err for err in res.errors)

    def test_reject_insufficient_strikes(self):
        rows = make_valid_opt_rows(count=3)  # Only 3 strikes, minimum required is 10
        res = validate_option_chain_batch(rows, "NIFTY", min_strikes_required=10)
        assert res.is_valid is False
        assert any("Insufficient unique strikes" in err for err in res.errors)


class TestFuturesValidation:
    """Validates rejection of malformed/partial futures rows."""

    def test_valid_futures_passes(self):
        rows = [
            FuturesRow(
                underlying="NIFTY",
                expiry="2026-09-24",
                open=24200.0,
                high=24300.0,
                low=24150.0,
                close=24250.0,
                volume=500000,
                oi=12000000,
                source="angelone",
                snapshot_status="complete",
                captured_at=datetime.now(IST)
            )
        ]
        res = validate_futures_batch(rows, "NIFTY")
        assert res.is_valid is True

    def test_reject_high_less_than_low(self, test_db):
        rows = [
            FuturesRow(
                underlying="NIFTY",
                expiry="2026-09-24",
                open=24200.0,
                high=24100.0,  # Invalid: High < Low
                low=24150.0,
                close=24250.0,
                volume=500000,
                oi=12000000,
                source="angelone",
                snapshot_status="complete",
                captured_at=datetime.now(IST)
            )
        ]
        res = validate_futures_batch(rows, "NIFTY")
        assert res.is_valid is False
        assert any("High (24100.0) cannot be less than Low" in err for err in res.errors)

        repo = test_db["repo"]
        engine = test_db["engine"]
        repo.record_gap(
            data_type="futures",
            underlying="NIFTY",
            expected_timestamp=rows[0].captured_at,
            reason="validation_error",
            details="; ".join(res.errors)
        )

        with get_db_session(engine) as s:
            assert s.query(FuturesSnapshot).count() == 0
            assert s.query(GapLog).count() == 1


class TestDeduplicationAndAuditTrail:
    """Tests ON CONFLICT DO NOTHING and audit logging."""

    def test_option_chain_deduplication(self, test_db):
        repo = test_db["repo"]
        engine = test_db["engine"]
        captured_time = datetime.now(IST)
        rows = make_valid_opt_rows(count=15, timestamp=captured_time)

        # 1. First save: all rows should be inserted
        res1 = repo.save_option_chain_snapshot(rows, source_used="primary")
        assert res1["inserted"] == len(rows)
        assert res1["deduped"] == 0

        with get_db_session(engine) as s:
            assert s.query(OptionChainSnapshot).count() == len(rows)
            audit1 = s.query(RetrievalAuditLog).filter_by(data_type="option_chain").first()
            assert audit1 is not None
            assert audit1.rows_captured == len(rows)
            assert audit1.rows_deduped == 0
            assert audit1.severity == "OK"

        # 2. Re-save identical rows with same timestamp (simulate duplicate cycle)
        res2 = repo.save_option_chain_snapshot(rows, source_used="primary")
        assert res2["inserted"] == 0
        assert res2["deduped"] == len(rows)

        # DB count must remain exactly the same (Zero Duplicate Rows rule)
        with get_db_session(engine) as s:
            assert s.query(OptionChainSnapshot).count() == len(rows)
            audits = s.query(RetrievalAuditLog).filter_by(data_type="option_chain").all()
            assert len(audits) == 2
            assert audits[1].rows_deduped == len(rows)
            assert audits[1].rows_captured == 0
            assert audits[1].severity == "MINOR"
