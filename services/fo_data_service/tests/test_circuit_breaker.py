"""
Audit Gate Test Suite for Phase E: Circuit Breaker and Primary -> Fallback Routing.
Simulates primary source failure and verifies automated fallback engagement and audit logging.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
import pytest
import pytz
from sqlalchemy import create_engine

from db.models import Base, OptionChainSnapshot, FuturesSnapshot, GapLog, RetrievalAuditLog
from db.connection import get_db_session
from db.repository import DataRepository
from orchestrator.circuit_breaker import CircuitBreaker, CircuitState
from orchestrator.runner import FetchOrchestrator
from fetchers.base import OptionChainRow, FuturesRow

IST = pytz.timezone("Asia/Kolkata")


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    repo = DataRepository(engine=engine)
    return {"engine": engine, "repo": repo}


def make_mock_opt_rows(underlying="NIFTY", count=10, source="angelone", timestamp=None):
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
            oi=45000,
            change_in_oi=0,
            volume=60000,
            iv=None,
            ltp=130.0,
            spot_price=24200.0,
            source=source,
            snapshot_status="complete",
            captured_at=timestamp
        ))
        rows.append(OptionChainRow(
            underlying=underlying,
            expiry="2026-09-04",
            strike=strike,
            option_type="PE",
            oi=55000,
            change_in_oi=0,
            volume=70000,
            iv=None,
            ltp=110.0,
            spot_price=24200.0,
            source=source,
            snapshot_status="complete",
            captured_at=timestamp
        ))
    return rows


class TestCircuitBreakerLogic:
    """Tests circuit breaker state machine transitions."""

    def test_state_transitions(self):
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=10)
        key = "option_chain:NIFTY"

        # Initial state: CLOSED
        assert cb.get_state(key) == CircuitState.CLOSED
        assert cb.can_attempt_primary(key) is True

        # First failure: Still CLOSED
        cb.record_failure(key, "Timeout 1")
        assert cb.get_state(key) == CircuitState.CLOSED
        assert cb.can_attempt_primary(key) is True

        # Second failure: Trips to OPEN
        cb.record_failure(key, "Timeout 2")
        assert cb.get_state(key) == CircuitState.OPEN
        assert cb.can_attempt_primary(key) is False

        # Simulate cooldown elapse
        entry = cb._get_entry(key)
        entry["last_failure_time"] = datetime.now(timezone.utc) - timedelta(seconds=15)

        # After cooldown -> transitions to HALF_OPEN
        assert cb.get_state(key) == CircuitState.HALF_OPEN
        assert cb.can_attempt_primary(key) is True

        # Success in HALF_OPEN -> closes circuit
        cb.record_success(key)
        assert cb.get_state(key) == CircuitState.CLOSED
        assert cb.can_attempt_primary(key) is True


class TestFallbackEngagementAuditGate:
    """Audit Gate E: Primary source failure -> Fallback engages in same cycle."""

    def test_option_chain_primary_failure_triggers_fallback(self, test_db):
        repo = test_db["repo"]
        engine = test_db["engine"]
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=300)
        orchestrator = FetchOrchestrator(repo=repo, circuit_breaker=cb, max_retries=1, retry_delay_seconds=0.01)

        captured_time = datetime.now(IST)
        fallback_rows = make_mock_opt_rows(underlying="NIFTY", count=10, source="angelone", timestamp=captured_time)

        # Mock primary (nsepython) raising Exception, and fallback (Angel One) returning valid rows
        with patch.object(orchestrator.nse_opt_primary, "fetch", side_effect=RuntimeError("NSE 403 Forbidden")):
            with patch.object(orchestrator.angel_opt_fallback, "fetch", return_value=fallback_rows):
                with patch.object(orchestrator.nse_opt_primary, "fetch_spot_price", return_value=24200.0):
                    res = orchestrator.fetch_and_store_option_chain("NIFTY", captured_at=captured_time)

        # Verify fallback engaged and succeeded
        assert res["status"] == "complete"
        assert res["source_used"] == "fallback"
        assert res["inserted"] == len(fallback_rows)

        # Confirm stored rows in DB have source='angelone'
        with get_db_session(engine) as s:
            db_rows = s.query(OptionChainSnapshot).filter_by(underlying="NIFTY").all()
            assert len(db_rows) == len(fallback_rows)
            assert all(r.source == "angelone" for r in db_rows)

            # Confirm retrieval_audit_log tagged source_used='fallback'
            audit = s.query(RetrievalAuditLog).filter_by(data_type="option_chain").first()
            assert audit is not None
            assert audit.source_used == "fallback"
            assert audit.rows_captured == len(fallback_rows)

    def test_futures_primary_failure_triggers_fallback(self, test_db):
        repo = test_db["repo"]
        engine = test_db["engine"]
        cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=300)
        orchestrator = FetchOrchestrator(repo=repo, circuit_breaker=cb, max_retries=1, retry_delay_seconds=0.01)

        captured_time = datetime.now(IST)
        fallback_fut_rows = [
            FuturesRow(
                underlying="BANKNIFTY",
                expiry="2026-09-24",
                open=57500.0,
                high=57800.0,
                low=57400.0,
                close=57650.0,
                volume=400000,
                oi=4000000,
                source="nse",
                snapshot_status="complete",
                captured_at=captured_time
            )
        ]

        # Mock primary (Angel One) failing and fallback (NSE) succeeding
        with patch.object(orchestrator.angel_fut_primary, "fetch", side_effect=RuntimeError("SmartAPI Timeout")):
            with patch.object(orchestrator.nse_fut_fallback, "fetch", return_value=fallback_fut_rows):
                res = orchestrator.fetch_and_store_futures("BANKNIFTY", captured_at=captured_time)

        assert res["status"] == "complete"
        assert res["source_used"] == "fallback"

        with get_db_session(engine) as s:
            fut_db = s.query(FuturesSnapshot).filter_by(underlying="BANKNIFTY").first()
            assert fut_db is not None
            assert fut_db.source == "nse"
            assert fut_db.close == 57650.0

            audit = s.query(RetrievalAuditLog).filter_by(data_type="futures").first()
            assert audit is not None
            assert audit.source_used == "fallback"
