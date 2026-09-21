"""
Circuit Breaker and Resilient Routing for Primary -> Fallback Data Fetchers.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "CLOSED"         # Normal operation, primary source active
    OPEN = "OPEN"             # Tripped, routing directly to fallback
    HALF_OPEN = "HALF_OPEN"   # Probing primary source after cooldown


class CircuitBreaker:
    """
    Manages circuit breaker state per data channel (e.g. 'option_chain:NIFTY', 'futures:BANKNIFTY').
    Trips after N consecutive failures and enforces a cooldown window.
    """

    def __init__(self, failure_threshold: int = 2, cooldown_seconds: int = 300):
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._states: Dict[str, Dict[str, Any]] = {}

    def _get_entry(self, key: str) -> Dict[str, Any]:
        if key not in self._states:
            self._states[key] = {
                "state": CircuitState.CLOSED,
                "consecutive_failures": 0,
                "total_failures": 0,
                "last_failure_time": None,
                "last_state_change": datetime.now(timezone.utc),
                "last_error": None
            }
        return self._states[key]

    def get_state(self, key: str) -> CircuitState:
        """Returns the current evaluated state for the given channel."""
        entry = self._get_entry(key)
        state = entry["state"]

        if state == CircuitState.OPEN and entry["last_failure_time"]:
            now = datetime.now(timezone.utc)
            elapsed = (now - entry["last_failure_time"]).total_seconds()
            if elapsed >= self.cooldown_seconds:
                # Cooldown expired -> transition to HALF_OPEN to probe primary
                entry["state"] = CircuitState.HALF_OPEN
                entry["last_state_change"] = now
                logger.info(f"Circuit Breaker for '{key}' transitioned from OPEN to HALF_OPEN after {elapsed:.1f}s cooldown")
                return CircuitState.HALF_OPEN

        return entry["state"]

    def can_attempt_primary(self, key: str) -> bool:
        """
        Determines whether the primary source should be attempted.
        Returns False only if the circuit is currently OPEN in active cooldown.
        """
        current_state = self.get_state(key)
        return current_state in (CircuitState.CLOSED, CircuitState.HALF_OPEN)

    def record_success(self, key: str) -> None:
        """Records a successful primary fetch, resetting consecutive failures and closing circuit."""
        entry = self._get_entry(key)
        prev_state = entry["state"]
        entry["consecutive_failures"] = 0
        entry["state"] = CircuitState.CLOSED
        entry["last_state_change"] = datetime.now(timezone.utc)

        if prev_state != CircuitState.CLOSED:
            logger.info(f"Circuit Breaker for '{key}' CLOSED (Primary source recovered)")

    def record_failure(self, key: str, reason: str) -> None:
        """Records a failure on the primary source. Trips to OPEN if threshold exceeded."""
        entry = self._get_entry(key)
        now = datetime.now(timezone.utc)
        entry["consecutive_failures"] += 1
        entry["total_failures"] += 1
        entry["last_failure_time"] = now
        entry["last_error"] = reason

        if entry["consecutive_failures"] >= self.failure_threshold:
            if entry["state"] != CircuitState.OPEN:
                entry["state"] = CircuitState.OPEN
                entry["last_state_change"] = now
                logger.warning(
                    f"Circuit Breaker for '{key}' TRIPPED to OPEN after {entry['consecutive_failures']} consecutive failures. "
                    f"Cooldown set to {self.cooldown_seconds}s. Reason: {reason}"
                )
