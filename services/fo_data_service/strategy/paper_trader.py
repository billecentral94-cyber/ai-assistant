"""
Live Paper Trading Execution Engine.
Simulates real-world order execution against live market snapshots with trailing stops,
risk guardrails, and automated EOD square-offs.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import pytz
import logging

from .signal_generator import SignalGenerator, Signal
from .risk_manager import RiskManager

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")


class PaperTrader:
    """
    Simulates paper execution during market hours (09:15 - 15:30 IST).
    """

    def __init__(
        self,
        signal_generator: Optional[SignalGenerator] = None,
        risk_manager: Optional[RiskManager] = None,
        initial_capital: float = 500000.0,
        lot_size: int = 25,
        slippage_pct: float = 0.05
    ):
        self.signal_generator = signal_generator or SignalGenerator()
        self.risk_manager = risk_manager or RiskManager()
        self.initial_capital = initial_capital
        self.current_capital = initial_capital
        self.lot_size = lot_size
        self.slippage_pct = slippage_pct

        self.open_positions: List[Dict[str, Any]] = []
        self.closed_trades: List[Dict[str, Any]] = []
        self.daily_pnl = 0.0

    def process_cycle(
        self,
        underlying: str,
        current_spot: float,
        signal: Optional[Signal] = None,
        timestamp: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Processes a single 15-minute cycle:
        1. Checks exit conditions on open positions
        2. Evaluates new signal entry if allowed
        3. Enforces EOD square-off if time >= 15:15 IST
        """
        now = timestamp or datetime.now(IST)
        now_time = now.strftime("%H:%M")
        is_eod = now_time >= "15:15"

        events = []

        # 1. Manage Open Positions
        active_positions = []
        for pos in self.open_positions:
            entry = pos["entry_price"]
            sl = pos["stop_loss"]
            tp = pos["target_1"]
            direction = pos["direction"]
            lots = pos["lots"]
            qty = lots * self.lot_size

            should_close = False
            exit_reason = ""
            exit_price = current_spot

            if is_eod:
                should_close = True
                exit_reason = "EOD_SQUARE_OFF"
            elif direction == "BULLISH":
                if current_spot <= sl:
                    should_close = True
                    exit_reason = "STOP_LOSS"
                    exit_price = sl
                elif current_spot >= tp:
                    should_close = True
                    exit_reason = "TARGET_1"
                    exit_price = tp
            elif direction == "BEARISH":
                if current_spot >= sl:
                    should_close = True
                    exit_reason = "STOP_LOSS"
                    exit_price = sl
                elif current_spot <= tp:
                    should_close = True
                    exit_reason = "TARGET_1"
                    exit_price = tp

            if should_close:
                pts = (exit_price - entry) if direction == "BULLISH" else (entry - exit_price)
                gross_pnl = round(pts * qty * 0.50, 2)
                # Slippage + brokerage
                costs = round(80.0 + (entry + exit_price) * (self.slippage_pct / 100.0) * qty * 0.1, 2)
                net_pnl = round(gross_pnl - costs, 2)

                self.current_capital += net_pnl
                self.daily_pnl += net_pnl

                closed_trade = {
                    "symbol": underlying,
                    "direction": direction,
                    "entry_price": entry,
                    "exit_price": exit_price,
                    "lots": lots,
                    "quantity": qty,
                    "entry_time": pos["entry_time"],
                    "exit_time": now.isoformat(),
                    "exit_reason": exit_reason,
                    "net_pnl": net_pnl,
                    "strategy": pos["strategy_name"]
                }
                self.closed_trades.append(closed_trade)
                events.append({"event": "POSITION_CLOSED", "trade": closed_trade})
            else:
                active_positions.append(pos)

        self.open_positions = active_positions

        # 2. Evaluate New Signal Entry (Only if not EOD)
        if not is_eod and signal and signal.is_actionable:
            peak_capital = max(self.initial_capital, self.current_capital)
            current_dd_pct = ((peak_capital - self.current_capital) / peak_capital) * 100.0 if peak_capital > 0 else 0.0

            allowed, reason = self.risk_manager.check_trade_allowed(
                account_capital=self.current_capital,
                current_open_positions=len(self.open_positions),
                daily_realized_loss=self.daily_pnl,
                current_drawdown_pct=current_dd_pct
            )

            if allowed and signal.position_size.get("lots", 0) > 0:
                new_pos = {
                    "symbol": underlying,
                    "direction": signal.direction,
                    "entry_price": signal.entry_price,
                    "stop_loss": signal.stop_loss,
                    "target_1": signal.target_1,
                    "lots": signal.position_size["lots"],
                    "entry_time": now.isoformat(),
                    "strategy_name": signal.recommended_strategy["strategy_name"]
                }
                self.open_positions.append(new_pos)
                events.append({"event": "POSITION_OPENED", "position": new_pos})

        return {
            "timestamp": now.isoformat(),
            "capital": self.current_capital,
            "daily_pnl": round(self.daily_pnl, 2),
            "open_positions": len(self.open_positions),
            "closed_trades_count": len(self.closed_trades),
            "events": events
        }
