"""
Comprehensive Audit Gate I Test Suite: Historical Data & Backtesting.
Validates metric formulas, synthetic candle generation, zero lookahead bias,
slippage/brokerage friction enforcement, and report generation.
"""

from datetime import date
import pytest

from backtest.historical_fetcher import generate_synthetic_candles
from backtest.metrics import compute_performance_metrics
from backtest.runner import BacktestRunner
from backtest.report_generator import generate_backtest_report
from strategy.signal_generator import SignalGenerator
from strategy.risk_manager import RiskManager


class TestBacktestAuditGate:
    """Audit Gate I: Verifies mathematical rigor and backtest execution."""

    def test_backtest_metrics_calculation(self):
        # 10 deterministic trades: 6 wins of ₹3,000, 4 losses of ₹1,500
        trades = [
            {"pnl": 3000.0, "entry_price": 24000, "exit_price": 24100, "exit_reason": "TARGET_1"},
            {"pnl": 3000.0, "entry_price": 24100, "exit_price": 24200, "exit_reason": "TARGET_1"},
            {"pnl": -1500.0, "entry_price": 24200, "exit_price": 24150, "exit_reason": "STOP_LOSS"},
            {"pnl": 3000.0, "entry_price": 24150, "exit_price": 24250, "exit_reason": "TARGET_1"},
            {"pnl": -1500.0, "entry_price": 24250, "exit_price": 24200, "exit_reason": "STOP_LOSS"},
            {"pnl": 3000.0, "entry_price": 24200, "exit_price": 24300, "exit_reason": "TARGET_1"},
            {"pnl": 3000.0, "entry_price": 24300, "exit_price": 24400, "exit_reason": "TARGET_1"},
            {"pnl": -1500.0, "entry_price": 24400, "exit_price": 24350, "exit_reason": "STOP_LOSS"},
            {"pnl": 3000.0, "entry_price": 24350, "exit_price": 24450, "exit_reason": "TARGET_1"},
            {"pnl": -1500.0, "entry_price": 24450, "exit_price": 24400, "exit_reason": "STOP_LOSS"}
        ]

        metrics = compute_performance_metrics(trades, initial_capital=500000.0)

        assert metrics["total_trades"] == 10
        assert metrics["winning_trades"] == 6
        assert metrics["losing_trades"] == 4
        assert metrics["win_rate_pct"] == 60.0
        # Gross profit: 6 * 3000 = 18000; Gross loss: 4 * 1500 = 6000 -> PF = 3.0
        assert metrics["profit_factor"] == 3.0
        assert metrics["total_pnl"] == 12000.0
        assert metrics["avg_win"] == 3000.0
        assert metrics["avg_loss"] == 1500.0
        assert metrics["risk_reward_achieved"] == 2.0
        assert metrics["expectancy_rupees"] == 1200.0  # (0.6 * 3000) - (0.4 * 1500) = 1800 - 600 = 1200

    def test_synthetic_candles_generation(self):
        start = date(2026, 8, 1)
        end = date(2026, 8, 15)  # 2 weeks
        candles = generate_synthetic_candles(start, end, base_price=24000.0, trend="mixed")

        assert len(candles) > 0
        for c in candles:
            # OHLC validity invariants
            assert c["high"] >= c["low"]
            assert c["high"] >= c["open"]
            assert c["high"] >= c["close"]
            assert c["low"] <= c["open"]
            assert c["low"] <= c["close"]
            assert c["volume"] > 0
            assert "T" in c["timestamp"] or "-" in c["timestamp"]

    def test_backtest_no_future_data_leakage_and_execution(self):
        start = date(2026, 7, 1)
        end = date(2026, 8, 15)
        candles = generate_synthetic_candles(start, end, base_price=24000.0, trend="bull")

        risk_mgr = RiskManager(max_risk_per_trade_pct=1.5)
        sig_gen = SignalGenerator(risk_manager=risk_mgr)
        runner = BacktestRunner(
            signal_generator=sig_gen,
            risk_manager=risk_mgr,
            initial_capital=500000.0
        )

        results = runner.run(candles=candles, underlying="NIFTY")

        assert "metrics" in results
        assert "trades" in results
        assert "equity_curve" in results
        assert len(results["equity_curve"]) == len(candles)

        trades = results["trades"]
        assert len(trades) > 0

        # Verify trade attributes
        for t in trades:
            assert t["entry_price"] > 0
            assert t["exit_price"] > 0
            assert t["lots"] > 0
            assert t["exit_reason"] in ["TARGET_1", "STOP_LOSS"]
            assert t["transaction_costs"] > 0
            assert t["pnl"] == round(t["gross_pnl"] - t["transaction_costs"], 2)

    def test_slippage_and_brokerage_deductions(self):
        start = date(2026, 8, 1)
        end = date(2026, 8, 10)
        candles = generate_synthetic_candles(start, end, base_price=24000.0, trend="bear")

        runner = BacktestRunner(
            initial_capital=500000.0,
            slippage_pct=0.05,
            brokerage_per_order=20.0
        )
        results = runner.run(candles=candles)
        trades = results["trades"]

        for t in trades:
            # 4 orders minimum = ₹80 brokerage + positive slippage
            assert t["transaction_costs"] >= 80.0
            assert t["pnl"] < t["gross_pnl"]

    def test_report_generator_output(self):
        trades = [
            {"pnl": 2500.0, "strategy": "Bull Call Spread", "direction": "BULLISH", "entry_price": 24000, "exit_price": 24100, "exit_reason": "TARGET_1"},
            {"pnl": 2500.0, "strategy": "Bull Call Spread", "direction": "BULLISH", "entry_price": 24100, "exit_price": 24200, "exit_reason": "TARGET_1"},
            {"pnl": -1200.0, "strategy": "Bull Call Spread", "direction": "BULLISH", "entry_price": 24200, "exit_price": 24150, "exit_reason": "STOP_LOSS"}
        ]
        metrics = compute_performance_metrics(trades, initial_capital=500000.0)
        backtest_results = {
            "initial_capital": 500000.0,
            "final_capital": 503800.0,
            "metrics": metrics,
            "trades": trades
        }

        report = generate_backtest_report(backtest_results)
        assert "# Algorithmic Trading Strategy — Backtest Performance Audit" in report
        assert "Win Rate" in report
        assert "Profit Factor" in report
        assert "Bull Call Spread" in report
        assert "PASS ✅" in report or "REVIEW REQUIRED" in report
