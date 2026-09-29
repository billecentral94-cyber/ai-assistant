"""
F&O Data Retrieval Service — CLI Entrypoint.
Provides commands for running live retrieval, market-hour dry-runs, EOD gap audits,
autonomous paper trading, and DB init.
"""

import sys
import argparse
import logging
import time
from datetime import datetime, date
from typing import Dict, Any
import pytz

from config.settings import settings
from db.connection import init_db, get_engine
from orchestrator.scheduler import is_market_open, get_next_run_time, IST, MarketScheduler
from orchestrator.runner import FetchOrchestrator
from audit.reporter import DailyAuditReporter
from strategy.signal_generator import SignalGenerator
from strategy.paper_trader import PaperTrader
from strategy.equity_intraday_trader import EquityIntradayTrader, EQUITY_UNIVERSE
from notifications.telegram_bot import TelegramNotifier, archive_daily_record

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("fo_data_service")


def cmd_init_db(args):
    """Initializes database tables."""
    logger.info("Initializing database tables (CREATE TABLE IF NOT EXISTS)...")
    init_db()
    logger.info("Database schema initialized successfully.")


def cmd_dry_run(args):
    """Runs a dry-run scheduler simulation over a sample date range."""
    scheduler = MarketScheduler(interval_minutes=settings.INTERVAL_MINUTES)
    start_dt = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    end_dt = start_dt.replace(hour=23, minute=45)
    
    logger.info(f"Executing dry-run for {start_dt.date()}...")
    log = scheduler.dry_run(start_dt, end_dt, step_minutes=settings.INTERVAL_MINUTES)
    
    print("\n--- SCHEDULER DRY RUN RESULTS ---")
    for item in log:
        status = "TRIGGER" if item["should_run"] else f"SKIP ({item['reason']})"
        print(f"[{item['timestamp_ist']}] -> {status}")
    print(f"\nTotal Slots Evaluated: {len(log)} | Active Triggers: {sum(1 for i in log if i['should_run'])}")


def cmd_eod_audit(args):
    """Runs End-of-Day gap reconciliation and prints formatted report."""
    target_date = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else datetime.now(IST).date()
    logger.info(f"Running EOD reconciliation audit for {target_date}...")
    reporter = DailyAuditReporter()
    report = reporter.generate_report(target_date)
    print("\n" + report["report_text"] + "\n")


def cmd_run(args):
    """Starts the continuous market-hours retrieval daemon."""
    logger.info("Starting F&O Data Retrieval Service Daemon...")
    init_db()
    orchestrator = FetchOrchestrator()
    underlyings = settings.UNDERLYINGS

    while True:
        now_ist = datetime.now(IST)
        is_open, reason = is_market_open(now_ist)

        if is_open:
            logger.info(f"Market OPEN (Time: {now_ist.strftime('%H:%M:%S IST')}). Executing retrieval cycle...")
            for sym in underlyings:
                # 1. Option Chain
                logger.info(f"Fetching Option Chain for {sym}...")
                opt_res = orchestrator.fetch_and_store_option_chain(sym, captured_at=now_ist)
                logger.info(f"Option Chain {sym}: {opt_res}")

                # 2. Futures
                logger.info(f"Fetching Futures for {sym}...")
                fut_res = orchestrator.fetch_and_store_futures(sym, captured_at=now_ist)
                logger.info(f"Futures {sym}: {fut_res}")

        else:
            logger.info(f"Market CLOSED ({reason}). Standing by for next cycle...")

        next_run = get_next_run_time(now_ist, interval_minutes=settings.INTERVAL_MINUTES)
        sleep_seconds = max((next_run - datetime.now(IST)).total_seconds(), 5.0)
        logger.info(f"Next aligned cycle scheduled at {next_run.strftime('%Y-%m-%d %H:%M:%S IST')} (sleeping for {sleep_seconds:.1f}s)")
        time.sleep(sleep_seconds)


