"""
Institutional Capital Protection and Risk Management Engine.
Enforces fractional Kelly position sizing (capped at 1.5%), daily loss kill switches (2.0%),
maximum concurrent position limits, and portfolio drawdown circuit breakers (8.0%).
"""

import math
import logging
from typing import Tuple, Dict, Any, Optional

logger = logging.getLogger(__name__)


class RiskManager:
    """
    Guards personal capital against ruin, over-leveraging, and emotional drawdowns.
    """

    def __init__(
        self,
        max_risk_per_trade_pct: float = 1.5,     # Max 1.5% capital risk per trade
        daily_loss_limit_pct: float = 2.0,       # Max 2.0% daily loss before Kill Switch
        max_drawdown_limit_pct: float = 8.0,     # Max 8.0% drawdown before Observation Mode
        max_open_positions: int = 3,             # Max 3 concurrent positions
        recovery_drawdown_threshold_pct: float = 5.0
    ):
        self.max_risk_per_trade_pct = max_risk_per_trade_pct
        self.daily_loss_limit_pct = daily_loss_limit_pct
        self.max_drawdown_limit_pct = max_drawdown_limit_pct
        self.max_open_positions = max_open_positions
        self.recovery_drawdown_threshold_pct = recovery_drawdown_threshold_pct

        # State tracking
        self.kill_switch_active = False
        self.observation_mode_active = False

    def check_trade_allowed(
        self,
        account_capital: float,
        current_open_positions: int,
        daily_realized_loss: float,
        current_drawdown_pct: float
    ) -> Tuple[bool, str]:
        """
        Evaluates whether a new trade can be initiated under current risk parameters.

        Returns:
        - (True, "APPROVED") if all checks pass.
        - (False, reason) if any risk constraint is breached.
        """
        if account_capital <= 0:
            return False, "REJECTED: Invalid account capital"

        # 1. Check Drawdown Circuit Breaker
        if current_drawdown_pct >= self.max_drawdown_limit_pct:
            self.observation_mode_active = True
            msg = f"REJECTED: Portfolio drawdown ({current_drawdown_pct:.1f}%) exceeds circuit limit ({self.max_drawdown_limit_pct}%). System in Observation Mode."
            logger.warning(msg)
            return False, msg
        elif self.observation_mode_active:
            if current_drawdown_pct <= self.recovery_drawdown_threshold_pct:
                self.observation_mode_active = False
                logger.info("Drawdown circuit reset: Portfolio recovered below threshold.")
            else:
                return False, f"REJECTED: Observation Mode active until drawdown recovers below {self.recovery_drawdown_threshold_pct}%."

        # 2. Check Daily Realized Loss Limit (Kill Switch)
        daily_loss_pct = (abs(daily_realized_loss) / account_capital) * 100.0 if daily_realized_loss < 0 else 0.0
        if daily_loss_pct >= self.daily_loss_limit_pct:
            self.kill_switch_active = True
            msg = f"REJECTED: Daily realized loss limit breached ({daily_loss_pct:.2f}% >= {self.daily_loss_limit_pct}%). Kill Switch engaged for today."
            logger.critical(msg)
            return False, msg

        # 3. Check Maximum Concurrent Open Positions
        if current_open_positions >= self.max_open_positions:
            msg = f"REJECTED: Max open positions limit reached ({current_open_positions}/{self.max_open_positions})."
            logger.warning(msg)
            return False, msg

        return True, "APPROVED"

    def calculate_position_size(
        self,
        account_capital: float,
        max_loss_per_lot: float,
        lot_size: int = 25,
        win_rate: float = 0.60,
        win_loss_ratio: float = 1.5
    ) -> Dict[str, Any]:
        """
        Calculates position size using fractional Kelly criterion, strictly bounded by max_risk_per_trade_pct.

        Kelly Formula: f* = (p * b - q) / b
        where p = win_rate, q = 1 - p, b = win_loss_ratio.
        """
        if account_capital <= 0 or max_loss_per_lot <= 0:
            return {"lots": 0, "quantity": 0, "allocated_risk_rupees": 0.0, "risk_pct": 0.0}

        # Half-Kelly for conservative capital preservation
        q = 1.0 - win_rate
        full_kelly = (win_rate * win_loss_ratio - q) / win_loss_ratio
        half_kelly = max(0.0, full_kelly * 0.5)

        # Capped strictly at max_risk_per_trade_pct (e.g. 1.5%)
        target_risk_pct = min(self.max_risk_per_trade_pct, half_kelly * 100.0 if half_kelly > 0 else self.max_risk_per_trade_pct)
        # Always enforce hard cap
        target_risk_pct = min(target_risk_pct, self.max_risk_per_trade_pct)

        max_risk_rupees = account_capital * (target_risk_pct / 100.0)

        # Number of lots allowed
        lots = math.floor(max_risk_rupees / max_loss_per_lot)

        # Ensure risk never exceeds the strict ceiling even by 1 rupee
        actual_risk_rupees = lots * max_loss_per_lot
        actual_risk_pct = round((actual_risk_rupees / account_capital) * 100.0, 2)

        return {
            "lots": lots,
            "quantity": lots * lot_size,
            "allocated_risk_rupees": round(actual_risk_rupees, 2),
            "max_risk_ceiling_rupees": round(max_risk_rupees, 2),
            "risk_pct": actual_risk_pct,
            "fractional_kelly_pct": round(target_risk_pct, 2)
        }
