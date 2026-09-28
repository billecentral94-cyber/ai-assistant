"""
equity_intraday_trader.py — Autonomous Equity Marginal Intraday Engine
Designed specifically for individual retail traders (₹2,500 capital with 5x MIS leverage = ₹12,500 buying capacity).
Trades high-liquidity NIFTY stocks on 5m/15m technical momentum breakouts with zero theta decay.
Enforces strict 2% max risk (₹50), 1:2.5 R:R targets, trailing stop-losses, and mandatory 15:15 IST EOD square-offs.
"""

import os
import json
import logging
import math
from typing import List, Dict, Any, Optional
from datetime import datetime, time
import pytz

logger = logging.getLogger("equity_intraday_trader")
IST = pytz.timezone("Asia/Kolkata")

STATE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "equity_trading_state.json")

# High-liquidity cash universe with Angel One NSE tokens
EQUITY_UNIVERSE = [
    {"symbol": "SBIN", "token": "3045", "lot": 1, "tick": 0.05},
    {"symbol": "TATAMOTORS", "token": "3456", "lot": 1, "tick": 0.05},
    {"symbol": "ICICIBANK", "token": "4963", "lot": 1, "tick": 0.05},
    {"symbol": "RELIANCE", "token": "2885", "lot": 1, "tick": 0.05},
    {"symbol": "INFY", "token": "1594", "lot": 1, "tick": 0.05},
]