def cmd_run_once(args):
    """Executes a single immediate retrieval and analytics cycle."""
    logger.info("Executing single immediate F&O cycle...")
    init_db()
    orchestrator = FetchOrchestrator()
    now_ist = datetime.now(IST)

    for sym in settings.UNDERLYINGS:
        logger.info(f"--- Processing {sym} ---")
        try:
            opt_res = orchestrator.fetch_and_store_option_chain(sym, captured_at=now_ist)
            logger.info(f"Option Chain {sym}: {opt_res}")
        except Exception as e:
            logger.error(f"Option Chain error {sym}: {e}")

        try:
            fut_res = orchestrator.fetch_and_store_futures(sym, captured_at=now_ist)
            logger.info(f"Futures {sym}: {fut_res}")
        except Exception as e:
            logger.error(f"Futures error {sym}: {e}")

    logger.info("Single F&O cycle completed successfully.")


# ═══════════════════════════════════════════════════════════════════════════════
#  AUTONOMOUS PAPER TRADING ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def _run_trade_cycle(orchestrator, analytics_engine, signal_gen, paper_trader, underlying, now_ist):
    """Execute a single fetch -> analytics -> signal -> trade cycle for one underlying."""
    step = 50.0 if underlying == "NIFTY" else 100.0
    lot_size = 25 if underlying == "NIFTY" else 15

    try:
        # 1. Fetch live data from Angel One SmartAPI (with circuit breaker + fallback)
        logger.info(f"[{underlying}] Fetching option chain...")
        opt_res = orchestrator.fetch_and_store_option_chain(underlying, captured_at=now_ist)
        logger.info(f"[{underlying}] Option chain: {opt_res.get('status', 'ok')}")

        logger.info(f"[{underlying}] Fetching futures...")
        fut_res = orchestrator.fetch_and_store_futures(underlying, captured_at=now_ist)
        logger.info(f"[{underlying}] Futures: {fut_res.get('status', 'ok')}")

        # 2. Get latest analytics from DB (OI walls, PCR, buildup, IV, max pain)
        analytics = analytics_engine.get_latest_analytics(underlying)
        spot = analytics.get("spot_price", 0.0)

        if spot <= 0:
            spot = orchestrator.angel_opt_fallback.fetch_spot_price(underlying)
            analytics["spot_price"] = spot

        if spot <= 0:
            logger.warning(f"[{underlying}] No spot price available. Skipping signal generation.")
            return

        # 3. Generate confluence signal (requires >= 3/5 factors)
        signal = signal_gen.generate_signal(
            underlying=underlying,
            spot_price=spot,
            oi_walls=analytics["oi_walls"],
            pcr_data=analytics["pcr_data"],
            buildup_data=analytics["buildup_data"],
            iv_data=analytics["iv_data"],
            max_pain_data=analytics["max_pain_data"],
            account_capital=paper_trader.current_capital,
            step_size=step,
            lot_size=lot_size,
            timestamp=now_ist
        )

        logger.info(
            f"[{underlying}] Signal: {signal.direction} | "
            f"Confluence: {signal.confluence_score}/5 | "
            f"Actionable: {signal.is_actionable}"
        )

        # 4. Feed into paper trader (auto entry, SL/target check, EOD square-off)
        result = paper_trader.process_cycle(
            underlying=underlying,
            current_spot=spot,
            signal=signal,
            timestamp=now_ist
        )

        # Log trade events
        for event in result.get("events", []):
            if event["event"] == "POSITION_OPENED":
                pos = event["position"]
                logger.info(
                    f"[TRADE] OPENED {pos['direction']} {pos['symbol']} @ {pos['entry_price']} | "
                    f"SL: {pos['stop_loss']} | Target: {pos['target_1']} | "
                    f"Strategy: {pos['strategy_name']}"
                )
            elif event["event"] == "POSITION_CLOSED":
                trade = event["trade"]
                pnl_sign = "+" if trade["net_pnl"] >= 0 else ""
                logger.info(
                    f"[TRADE] CLOSED {trade['direction']} {trade['symbol']} @ {trade['exit_price']} | "
                    f"Reason: {trade['exit_reason']} | PnL: {pnl_sign}{trade['net_pnl']}"
                )

        return signal
    except Exception as e:
        logger.error(f"[{underlying}] Trade cycle error: {e}", exc_info=True)
        return None


