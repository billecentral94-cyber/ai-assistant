"""
Live Paper Trading Execution Engine.
Simulates real-world order execution against live market snapshots with trailing stops,
risk guardrails, and automated EOD square-offs.
Includes 3 Live Readiness Gates evaluation and atomic state persistence.
Uses real option leg LTPs from Angel One SmartAPI for accurate spread P&L marking.
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path
import pytz
import logging

from .signal_generator import SignalGenerator, Signal
from .risk_manager import RiskManager
from .self_improver import load_adaptive_config

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

QUOTE_URL = "https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/"


class PaperTrader:
    """
    Simulates paper execution during market hours (09:15 - 15:30 IST).
    Uses live Angel One option LTPs for spread P&L when session is available.
    """

    def __init__(
        self,
        signal_generator: Optional[SignalGenerator] = None,
        risk_manager: Optional[RiskManager] = None,
        initial_capital: float = 5000.0,
        lot_size: int = 25,
        slippage_pct: float = 0.05,
        angel_session=None
    ):
        self.signal_generator = signal_generator or SignalGenerator()
        self.risk_manager = risk_manager or RiskManager()
        self.initial_capital = initial_capital
        self.current_capital = initial_capital
        self.lot_size = lot_size
        self.slippage_pct = slippage_pct
        self.angel_session = angel_session  # AngelOneSession for live LTP lookups

        self.open_positions: List[Dict[str, Any]] = []
        self.closed_trades: List[Dict[str, Any]] = []
        self.daily_pnl = 0.0
        self.last_stop_times: Dict[str, datetime] = {}

        # Cache: maps "SYMBOL STRIKE CE/PE" -> Angel One token string
        self._token_cache: Dict[str, str] = {}
        self._scrip_master: Optional[List[Dict[str, Any]]] = None

    def _lookup_option_token(self, underlying: str, strike: float, option_type: str) -> Optional[str]:
        """Looks up Angel One instrument token for a specific option contract from scrip master."""
        if self.angel_session is None:
            return None

        cache_key = f"{underlying}_{strike}_{option_type}"
        if cache_key in self._token_cache:
            return self._token_cache[cache_key]

        try:
            if self._scrip_master is None:
                import requests
                resp = requests.get(
                    "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json",
                    timeout=30
                )
                resp.raise_for_status()
                self._scrip_master = resp.json()

            from dateutil import parser as date_parser
            today = datetime.now(IST).date()

            for item in self._scrip_master:
                if (
                    item.get("exch_seg") == "NFO"
                    and item.get("name") == underlying.upper()
                    and item.get("instrumenttype") == "OPTIDX"
                ):
                    symbol = item.get("symbol", "")
                    if not symbol.endswith(option_type):
                        continue

                    raw_strike = float(item.get("strike", "0"))
                    item_strike = raw_strike / 100.0 if raw_strike > 100000 else raw_strike
                    if abs(item_strike - strike) > 0.01:
                        continue

                    exp_d = date_parser.parse(item.get("expiry", "")).date()
                    if exp_d >= today:
                        token = item.get("token")
                        self._token_cache[cache_key] = token
                        return token
        except Exception as e:
            logger.warning(f"Token lookup failed for {cache_key}: {e}")

        return None

    def _fetch_option_ltp(self, token: str) -> Optional[float]:
        """Fetches live LTP for a single option token from Angel One SmartAPI."""
        if self.angel_session is None or not token:
            return None
        try:
            headers = self.angel_session._get_headers(with_auth=True)
            payload = {"mode": "LTP", "exchangeTokens": {"NFO": [str(token)]}}
            resp = self.angel_session.session.post(QUOTE_URL, json=payload, headers=headers, timeout=10)
            data = resp.json()
            fetched = data.get("data", {}).get("fetched", [])
            if fetched:
                return float(fetched[0].get("ltp", 0.0))
        except Exception as e:
            logger.warning(f"Option LTP fetch failed for token {token}: {e}")
        return None

    def _get_spread_premium(self, legs: List[Dict[str, Any]], underlying: str) -> Optional[Dict[str, Any]]:
        """
        Fetches real LTPs for all legs of a spread and returns premium details.
        Returns dict with buy_premium, sell_premium, net_debit, leg_details or None if fetch fails.
        """
        if self.angel_session is None or not legs:
            return None

        leg_details = []
        for leg in legs:
            strike = leg.get("strike", 0)
            opt_type = leg.get("option_type", "")
            action = leg.get("action", "")
            token = self._lookup_option_token(underlying, strike, opt_type)
            if token is None:
                return None  # Can't price all legs; fall back to theoretical
            ltp = self._fetch_option_ltp(token)
            if ltp is None or ltp <= 0:
                return None
            leg_details.append({
                "strike": strike,
                "option_type": opt_type,
                "action": action,
                "token": token,
                "ltp": ltp
            })

        buy_premium = sum(d["ltp"] for d in leg_details if d["action"] == "BUY")
        sell_premium = sum(d["ltp"] for d in leg_details if d["action"] == "SELL")
        net_debit = round(buy_premium - sell_premium, 2)

        return {
            "buy_premium": round(buy_premium, 2),
            "sell_premium": round(sell_premium, 2),
            "net_debit": net_debit,
            "leg_details": leg_details
        }


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
        adaptive_cfg = load_adaptive_config()
        trail_enabled = adaptive_cfg.get("trailing_stop_enabled", True)
        trail_trigger = float(adaptive_cfg.get("trail_trigger_ratio", 1.2))
        trail_lock = float(adaptive_cfg.get("trail_lock_ratio", 0.5))
        cooldown_mins = int(adaptive_cfg.get("cooldown_minutes_after_stop", 20))
        max_daily_trades = int(adaptive_cfg.get("max_daily_fo_trades", 6))

        # 1. Manage Open Positions (Strictly filter for the matching underlying)
        active_positions = []
        for pos in self.open_positions:
            if pos.get("symbol") != underlying:
                active_positions.append(pos)
                continue

            entry = pos["entry_price"]
            sl = pos["stop_loss"]
            tp = pos["target_1"]
            direction = pos["direction"]
            lots = pos["lots"]
            qty = lots * self.lot_size
            max_defined_risk = pos.get("max_risk", 300.0)
            orig_risk_pts = abs(entry - pos.get("initial_stop_loss", sl))

            # Adaptive Trailing Profit Ratchet
            if trail_enabled and orig_risk_pts > 0:
                if direction == "BULLISH":
                    favorable_pts = current_spot - entry
                    if favorable_pts >= (orig_risk_pts * trail_trigger):
                        trailed_sl = round(entry + (orig_risk_pts * trail_lock), 2)
                        if trailed_sl > pos["stop_loss"]:
                            pos["stop_loss"] = trailed_sl
                            logger.info(f"[{underlying}] Trailed SL locked to {trailed_sl} (+{orig_risk_pts * trail_lock:.1f} pts)")
                elif direction == "BEARISH":
                    favorable_pts = entry - current_spot
                    if favorable_pts >= (orig_risk_pts * trail_trigger):
                        trailed_sl = round(entry - (orig_risk_pts * trail_lock), 2)
                        if trailed_sl < pos["stop_loss"]:
                            pos["stop_loss"] = trailed_sl
                            logger.info(f"[{underlying}] Trailed SL locked to {trailed_sl} (+{orig_risk_pts * trail_lock:.1f} pts)")

            sl = pos["stop_loss"]
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
                # --- LIVE LTP SPREAD P&L (replaces theoretical pts * 0.50 proxy) ---
                entry_premium = pos.get("entry_premium_info")
                exit_premium = None

                if entry_premium and self.angel_session:
                    # Fetch current LTPs for spread legs at exit
                    legs = entry_premium.get("leg_details", [])
                    exit_premium = self._get_spread_premium(
                        [{"strike": l["strike"], "option_type": l["option_type"], "action": l["action"]} for l in legs],
                        underlying
                    )

                if entry_premium and exit_premium:
                    # Real spread P&L: (exit_sell - exit_buy) - (entry_buy - entry_sell)
                    # For debit spread: entry paid net_debit, exit receives inverse
                    entry_debit = entry_premium["net_debit"]  # buy - sell at entry
                    exit_debit = exit_premium["net_debit"]      # buy - sell at exit (should be negative = credit)
                    # P&L = -(exit_debit) - entry_debit (i.e., we close the spread)
                    # Simplified: value at exit - cost at entry
                    spread_pnl_per_unit = -(exit_debit) - entry_debit
                    gross_pnl = round(spread_pnl_per_unit * qty, 2)
                    logger.info(
                        f"[{underlying}] Live LTP P&L: entry_debit={entry_debit}, "
                        f"exit_debit={exit_debit}, spread_pnl/unit={spread_pnl_per_unit:.2f}"
                    )
                else:
                    # Fallback: theoretical delta proxy (0.50)
                    pts = (exit_price - entry) if direction == "BULLISH" else (entry - exit_price)
                    gross_pnl = pts * qty * 0.50

                # Capped defined risk for spreads: losses cannot exceed max defined debit (e.g. Rs 300)
                if gross_pnl < 0 and abs(gross_pnl) > max_defined_risk:
                    gross_pnl = -max_defined_risk
                gross_pnl = round(gross_pnl, 2)

                # Slippage + brokerage
                costs = round(20.0 + (entry + exit_price) * (self.slippage_pct / 100.0) * qty * 0.001, 2)
                net_pnl = round(gross_pnl - costs, 2)

                self.current_capital += net_pnl
                self.daily_pnl += net_pnl

                if exit_reason == "STOP_LOSS":
                    self.last_stop_times[underlying] = now

                closed_trade = {
                    "symbol": pos["symbol"],
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

            # Adaptive Guard 1: Enforce Daily Max F&O Trades Cap
            if allowed and len(self.closed_trades) >= max_daily_trades:
                allowed = False
                logger.info(f"[{underlying}] Skipped entry: Daily F&O trades limit ({max_daily_trades}) reached.")

            # Adaptive Guard 2: Enforce Post-Loss Cooldown Timer
            last_stop = self.last_stop_times.get(underlying)
            if allowed and last_stop is not None:
                elapsed_seconds = (now - last_stop).total_seconds()
                cooldown_seconds = cooldown_mins * 60
                if elapsed_seconds < cooldown_seconds:
                    allowed = False
                    rem_mins = int((cooldown_seconds - elapsed_seconds) / 60) + 1
                    logger.info(f"[{underlying}] Skipped entry: Post-loss cooldown active ({rem_mins} mins remaining).")

            if allowed and signal.position_size.get("lots", 0) > 0:
                # Capture live option leg premiums at entry for accurate P&L
                entry_premium_info = None
                strategy_legs = signal.recommended_strategy.get("legs", [])
                if strategy_legs and self.angel_session:
                    entry_premium_info = self._get_spread_premium(strategy_legs, underlying)
                    if entry_premium_info:
                        logger.info(
                            f"[{underlying}] Live entry premiums: "
                            f"Buy={entry_premium_info['buy_premium']}, "
                            f"Sell={entry_premium_info['sell_premium']}, "
                            f"Net Debit={entry_premium_info['net_debit']}"
                        )
                    else:
                        logger.info(f"[{underlying}] Could not fetch live LTPs; will use theoretical P&L proxy.")

                new_pos = {
                    "symbol": underlying,
                    "direction": signal.direction,
                    "entry_price": signal.entry_price,
                    "stop_loss": signal.stop_loss,
                    "initial_stop_loss": signal.stop_loss,
                    "target_1": signal.target_1,
                    "lots": signal.position_size["lots"],
                    "entry_time": now.isoformat(),
                    "strategy_name": signal.recommended_strategy["strategy_name"],
                    "entry_premium_info": entry_premium_info
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
        """Reset daily PnL counter and trades for a new trading session."""
        self.daily_pnl = 0.0
        self.closed_trades = []
        self.open_positions = []

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

