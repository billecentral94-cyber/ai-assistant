"""
Comprehensive Audit Gate K Test Suite: Paper Trading & Alert System.
Validates live order lifecycle, stop-loss / target exits, automated 15:15 EOD square-offs,
and Telegram notification dispatch formatting.
"""

from datetime import datetime
import pytz
import pytest

from strategy.paper_trader import PaperTrader
from strategy.signal_generator import SignalGenerator, Signal
from strategy.risk_manager import RiskManager
from notifications.telegram_bot import TelegramNotifier

IST = pytz.timezone("Asia/Kolkata")


class TestPaperTradingAuditGate:
    """Audit Gate K: Verifies paper order lifecycle and alerting."""

    @pytest.fixture
    def setup_paper_trader(self):
        risk_mgr = RiskManager(max_risk_per_trade_pct=1.5)
        sig_gen = SignalGenerator(risk_manager=risk_mgr)
        trader = PaperTrader(
            signal_generator=sig_gen,
            risk_manager=risk_mgr,
            initial_capital=500000.0,
            lot_size=25,
            slippage_pct=0.05
        )
        return trader

    def test_paper_trader_target_hit(self, setup_paper_trader):
        trader = setup_paper_trader
        t1 = datetime(2026, 9, 4, 10, 0, tzinfo=IST)

        signal = Signal(
            symbol="NIFTY",
            direction="BULLISH",
            confluence_score=4,
            confluences_triggered=["Futures Long Buildup", "PCR 1.2"],
            entry_price=24500.0,
            stop_loss=24400.0,
            target_1=24600.0,
            target_2=24700.0,
            risk_reward_ratio=1.5,
            recommended_strategy={"strategy_name": "Bull Call Spread", "risk_profile": "Defined max loss"},
            position_size={"lots": 2, "quantity": 50, "risk_pct": 1.0},
            is_actionable=True,
            timestamp=t1
        )

        # 1. Cycle 1: Position opened at 24500
        res1 = trader.process_cycle(underlying="NIFTY", current_spot=24500.0, signal=signal, timestamp=t1)
        assert res1["open_positions"] == 1
        assert len(res1["events"]) == 1
        assert res1["events"][0]["event"] == "POSITION_OPENED"

        # 2. Cycle 2: Spot rises to 24610 >= target 1 (24600) -> Closed with profit
        t2 = datetime(2026, 9, 4, 10, 15, tzinfo=IST)
        res2 = trader.process_cycle(underlying="NIFTY", current_spot=24610.0, signal=None, timestamp=t2)
        assert res2["open_positions"] == 0
        assert res2["closed_trades_count"] == 1
        assert res2["events"][0]["event"] == "POSITION_CLOSED"

        trade = res2["events"][0]["trade"]
        assert trade["exit_reason"] == "TARGET_1"
        assert trade["net_pnl"] > 0
        assert trader.current_capital > trader.initial_capital

    def test_paper_trader_stop_loss(self, setup_paper_trader):
        trader = setup_paper_trader
        t1 = datetime(2026, 9, 4, 11, 0, tzinfo=IST)

        signal = Signal(
            symbol="NIFTY",
            direction="BULLISH",
            confluence_score=3,
            confluences_triggered=["PCR 1.1"],
            entry_price=24500.0,
            stop_loss=24400.0,
            target_1=24650.0,
            target_2=24750.0,
            risk_reward_ratio=1.5,
            recommended_strategy={"strategy_name": "Bull Call Spread", "risk_profile": "Defined max loss"},
            position_size={"lots": 2, "quantity": 50, "risk_pct": 1.0},
            is_actionable=True,
            timestamp=t1
        )

        trader.process_cycle(underlying="NIFTY", current_spot=24500.0, signal=signal, timestamp=t1)
        assert len(trader.open_positions) == 1

        # Spot crashes to 24380 <= stop loss (24400)
        t2 = datetime(2026, 9, 4, 11, 15, tzinfo=IST)
        res = trader.process_cycle(underlying="NIFTY", current_spot=24380.0, signal=None, timestamp=t2)
        assert len(trader.open_positions) == 0
        assert len(trader.closed_trades) == 1

        trade = trader.closed_trades[0]
        assert trade["exit_reason"] == "STOP_LOSS"
        assert trade["net_pnl"] < 0

    def test_paper_trader_eod_square_off(self, setup_paper_trader):
        trader = setup_paper_trader
        t1 = datetime(2026, 9, 4, 14, 0, tzinfo=IST)

        signal = Signal(
            symbol="NIFTY",
            direction="BULLISH",
            confluence_score=4,
            confluences_triggered=["Long Buildup"],
            entry_price=24500.0,
            stop_loss=24300.0,
            target_1=24800.0,
            target_2=24900.0,
            risk_reward_ratio=1.5,
            recommended_strategy={"strategy_name": "Bull Call Spread", "risk_profile": "Defined max loss"},
            position_size={"lots": 1, "quantity": 25, "risk_pct": 0.8},
            is_actionable=True,
            timestamp=t1
        )
        trader.process_cycle(underlying="NIFTY", current_spot=24500.0, signal=signal, timestamp=t1)
        assert len(trader.open_positions) == 1

        # Time reaches 15:15 IST -> Automatic Square-off enforced
        t_eod = datetime(2026, 9, 4, 15, 15, tzinfo=IST)
        res = trader.process_cycle(underlying="NIFTY", current_spot=24530.0, signal=None, timestamp=t_eod)

        assert len(trader.open_positions) == 0
        assert len(trader.closed_trades) == 1
        assert trader.closed_trades[0]["exit_reason"] == "EOD_SQUARE_OFF"

    def test_telegram_notifier_formatting(self):
        bot = TelegramNotifier()  # Unconfigured mode -> simulates dispatch cleanly

        signal = Signal(
            symbol="NIFTY",
            direction="BULLISH",
            confluence_score=4,
            confluences_triggered=["Futures Long Buildup", "PCR 1.25", "OI Put Wall Support"],
            entry_price=24520.0,
            stop_loss=24420.0,
            target_1=24670.0,
            target_2=24770.0,
            risk_reward_ratio=1.5,
            recommended_strategy={"strategy_name": "Bull Call Spread"},
            position_size={"lots": 2, "risk_pct": 1.0},
            is_actionable=True,
            timestamp=datetime.now()
        )

        assert bot.send_signal_alert(signal) is True
        assert bot.send_trade_closed_alert({
            "symbol": "NIFTY",
            "exit_reason": "TARGET_1",
            "strategy": "Bull Call Spread",
            "exit_price": 24670.0,
            "net_pnl": 3750.0
        }) is True
        assert bot.send_risk_alert("KILL_SWITCH_ENGAGED", "Daily loss limit reached") is True
        assert bot.send_daily_summary({
            "date": "2026-09-04",
            "total_trades": 2,
            "wins": 2,
            "losses": 0,
            "total_pnl": 5800.0,
            "capital": 505800.0
        }) is True