def _fetch_equity_quotes(session_mgr, timeout: int = 12) -> Dict[str, Dict[str, Any]]:
    """Fetches real-time LTP, High, Low, Open quotes for multi-sector equity cash universe from Angel One with retry."""
    token_map = {item["token"]: item["symbol"] for item in EQUITY_UNIVERSE}
    for attempt in range(2):
        try:
            headers = session_mgr._get_headers(with_auth=True)
            payload = {"mode": "FULL", "exchangeTokens": {"NSE": list(token_map.keys())}}
            resp = session_mgr.session.post(
                "https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/",
                json=payload,
                headers=headers,
                timeout=timeout
            )
            data = resp.json().get("data", {}).get("fetched", [])
            quotes = {token_map[item["symbolToken"]]: item for item in data if item.get("symbolToken") in token_map}
            if quotes:
                return quotes
        except Exception as e:
            if attempt == 0:
                time.sleep(2)
                continue
            logger.warning(f"Failed to fetch equity quotes from Angel One: {e}")
    return {}


def cmd_auto_trade(args):
    """
    Starts the fully autonomous paper trading daemon.
    Executes the complete pipeline every 15 minutes during market hours:
      Fetch (Angel One) -> Analytics -> Confluence Signal -> Paper Trade -> State Persist
    At 15:35 IST, runs EOD Readiness Gate reconciliation.
    """
    logger.info("=" * 64)
    logger.info("  ARTHA AI COPILOT — AUTONOMOUS PAPER TRADING ENGINE")
    logger.info("  Mode: PAPER (No real capital deployed)")
    logger.info("  Risk Cap: <= 2% per trade | Hedged defined-risk spreads only")
    logger.info("=" * 64)

    init_db()
    orchestrator = FetchOrchestrator()
    analytics_engine = orchestrator.analytics_engine
    signal_gen = SignalGenerator()
    paper_trader = PaperTrader(signal_generator=signal_gen)
    equity_trader = EquityIntradayTrader()
    telegram = TelegramNotifier()

    cycle_count = 0

    # ── Remote 2-Way Mobile Callbacks (/status, /today) ──
    def get_mobile_status() -> str:
        n_pos = len(paper_trader.open_positions)
        eq_pos = len(equity_trader.open_positions)
        tot_pnl = paper_trader.daily_pnl + equity_trader.daily_pnl
        sign = "+" if tot_pnl >= 0 else ""
        return (
            f"📊 *ARTHA LIVE PORTFOLIO STATUS*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *F&O Micro-Vault (₹5k):* ₹{paper_trader.current_capital:,.2f} (PnL: ₹{paper_trader.daily_pnl:+,.2f} | Open: {n_pos})\n"
            f"• *Equity Vault (₹2.5k):* ₹{equity_trader.current_capital:,.2f} (PnL: ₹{equity_trader.daily_pnl:+,.2f} | Open: {eq_pos})\n"
            f"• *Combined Today P&L:* *{sign}₹{tot_pnl:,.2f}*\n"
            f"• *Completed Cycles:* #{cycle_count}\n"
            f"• *Broker Link:* Angel One (Active)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━"
        )

    def get_today_mobile_trades() -> str:
        all_closed = paper_trader.closed_trades + equity_trader.closed_trades
        if not all_closed:
            return "📁 *TODAY'S TRADES:* No closed trades yet today."
        lines = ["📜 *TODAY'S COMPLETED TRADES:*", "━━━━━━━━━━━━━━━━━━━━━━"]
        for i, t in enumerate(all_closed, 1):
            sym = t.get("symbol", "N/A")
            pnl = t.get("net_pnl") or t.get("pnl", 0.0)
            reason = t.get("exit_reason", "EXIT")
            sign = "+" if pnl >= 0 else ""
            lines.append(f"{i}. *{sym}* ➔ *{sign}₹{pnl:,.2f}* ({reason})")
        tot = paper_trader.daily_pnl + equity_trader.daily_pnl
        lines.append("━━━━━━━━━━━━━━━━━━━━━━")
        lines.append(f"• *Total Daily P&L:* *{'+' if tot >= 0 else ''}₹{tot:,.2f}*")
        return "\n".join(lines)

    telegram.start_command_listener(status_fn=get_mobile_status, today_fn=get_today_mobile_trades)
    telegram.send_bot_started({
        "fo_capital": paper_trader.current_capital,
        "eq_capital": equity_trader.current_capital,
        "eq_purchasing_power": equity_trader.get_purchasing_power()
    })

    # Try to load persisted state from previous session
    if paper_trader.load_state():
        logger.info(
            f"Resumed F&O state: Capital={paper_trader.current_capital:.2f} | "
            f"Open={len(paper_trader.open_positions)} | "
            f"Closed={len(paper_trader.closed_trades)}"
        )
    else:
        logger.info(f"Fresh F&O session. Initial capital: {paper_trader.initial_capital:.2f}")

    logger.info(f"Equity Intraday session: Capital={equity_trader.current_capital:.2f} (5x Power: {equity_trader.get_purchasing_power():.2f})")

    underlyings = settings.UNDERLYINGS
    eod_audit_done_today = False
    last_audit_date = None

    # ── Simulate Mode: run one cycle immediately then exit ──
    if getattr(args, 'simulate_cycle', False):
        logger.info("SIMULATE MODE: Running one immediate cycle (ignoring market hours)...")
        now_ist = datetime.now(IST)
        last_signal_dir = "NEUTRAL"
        nifty_sig_text = "NEUTRAL"
        banknifty_sig_text = "NEUTRAL"
        for sym in underlyings:
            sig = _run_trade_cycle(orchestrator, analytics_engine, signal_gen, paper_trader, sym, now_ist)
            if sym == "NIFTY" and sig:
                last_signal_dir = sig.direction
                nifty_sig_text = f"{sig.direction} ({sig.confluence_score}/5)"
            elif sym == "BANKNIFTY" and sig:
                banknifty_sig_text = f"{sig.direction} ({sig.confluence_score}/5)"
        paper_trader.save_state()

        eq_quotes = _fetch_equity_quotes(orchestrator.angel_opt_primary.session_mgr)
        if eq_quotes:
            equity_trader.process_cycle(eq_quotes, index_trend=last_signal_dir, timestamp=now_ist)
            equity_trader.save_state()

        _print_readiness_report(paper_trader)
        logger.info("Simulate cycle complete. Exiting.")
        return

    # ── Main Autonomous Loop ──
    while True:
        now_ist = datetime.now(IST)
        now_time = now_ist.strftime("%H:%M")
        today = now_ist.date()
        is_open, reason = is_market_open(now_ist)

        # Reset daily state on new trading day
        if last_audit_date != today:
            paper_trader.reset_daily()
            eod_audit_done_today = False
            last_audit_date = today

        if is_open:
            cycle_count += 1
            logger.info(f"Market OPEN ({now_time} IST). Executing Cycle #{cycle_count}...")
            prev_fo_open = len(paper_trader.open_positions)
            prev_fo_closed = len(paper_trader.closed_trades)

            # 1. Execute F&O Options Cycle (₹5,000 threshold)
            last_signal_dir = "NEUTRAL"
            nifty_sig_text = "NEUTRAL"
            banknifty_sig_text = "NEUTRAL"
            for sym in underlyings:
                try:
                    sig = _run_trade_cycle(orchestrator, analytics_engine, signal_gen, paper_trader, sym, now_ist)
                    if sym == "NIFTY" and sig:
                        last_signal_dir = sig.direction
                        nifty_sig_text = f"{sig.direction} ({sig.confluence_score}/5)"
                    elif sym == "BANKNIFTY" and sig:
                        banknifty_sig_text = f"{sig.direction} ({sig.confluence_score}/5)"
                except Exception as fo_err:
                    logger.error(f"F&O cycle error for {sym}: {fo_err}")
                    telegram.send_error_alert(f"F&O Engine ({sym})", str(fo_err))

            paper_trader.save_state()

            # Dispatch F&O order execution & closure alerts
            if len(paper_trader.open_positions) > prev_fo_open:
                telegram.send_order_executed(paper_trader.open_positions[-1])
            if len(paper_trader.closed_trades) > prev_fo_closed:
                telegram.send_trade_closed(paper_trader.closed_trades[-1])

            # 2. Execute Equity Marginal Intraday Cycle (14 stocks)
            eq_scan_summary = "Scanning 14 stocks (No new breakout)"
            try:
                eq_quotes = _fetch_equity_quotes(orchestrator.angel_opt_primary.session_mgr)
                if eq_quotes:
                    eq_cycle = equity_trader.process_cycle(eq_quotes, index_trend=last_signal_dir, timestamp=now_ist)
                    equity_trader.save_state()
                    for ev in eq_cycle.get("events", []):
                        if ev["event"] == "EQUITY_POSITION_OPENED":
                            telegram.send_order_executed(ev["position"])
                            eq_scan_summary = f"Opened {ev['position']['symbol']}"
                        elif ev["event"] == "EQUITY_POSITION_CLOSED":
                            telegram.send_trade_closed(ev["trade"])
            except Exception as eq_err:
                logger.error(f"Equity intraday cycle error: {eq_err}")
                telegram.send_error_alert("Equity Scanner", str(eq_err))

            # Send 15-minute cycle heartbeat push notification to mobile
            telegram.send_cycle_heartbeat(
                cycle_num=cycle_count,
                time_str=now_time,
                nifty_sig=nifty_sig_text,
                banknifty_sig=banknifty_sig_text,
                equity_scan_summary=eq_scan_summary,
                open_positions_count=len(paper_trader.open_positions) + len(equity_trader.open_positions),
                daily_pnl=round(paper_trader.daily_pnl + equity_trader.daily_pnl, 2)
            )

            logger.info(
                f"[F&O Vault] Capital: {paper_trader.current_capital:.2f} | "
                f"PnL: {paper_trader.daily_pnl:+.2f} | "
                f"Open: {len(paper_trader.open_positions)} | "
                f"Closed: {len(paper_trader.closed_trades)}"
            )
            logger.info(
                f"[Equity Vault] Capital: {equity_trader.current_capital:.2f} (5x Power: {equity_trader.get_purchasing_power():.2f}) | "
                f"PnL: {equity_trader.daily_pnl:+.2f} | "
                f"Open: {len(equity_trader.open_positions)} | "
                f"Closed: {len(equity_trader.closed_trades)}"
            )

        elif now_time >= "15:35" and now_time < "16:00" and not eod_audit_done_today:
            # ── EOD Readiness Gate Reconciliation & Archiving ──
            logger.info("=" * 56)
            logger.info("  EOD READINESS GATE RECONCILIATION")
            logger.info("=" * 56)

            _print_readiness_report(paper_trader)

            # Archive permanent daily record
            summary_payload = {
                "date": str(today),
                "total_pnl": round(paper_trader.daily_pnl + equity_trader.daily_pnl, 2),
                "fo_pnl": round(paper_trader.daily_pnl, 2),
                "equity_pnl": round(equity_trader.daily_pnl, 2),
                "trades_count": len(paper_trader.closed_trades) + len(equity_trader.closed_trades),
                "capital": round(paper_trader.current_capital + equity_trader.current_capital, 2),
                "trades": paper_trader.closed_trades + equity_trader.closed_trades,
                "gates": paper_trader.get_readiness_metrics()
            }
            telegram.send_daily_summary(summary_payload)
            archive_daily_record(str(today), summary_payload)
            try:
                from generate_mobile_dashboard import generate as generate_dashboard
                generate_dashboard()
            except Exception:
                pass

            # Also run the data gap audit
            try:
                reporter = DailyAuditReporter()
                report = reporter.generate_report(today)
                logger.info(report["report_text"][:600])
            except Exception as e:
                logger.error(f"EOD gap audit error: {e}")

            paper_trader.save_state()
            eod_audit_done_today = True

        else:
            logger.info(f"Market CLOSED ({reason}). Standing by...")

