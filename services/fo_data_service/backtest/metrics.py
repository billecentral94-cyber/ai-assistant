"""
Backtesting Performance Metrics Calculator.
Computes institutional-grade metrics: Win Rate, Profit Factor, Sharpe Ratio,
Max Drawdown, Expectancy, and Calmar Ratio.
"""

import math
from typing import List, Dict, Any


def compute_performance_metrics(
    trades: List[Dict[str, Any]],
    initial_capital: float = 500000.0,
    risk_free_rate: float = 0.065  # 6.5% annual risk-free rate for India
) -> Dict[str, Any]:
    """
    Computes statistical and risk-adjusted performance metrics for closed trades.

    Expected trade structure:
    {
        "pnl": float,
        "entry_price": float,
        "exit_price": float,
        "entry_time": str,
        "exit_time": str,
        "duration_minutes": int,
        "exit_reason": "TARGET_1" | "TARGET_2" | "STOP_LOSS" | "EOD_EXIT"
    }
    """
    if not trades:
        return {
            "total_trades": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "win_rate_pct": 0.0,
            "profit_factor": 0.0,
            "total_pnl": 0.0,
            "return_on_capital_pct": 0.0,
            "avg_trade_pnl": 0.0,
            "avg_win": 0.0,
            "avg_loss": 0.0,
            "risk_reward_achieved": 0.0,
            "max_drawdown_rupees": 0.0,
            "max_drawdown_pct": 0.0,
            "sharpe_ratio": 0.0,
            "calmar_ratio": 0.0,
            "expectancy_rupees": 0.0
        }

    total_trades = len(trades)
    winning_trades = [t for t in trades if t.get("pnl", 0) > 0]
    losing_trades = [t for t in trades if t.get("pnl", 0) < 0]
    breakeven_trades = [t for t in trades if t.get("pnl", 0) == 0]

    num_wins = len(winning_trades)
    num_losses = len(losing_trades)

    gross_profit = sum(t.get("pnl", 0) for t in winning_trades)
    gross_loss = abs(sum(t.get("pnl", 0) for t in losing_trades))
    total_pnl = round(gross_profit - gross_loss, 2)

    win_rate_pct = round((num_wins / total_trades) * 100.0, 2) if total_trades > 0 else 0.0
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 0.0)

    avg_win = round(gross_profit / num_wins, 2) if num_wins > 0 else 0.0
    avg_loss = round(gross_loss / num_losses, 2) if num_losses > 0 else 0.0
    rr_achieved = round(avg_win / avg_loss, 2) if avg_loss > 0 else 0.0

    # Expectancy = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
    p_win = num_wins / total_trades if total_trades > 0 else 0.0
    p_loss = num_losses / total_trades if total_trades > 0 else 0.0
    expectancy = round((p_win * avg_win) - (p_loss * avg_loss), 2)

    # Calculate Drawdown series & Max Drawdown
    equity = initial_capital
    peak_equity = initial_capital
    max_dd_rupees = 0.0
    max_dd_pct = 0.0

    returns = []

    for t in trades:
        pnl = t.get("pnl", 0)
        ret = pnl / equity if equity > 0 else 0.0
        returns.append(ret)

        equity += pnl
        if equity > peak_equity:
            peak_equity = equity

        dd_rupees = peak_equity - equity
        dd_pct = (dd_rupees / peak_equity) * 100.0 if peak_equity > 0 else 0.0

        if dd_rupees > max_dd_rupees:
            max_dd_rupees = dd_rupees
        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct

    # Annualized Sharpe Ratio
    # Assuming ~250 trading days / year, avg ~2 trades per day = ~500 trades per year
    if len(returns) > 1:
        mean_ret = sum(returns) / len(returns)
        var_ret = sum((r - mean_ret) ** 2 for r in returns) / (len(returns) - 1)
        std_ret = math.sqrt(var_ret) if var_ret > 0 else 0.0

        # Annualized scaling factor (approx 250 trading days * 2 cycles/day = ~500)
        annual_factor = math.sqrt(500)
        daily_rf = risk_free_rate / 250.0
        excess_mean = mean_ret - (daily_rf / 2.0)
        sharpe_ratio = round((excess_mean / std_ret) * annual_factor, 2) if std_ret > 0 else 0.0
    else:
        sharpe_ratio = 0.0

    return_on_capital_pct = round((total_pnl / initial_capital) * 100.0, 2)
    calmar_ratio = round(return_on_capital_pct / max_dd_pct, 2) if max_dd_pct > 0 else (99.0 if return_on_capital_pct > 0 else 0.0)

    return {
        "total_trades": total_trades,
        "winning_trades": num_wins,
        "losing_trades": num_losses,
        "win_rate_pct": win_rate_pct,
        "profit_factor": profit_factor,
        "total_pnl": total_pnl,
        "return_on_capital_pct": return_on_capital_pct,
        "avg_trade_pnl": round(total_pnl / total_trades, 2) if total_trades > 0 else 0.0,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "risk_reward_achieved": rr_achieved,
        "max_drawdown_rupees": round(max_dd_rupees, 2),
        "max_drawdown_pct": round(max_dd_pct, 2),
        "sharpe_ratio": sharpe_ratio,
        "calmar_ratio": calmar_ratio,
        "expectancy_rupees": expectancy
    }
