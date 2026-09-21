"""
Fetch Orchestrator and Cycle Runner with Circuit Breaker and Cross-Fallback.
"""

from datetime import datetime
from typing import Dict, Any, Optional, List
import logging
import pytz
import time

from config.settings import settings
from db.repository import DataRepository
from orchestrator.circuit_breaker import CircuitBreaker, CircuitState
from orchestrator.validator import validate_option_chain_batch, validate_futures_batch
from fetchers.nse_option_chain import NSEOptionChainFetcher
from fetchers.angel_option_chain import AngelOptionChainFetcher
from fetchers.angel_futures import AngelFuturesFetcher
from fetchers.nse_futures import NSEFuturesFetcher
from fetchers.base import OptionChainRow, FuturesRow
from analytics.engine import AnalyticsEngine

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")


class FetchOrchestrator:
    """
    Executes primary -> retry -> fallback retrieval cycles with zero partial rows.
    """

    def __init__(
        self,
        repo: Optional[DataRepository] = None,
        circuit_breaker: Optional[CircuitBreaker] = None,
        max_retries: int = 2,
        retry_delay_seconds: float = 1.0
    ):
        self.repo = repo or DataRepository()
        self.circuit_breaker = circuit_breaker or CircuitBreaker(
            failure_threshold=settings.CIRCUIT_BREAKER_FAILURES,
            cooldown_seconds=settings.CIRCUIT_BREAKER_COOLDOWN_SECONDS
        )
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds

        # Primary and Fallback Fetcher instances
        self.nse_opt_primary = NSEOptionChainFetcher()
        self.angel_opt_fallback = AngelOptionChainFetcher()

        self.angel_fut_primary = AngelFuturesFetcher()
        self.nse_fut_fallback = NSEFuturesFetcher()
        self.analytics_engine = AnalyticsEngine(engine=self.repo.engine)

    def fetch_and_store_option_chain(
        self,
        underlying: str,
        captured_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Retrieves option chain for an underlying: Primary (nsepython) -> Fallback (Angel One).
        """
        if captured_at is None:
            captured_at = datetime.now(IST)

        channel_key = f"option_chain:{underlying}"
        can_use_primary = self.circuit_breaker.can_attempt_primary(channel_key)
        rows: List[OptionChainRow] = []
        source_used = "primary"
        primary_failed = False
        last_error = ""

        # 1. Attempt Primary (nsepython) if circuit breaker allows
        if can_use_primary:
            for attempt in range(1 + self.max_retries):
                try:
                    raw_rows = self.nse_opt_primary.fetch(underlying, max_expiries=2, captured_at=captured_at)
                    v_res = validate_option_chain_batch(raw_rows, underlying)
                    if v_res.is_valid:
                        rows = raw_rows
                        source_used = "primary"
                        self.circuit_breaker.record_success(channel_key)
                        break
                    else:
                        last_error = f"Validation failed: {'; '.join(v_res.errors[:3])}"
                except Exception as e:
                    last_error = str(e)
                    if attempt < self.max_retries:
                        time.sleep(self.retry_delay_seconds)

            if not rows:
                primary_failed = True
                self.circuit_breaker.record_failure(channel_key, reason=last_error)
                logger.warning(f"Primary option chain fetch failed for {underlying}: {last_error}. Triggering Fallback...")
        else:
            primary_failed = True
            logger.info(f"Circuit OPEN for {channel_key}; skipping primary directly to Fallback...")

        # 2. Attempt Fallback (Angel One) if primary was skipped or failed
        if not rows:
            try:
                spot = self.nse_opt_primary.fetch_spot_price(underlying)
                if spot <= 0:
                    spot = 24000.0 if underlying == "NIFTY" else 57000.0

                step = 50.0 if underlying == "NIFTY" else 100.0
                raw_rows = self.angel_opt_fallback.fetch(
                    underlying=underlying,
                    spot_price=spot,
                    strike_step=step,
                    max_expiries=2,
                    captured_at=captured_at
                )
                v_res = validate_option_chain_batch(raw_rows, underlying, min_strikes_required=5)
                if v_res.is_valid:
                    rows = raw_rows
                    source_used = "fallback"
                else:
                    last_error = f"Fallback validation failed: {'; '.join(v_res.errors[:3])}"
            except Exception as e:
                last_error = f"Fallback error: {e}"

        # 3. Persistence or Zero-Row Gap Logging
        if rows:
            res = self.repo.save_option_chain_snapshot(rows, source_used=source_used)
            res["source_used"] = source_used
            try:
                self.analytics_engine.run_post_fetch(
                    underlying=underlying,
                    captured_at=captured_at,
                    option_rows=rows
                )
            except Exception as e:
                logger.error(f"Post-fetch analytics calculation failed for {underlying}: {e}")
            return res
        else:
            # Complete failure: Zero bad rows written; Record full cycle gap
            self.repo.record_gap(
                data_type="option_chain",
                underlying=underlying,
                expected_timestamp=captured_at,
                reason="source_down" if "404" in last_error or "timeout" in last_error.lower() else "validation_error",
                details=f"Primary and Fallback failed: {last_error}"
            )
            self.repo.record_audit(
                run_timestamp=captured_at,
                data_type="option_chain",
                underlying=underlying,
                rows_expected=40,
                rows_captured=0,
                rows_rejected=0,
                rows_deduped=0,
                source_used="none",
                severity="CRITICAL",
                message=f"Total fetch failure: {last_error}"
            )
            return {"status": "failed", "underlying": underlying, "error": last_error}

    def fetch_and_store_futures(
        self,
        underlying: str,
        captured_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Retrieves futures for an underlying: Primary (Angel One) -> Fallback (NSE).
        """
        if captured_at is None:
            captured_at = datetime.now(IST)

        channel_key = f"futures:{underlying}"
        can_use_primary = self.circuit_breaker.can_attempt_primary(channel_key)
        rows: List[FuturesRow] = []
        source_used = "primary"
        last_error = ""

        # 1. Attempt Primary (Angel One)
        if can_use_primary:
            for attempt in range(1 + self.max_retries):
                try:
                    raw_rows = self.angel_fut_primary.fetch(underlying, max_contracts=2, captured_at=captured_at)
                    v_res = validate_futures_batch(raw_rows, underlying)
                    if v_res.is_valid:
                        rows = raw_rows
                        source_used = "primary"
                        self.circuit_breaker.record_success(channel_key)
                        break
                    else:
                        last_error = f"Validation failed: {'; '.join(v_res.errors)}"
                except Exception as e:
                    last_error = str(e)
                    if attempt < self.max_retries:
                        time.sleep(self.retry_delay_seconds)

            if not rows:
                self.circuit_breaker.record_failure(channel_key, reason=last_error)
                logger.warning(f"Primary futures fetch failed for {underlying}: {last_error}. Triggering Fallback...")

        # 2. Attempt Fallback (NSE India)
        if not rows:
            try:
                raw_rows = self.nse_fut_fallback.fetch(underlying, max_contracts=2, captured_at=captured_at)
                v_res = validate_futures_batch(raw_rows, underlying)
                if v_res.is_valid:
                    rows = raw_rows
                    source_used = "fallback"
                else:
                    last_error = f"Fallback validation failed: {'; '.join(v_res.errors)}"
            except Exception as e:
                last_error = f"Futures Fallback error: {e}"

        # 3. Persistence or Gap Logging
        if rows:
            res = self.repo.save_futures_snapshot(rows, source_used=source_used)
            res["source_used"] = source_used
            try:
                self.analytics_engine.run_post_fetch(
                    underlying=underlying,
                    captured_at=captured_at,
                    futures_rows=rows
                )
            except Exception as e:
                logger.error(f"Post-fetch analytics calculation failed for futures {underlying}: {e}")
            return res
        else:
            self.repo.record_gap(
                data_type="futures",
                underlying=underlying,
                expected_timestamp=captured_at,
                reason="source_down" if "timeout" in last_error.lower() else "validation_error",
                details=f"Primary and Fallback failed: {last_error}"
            )
            self.repo.record_audit(
                run_timestamp=captured_at,
                data_type="futures",
                underlying=underlying,
                rows_expected=2,
                rows_captured=0,
                rows_rejected=0,
                rows_deduped=0,
                source_used="none",
                severity="CRITICAL",
                message=f"Futures fetch failure: {last_error}"
            )
            return {"status": "failed", "underlying": underlying, "error": last_error}