def _hardware_wake_sleep(seconds: float):
    """
    Sleeps for the given seconds while guaranteeing that Windows 11 Modern Standby
    (S0 Low Power Idle) wakes the CPU even when the laptop lid is closed.
    Uses native Win32 SetWaitableTimer with fResume=True.
    """
    if os.name != 'nt' or seconds <= 0:
        time.sleep(max(seconds, 0.1))
        return

    import ctypes
    kernel32 = ctypes.windll.kernel32
    timer = kernel32.CreateWaitableTimerW(None, False, None)
    if not timer:
        time.sleep(seconds)
        return

    try:
        duetime = ctypes.c_longlong(int(-seconds * 10_000_000))
        success = kernel32.SetWaitableTimer(
            timer,
            ctypes.byref(duetime),
            0,
            None,
            None,
            True  # fResume = True forces CPU to wake up from S0 standby!
        )
        if success:
            kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000040)
            kernel32.WaitForSingleObject(timer, 0xFFFFFFFF)
        else:
            time.sleep(seconds)
    finally:
        kernel32.CloseHandle(timer)


        next_run = get_next_run_time(now_ist, interval_minutes=settings.INTERVAL_MINUTES)
        sleep_seconds = max((next_run - datetime.now(IST)).total_seconds(), 5.0)
        logger.info(f"Next cycle at {next_run.strftime('%H:%M:%S IST')} (sleeping {sleep_seconds:.0f}s via Hardware Wake Timer)")
        _hardware_wake_sleep(sleep_seconds)


