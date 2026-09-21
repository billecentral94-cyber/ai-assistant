"""
Backtest Simulation Engine.
Replays SignalGenerator and RiskManager over historical candles with realistic slippage,
brokerage friction, and zero future data leakage.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime

from strategy.signal_generator import SignalGenerator, Signal
from strategy.risk_manager import RiskManager
from .metrics import compute_performance_metrics


class BacktestRunner:
    """
    Simulates execution of confluence-driven hedged strategies over historical market data.
    """

    def __init__(
        self,
        signal_generator: Optional[SignalGenerator] = None,
        risk_manager: Optional[RiskManager] = None,
        initial_capital: float = 500000.0,
        slippage_pct: float = 0.05,       # 0.05% per leg execution slippage
        brokerage_per_order: float = 20.0, # ₹20 per executed leg (standard discount broker)
        step_size: float = 50.0,
        lot_size: int = 25
    ):
        self.signal_generator = signal_generator or SignalGenerator()
        self.risk_manager = risk_manager or RiskManager()
        self.initial_capital = initial_capital
        self.slippage_pct = slippage_pct
        self.brokerage_per_order = brokerage_per_order
        self.step_size = step_size
        self.lot_size = lot_size

    def run(
        self,
        candles: List[Dict[str, Any]],
        underlying: str = "NIFTY"
    ) -> Dict[str, Any]:
        """
        Executes step-by-step sequential bar replay without future lookahead.
        """
        if not candles:
            return {"metrics": compute_performance_metrics([]), "trades": [], "equity_curve": []}

        capital = self.initial_capital
        peak_capital = self.initial_capital
        daily_pnl = 0.0
        current_day = None

        open_positions: List[Dict[str, Any]] = []
        closed_trades: List[Dict[str, Any]] = []
        equity_curve: List[Dict[str, Any]] = []

        for i, bar in enumerate(candles):
            ts_str = bar.get("timestamp", "")
            bar_date = ts_str[:10] if len(ts_str) >= 10 else "unknown"

            # Reset daily PnL on new trading day
            if bar_date != current_day:
                daily_pnl = 0.0
                current_day = bar_date
                # Reset daily kill switch for new day
                self.risk_manager.kill_switch_active = False

            high = float(bar.get("high", 0))
            low = float(bar.get("low", 0))
            close = float(bar.get("close", 0))
            open_price = float(bar.get("open", close))

            # 1. Evaluate Exits for Open Positions
            remaining_positions = []
            for pos in open_positions:
                direction = pos["direction"]
                sl = pos["stop_loss"]
                tp = pos["target_1"]
                entry = pos["entry_price"]
                lots = pos["lots"]
                qty = lots * self.lot_size

                closed = False
                exit_price = close
                exit_reason = ""

                if direction == "BULLISH":
                    if low <= sl:
                        exit_price = sl
                        exit_reason = "STOP_LOSS"
                        closed = True
                    elif high >= tp:
                        exit_price = tp
                        exit_reason = "TARGET_1"
                        closed = True
                elif direction == "BEARISH":
                    if high >= sl:
                        exit_price = sl
                        exit_reason = "STOP_LOSS"
                        closed = True
                    elif low <= tp:
                        exit_price = tp
                        exit_reason = "TARGET_1"
                        closed = True

                if closed:
                    # Point difference in underlying
                    pts = (exit_price - entry) if direction == "BULLISH" else (entry - exit_price)

                    # For a spread, capture ratio is roughly 0.5x of underlying delta
                    gross_pnl = round(pts * qty * 0.50, 2)

                    # Apply slippage & brokerage (2 legs entry + 2 legs exit = 4 orders)
                    slippage_deduction = (entry + exit_price) * (self.slippage_pct / 100.0) * qty * 0.1
                    transaction_costs = round((self.brokerage_per_order * 4) + slippage_deduction, 2)

                    net_pnl = round(gross_pnl - transaction_costs, 2)
                    capital += net_pnl
                    daily_pnl += net_pnl

                    closed_trades.append({
                        "symbol": underlying,
                        "direction": direction,
                        "entry_price": entry,
                        "exit_price": exit_price,
                        "lots": lots,
                        "quantity": qty,
                        "entry_time": pos["entry_time"],
                        "exit_time": ts_str,
                        "exit_reason": exit_reason,
                        "gross_pnl": round(gross_pnl, 2),
                        "transaction_costs": round(transaction_costs, 2),
                        "pnl": net_pnl,
                        "strategy": pos["strategy_name"]
                    })
                else:
                    remaining_positions.append(pos)

            open_positions = remaining_positions

            # Update peak equity and drawdown
            if capital > peak_capital:
                peak_capital = capital
            current_dd_pct = ((peak_capital - capital) / peak_capital) * 100.0 if peak_capital > 0 else 0.0

            # 2. Check Signals for New Entries (Only if slots available)
            if len(open_positions) < self.risk_manager.max_open_positions and i >= 3:
                # Use strictly prior data up to current bar to synthesize analytics
                prev_bar = candles[i - 1]
                price_chg = close - float(prev_bar.get("close", close))

                # Synthetic analytics derived from historical bar dynamics
                buildup_type = "Long Buildup" if price_chg > 15 else ("Short Buildup" if price_chg < -15 else "Neutral")
                pcr_val = 1.15 if price_chg > 0 else 0.75
                max_pain_val = round(close / 100.0) * 100.0

                oi_walls = [
                    {"strike": max_pain_val - 200, "option_type": "PE", "wall_rank": 1},
                    {"strike": max_pain_val + 200, "option_type": "CE", "wall_rank": 1}
                ]

                sig = self.signal_generator.generate_signal(
                    underlying=underlying,
                    spot_price=close,
                    oi_walls=oi_walls,
                    pcr_data={"overall_pcr": pcr_val, "pcr_trend": "rising" if price_chg > 0 else "falling", "sentiment_zone": "neutral"},
                    buildup_data={"buildup_type": buildup_type},
                    iv_data={"iv_percentile": 40.0, "iv_regime": "normal"},
                    max_pain_data={"max_pain_strike": max_pain_val},
                    account_capital=capital,
                    step_size=self.step_size,
                    lot_size=self.lot_size
                )

                if sig.is_actionable:
                    allowed, reason = self.risk_manager.check_trade_allowed(
                        account_capital=capital,
                        current_open_positions=len(open_positions),
                        daily_realized_loss=daily_pnl,
                        current_drawdown_pct=current_dd_pct
                    )

                    if allowed and sig.position_size.get("lots", 0) > 0:
                        open_positions.append({
                            "direction": sig.direction,
                            "entry_price": sig.entry_price,
                            "stop_loss": sig.stop_loss,
                            "target_1": sig.target_1,
                            "lots": sig.position_size["lots"],
                            "entry_time": ts_str,
                            "strategy_name": sig.recommended_strategy["strategy_name"]
                        })

            equity_curve.append({
                "timestamp": ts_str,
                "capital": round(capital, 2),
                "open_positions": len(open_positions),
                "drawdown_pct": round(current_dd_pct, 2)
            })

        metrics = compute_performance_metrics(closed_trades, initial_capital=self.initial_capital)

        return {
            "initial_capital": self.initial_capital,
            "final_capital": round(capital, 2),
            "metrics": metrics,
            "trades": closed_trades,
            "equity_curve": equity_curve
        }
