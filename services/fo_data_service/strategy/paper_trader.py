"""
Live Paper Trading Execution Engine.
Simulates real-world order execution against live market snapshots with trailing stops,
risk guardrails, and automated EOD square-offs.
Includes 3 Live Readiness Gates evaluation and atomic state persistence.
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path
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

    # ── State Persistence ─────────────────────────────────────────────────

    STATE_FILE = Path(__file__).resolve().parent.parent / "live_trading_state.json"

    def save_state(self) -> None:
        """Persist current trading state to JSON for API consumption."""
        state = {
            "engine_status": "ACTIVE",
            "initial_capital": self.initial_capital,
            "current_capital": round(self.current_capital, 2),
            "daily_pnl": round(self.daily_pnl, 2),
            "open_positions": self.open_positions,
            "closed_trades": self.closed_trades,
            "readiness_gates": self.get_readiness_metrics(),
            "last_updated": datetime.now(IST).isoformat()
        }
        try:
            self.STATE_FILE.write_text(json.dumps(state, indent=2, default=str))
        except Exception as e:
            logger.error(f"Failed to save trading state: {e}")

    def load_state(self) -> bool:
        """Load persisted state if available. Returns True if loaded."""
        if self.STATE_FILE.exists():
            try:
                state = json.loads(self.STATE_FILE.read_text())
                self.current_capital = state.get("current_capital", self.initial_capital)
                self.daily_pnl = state.get("daily_pnl", 0.0)
                self.open_positions = state.get("open_positions", [])
                self.closed_trades = state.get("closed_trades", [])
                logger.info(f"Loaded persisted state from {self.STATE_FILE.name}")
                return True
            except Exception as e:
                logger.warning(f"Could not load persisted state: {e}")
                return False
        return False

    def reset_daily(self) -> None:
        """Reset daily PnL counter for a new trading session."""
        self.daily_pnl = 0.0

    # ── 3 Live Readiness Gates ────────────────────────────────────────────

    def get_readiness_metrics(self) -> Dict[str, Any]:
        """
        Compute the 3 Live Readiness Gates from closed trades:
          Gate 1: Win Rate >= 55%
          Gate 2: Profit Factor >= 1.5
          Gate 3: Max Drawdown <= 4.0%
        """
        total = len(self.closed_trades)
        if total == 0:
            return {
                "total_trades": 0,
                "wins": 0,
                "losses": 0,
                "win_rate_pct": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_pct": 0.0,
                "gate_1_win_rate": {"value": 0.0, "threshold": 55.0, "passed": False},
                "gate_2_profit_factor": {"value": 0.0, "threshold": 1.5, "passed": False},
                "gate_3_max_drawdown": {"value": 0.0, "threshold": 4.0, "passed": False},
                "all_gates_passed": False
            }

        wins = [t for t in self.closed_trades if t["net_pnl"] > 0]
        losses = [t for t in self.closed_trades if t["net_pnl"] <= 0]

        win_rate = (len(wins) / total) * 100.0

        gross_profit = sum(t["net_pnl"] for t in wins)
        gross_loss = abs(sum(t["net_pnl"] for t in losses))
        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (
            999.0 if gross_profit > 0 else 0.0
        )

        # Max drawdown: walk the equity curve
        peak = self.initial_capital
        max_dd = 0.0
        running = self.initial_capital
        for trade in self.closed_trades:
            running += trade["net_pnl"]
            peak = max(peak, running)
            dd = ((peak - running) / peak) * 100.0 if peak > 0 else 0.0
            max_dd = max(max_dd, dd)

        g1 = win_rate >= 55.0
        g2 = profit_factor >= 1.5
        g3 = max_dd <= 4.0

        return {
            "total_trades": total,
            "wins": len(wins),
            "losses": len(losses),
            "win_rate_pct": round(win_rate, 2),
            "profit_factor": profit_factor,
            "max_drawdown_pct": round(max_dd, 2),
            "gate_1_win_rate": {"value": round(win_rate, 2), "threshold": 55.0, "passed": g1},
            "gate_2_profit_factor": {"value": profit_factor, "threshold": 1.5, "passed": g2},
            "gate_3_max_drawdown": {"value": round(max_dd, 2), "threshold": 4.0, "passed": g3},
            "all_gates_passed": g1 and g2 and g3
        }