def _print_readiness_report(paper_trader):
    """Prints the 3 Live Readiness Gates to the console log."""
    metrics = paper_trader.get_readiness_metrics()
    logger.info(f"  Total Trades: {metrics['total_trades']} (W: {metrics['wins']} / L: {metrics['losses']})")
    logger.info(
        f"  Gate 1 — Win Rate:      {metrics['gate_1_win_rate']['value']:.1f}% "
        f"(>= {metrics['gate_1_win_rate']['threshold']}%) "
        f"{'PASS' if metrics['gate_1_win_rate']['passed'] else 'FAIL'}"
    )
    logger.info(
        f"  Gate 2 — Profit Factor: {metrics['gate_2_profit_factor']['value']:.2f} "
        f"(>= {metrics['gate_2_profit_factor']['threshold']}) "
        f"{'PASS' if metrics['gate_2_profit_factor']['passed'] else 'FAIL'}"
    )
    logger.info(
        f"  Gate 3 — Max Drawdown:  {metrics['gate_3_max_drawdown']['value']:.2f}% "
        f"(<= {metrics['gate_3_max_drawdown']['threshold']}%) "
        f"{'PASS' if metrics['gate_3_max_drawdown']['passed'] else 'FAIL'}"
    )
    status = "ALL GATES PASSED" if metrics["all_gates_passed"] else "GATES NOT YET PASSED"
    logger.info(f"  Overall: {status}")