class EquityIntradayTrader:
    """
    Automated Equity Intraday Engine with 5x MIS Margin.
    """

    def __init__(
        self,
        initial_capital: float = 2500.0,
        leverage: float = 5.0,
        max_risk_per_trade_rupees: float = 50.0,
        target_rr: float = 2.5,
        max_concurrent_trades: int = 2
    ):
        self.initial_capital = initial_capital
        self.current_capital = initial_capital
        self.leverage = leverage
        self.max_risk_per_trade_rupees = max_risk_per_trade_rupees
        self.target_rr = target_rr
        self.max_concurrent_trades = max_concurrent_trades

        self.open_positions: List[Dict[str, Any]] = []
        self.closed_trades: List[Dict[str, Any]] = []
        self.daily_pnl = 0.0

        self.load_state()

    def get_purchasing_power(self) -> float:
        """Returns total intraday purchasing capacity with 5x broker margin."""
        return round(self.current_capital * self.leverage, 2)

    def process_cycle(
        self,
        quotes: Dict[str, Dict[str, Any]],
        index_trend: str = "NEUTRAL",
        timestamp: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Executes a 15-minute intraday cycle:
        1. Manages open positions (trailing stops, profit targets, 15:15 EOD square-off).
        2. Evaluates new high-momentum stock breakouts if slots are open.
        """
        now = timestamp or datetime.now(IST)
        current_time = now.time()
        is_eod = current_time >= time(15, 15)
        events = []

        # ── 1. Manage Active Intraday Positions ──────────────────────────────
        active_positions = []
        for pos in self.open_positions:
            sym = pos["symbol"]
            quote = quotes.get(sym, {})
            current_price = float(quote.get("ltp") or quote.get("close") or pos["entry_price"])
            entry = pos["entry_price"]
            sl = pos["stop_loss"]
            tp = pos["target"]
            qty = pos["quantity"]
            direction = pos["direction"]

            should_close = False
            exit_reason = ""
            exit_price = current_price

            # Trailing stop update if trade is in profit
            if direction == "BUY":
                profit_pts = current_price - entry
                if profit_pts > (pos["risk_points"] * 1.5):
                    # Trail SL to lock in 0.5x risk
                    new_sl = round(entry + (pos["risk_points"] * 0.5), 2)
                    if new_sl > pos["stop_loss"]:
                        pos["stop_loss"] = new_sl

                if is_eod:
                    should_close = True
                    exit_reason = "EOD_SQUARE_OFF"
                elif current_price <= pos["stop_loss"]:
                    should_close = True
                    exit_reason = "STOP_LOSS"
                    exit_price = pos["stop_loss"]
                elif current_price >= tp:
                    should_close = True
                    exit_reason = "TARGET"
                    exit_price = tp

            elif direction == "SHORT":
                profit_pts = entry - current_price
                if profit_pts > (pos["risk_points"] * 1.5):
                    new_sl = round(entry - (pos["risk_points"] * 0.5), 2)
                    if new_sl < pos["stop_loss"]:
                        pos["stop_loss"] = new_sl

                if is_eod:
                    should_close = True
                    exit_reason = "EOD_SQUARE_OFF"
                elif current_price >= pos["stop_loss"]:
                    should_close = True
                    exit_reason = "STOP_LOSS"
                    exit_price = pos["stop_loss"]
                elif current_price <= tp:
                    should_close = True
                    exit_reason = "TARGET"
                    exit_price = tp

            if should_close:
                gross_pnl = round((exit_price - entry) * qty if direction == "BUY" else (entry - exit_price) * qty, 2)
                # Brokerage (0.03% or ₹20) + turnover tax ≈ ₹5.00
                brokerage_and_tax = round(min(20.0, (entry + exit_price) * qty * 0.0003) + 2.50, 2)
                net_pnl = round(gross_pnl - brokerage_and_tax, 2)

                self.current_capital = round(self.current_capital + net_pnl, 2)
                self.daily_pnl = round(self.daily_pnl + net_pnl, 2)

                closed_trade = {
                    "symbol": sym,
                    "direction": direction,
                    "entry_price": entry,
                    "exit_price": exit_price,
                    "quantity": qty,
                    "entry_time": pos["entry_time"],
                    "exit_time": now.isoformat(),
                    "exit_reason": exit_reason,
                    "net_pnl": net_pnl,
                    "charges": brokerage_and_tax
                }
                self.closed_trades.append(closed_trade)
                events.append({"event": "EQUITY_POSITION_CLOSED", "trade": closed_trade})
                logger.info(f"[EQUITY] CLOSED {direction} {sym} @ {exit_price} | Reason: {exit_reason} | PnL: ₹{net_pnl:+.2f}")
            else:
                active_positions.append(pos)

        self.open_positions = active_positions

        # ── 2. Scan & Enter New High-Confluence Setups (09:20 - 14:45) ────────
        can_open_new = not is_eod and current_time <= time(14, 45) and len(self.open_positions) < self.max_concurrent_trades
        if can_open_new and index_trend != "NEUTRAL":
            for stock in EQUITY_UNIVERSE:
                sym = stock["symbol"]
                # Skip if already open
                if any(p["symbol"] == sym for p in self.open_positions):
                    continue

                quote = quotes.get(sym)
                if not quote or float(quote.get("ltp", 0.0)) <= 0:
                    continue

                ltp = float(quote["ltp"])
                high = float(quote.get("high", ltp))
                low = float(quote.get("low", ltp))
                open_p = float(quote.get("open", ltp))

                # Simple, robust momentum confirmation
                signal_dir = None
                if index_trend == "BULLISH" and ltp > open_p and (high - low) > 0:
                    # Stock trading in top 30% of day's range with positive momentum
                    if ltp >= (low + 0.70 * (high - low)):
                        signal_dir = "BUY"
                elif index_trend == "BEARISH" and ltp < open_p and (high - low) > 0:
                    # Stock trading in bottom 30% of day's range with downward pressure
                    if ltp <= (low + 0.30 * (high - low)):
                        signal_dir = "SHORT"

                if signal_dir:
                    # Calculate position size within ₹50 max risk limit
                    risk_pct = 0.007  # 0.7% stop loss
                    risk_points = round(max(ltp * risk_pct, stock["tick"] * 10), 2)
                    raw_qty = math.floor(self.max_risk_per_trade_rupees / risk_points)

                    # Bounded by available intraday purchasing power
                    max_affordable_qty = math.floor((self.get_purchasing_power() * 0.45) / ltp)
                    qty = min(raw_qty, max_affordable_qty)

                    if qty >= 1:
                        sl = round(ltp - risk_points if signal_dir == "BUY" else ltp + risk_points, 2)
                        tp = round(ltp + (risk_points * self.target_rr) if signal_dir == "BUY" else ltp - (risk_points * self.target_rr), 2)

                        new_pos = {
                            "symbol": sym,
                            "direction": signal_dir,
                            "entry_price": ltp,
                            "stop_loss": sl,
                            "target": tp,
                            "risk_points": risk_points,
                            "quantity": qty,
                            "entry_time": now.isoformat(),
                            "product": "INTRADAY",
                            "strategy": "MOMENTUM_BREAKOUT"
                        }
                        self.open_positions.append(new_pos)
                        events.append({"event": "EQUITY_POSITION_OPENED", "position": new_pos})
                        logger.info(f"[EQUITY] OPENED {signal_dir} {qty}x {sym} @ ₹{ltp} | SL: ₹{sl} | Target: ₹{tp}")
                        break  # 1 new trade per cycle

        self.save_state()

        return {
            "timestamp": now.isoformat(),
            "capital": self.current_capital,
            "daily_pnl": round(self.daily_pnl, 2),
            "open_positions": len(self.open_positions),
            "closed_trades_count": len(self.closed_trades),
            "events": events
        }

    # ── State Persistence ─────────────────────────────────────────────────

    def save_state(self) -> None:
        """Persist current equity trading state to JSON."""
        state = {
            "engine_status": "ACTIVE",
            "initial_capital": self.initial_capital,
            "current_capital": round(self.current_capital, 2),
            "daily_pnl": round(self.daily_pnl, 2),
            "leverage_multiplier": self.leverage,
            "purchasing_power": self.get_purchasing_power(),
            "open_positions": self.open_positions,
            "closed_trades": self.closed_trades,
            "last_updated": datetime.now(IST).isoformat()
        }
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to persist equity state: {e}")

    def load_state(self) -> bool:
        """Load persisted state from disk if exists."""
        if not os.path.exists(STATE_FILE):
            return False
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                state = json.load(f)
            self.initial_capital = state.get("initial_capital", self.initial_capital)
            self.current_capital = state.get("current_capital", self.initial_capital)
            self.daily_pnl = state.get("daily_pnl", 0.0)
            self.open_positions = state.get("open_positions", [])
            self.closed_trades = state.get("closed_trades", [])
            return True
        except Exception as e:
            logger.warning(f"Failed to load equity state: {e}")
            return False