def main():
    parser = argparse.ArgumentParser(description="F&O Data Retrieval Service CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # init-db command
    subparsers.add_parser("init-db", help="Create database tables")

    # dry-run command
    subparsers.add_parser("dry-run", help="Run scheduler dry run simulation")

    # eod-audit command
    audit_parser = subparsers.add_parser("eod-audit", help="Run EOD gap audit report")
    audit_parser.add_argument("--date", help="Date in YYYY-MM-DD format (default: today)")

    # run command
    subparsers.add_parser("run", help="Start continuous live retrieval daemon")

    # run-once command
    subparsers.add_parser("run-once", help="Execute single immediate retrieval cycle")

    # auto-trade command (Autonomous Paper Trading Engine)
    auto_parser = subparsers.add_parser(
        "auto-trade",
        help="Start autonomous paper trading daemon (Fetch -> Analytics -> Signal -> Trade)"
    )
    auto_parser.add_argument(
        "--simulate-cycle",
        action="store_true",
        default=False,
        help="Run one immediate cycle ignoring market hours, then exit (for testing)"
    )

    args = parser.parse_args()

    if args.command == "init-db":
        cmd_init_db(args)
    elif args.command == "dry-run":
        cmd_dry_run(args)
    elif args.command == "eod-audit":
        cmd_eod_audit(args)
    elif args.command == "run":
        cmd_run(args)
    elif args.command == "run-once":
        cmd_run_once(args)
    elif args.command == "auto-trade":
        cmd_auto_trade(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
