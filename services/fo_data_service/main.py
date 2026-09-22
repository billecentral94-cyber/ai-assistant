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
import pytz

from config.settings import settings
from db.connection import init_db, get_engine
from orchestrator.scheduler import is_market_open, get_next_run_time, IST, MarketScheduler
from orchestrator.runner import FetchOrchestrator
from audit.reporter import DailyAuditReporter
from strategy.signal_generator import SignalGenerator
from strategy.paper_trader import PaperTrader

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
        spot = analytics["spot_price"]

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

    except Exception as e:
        logger.error(f"[{underlying}] Trade cycle error: {e}", exc_info=True)


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

    # Try to load persisted state from previous session
    if paper_trader.load_state():
        logger.info(
            f"Resumed state: Capital={paper_trader.current_capital:.2f} | "
            f"Open={len(paper_trader.open_positions)} | "
            f"Closed={len(paper_trader.closed_trades)}"
        )
    else:
        logger.info(f"Fresh session. Initial capital: {paper_trader.initial_capital:.2f}")

    underlyings = settings.UNDERLYINGS
    eod_audit_done_today = False
    last_audit_date = None

    # ── Simulate Mode: run one cycle immediately then exit ──
    if getattr(args, 'simulate_cycle', False):
        logger.info("SIMULATE MODE: Running one immediate cycle (ignoring market hours)...")
        now_ist = datetime.now(IST)
        for sym in underlyings:
            _run_trade_cycle(orchestrator, analytics_engine, signal_gen, paper_trader, sym, now_ist)
        paper_trader.save_state()
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
            logger.info(f"Market OPEN ({now_time} IST). Executing autonomous trade cycle...")

            for sym in underlyings:
                _run_trade_cycle(orchestrator, analytics_engine, signal_gen, paper_trader, sym, now_ist)

            # Persist state after each cycle (atomic JSON write)
            paper_trader.save_state()

            logger.info(
                f"Cycle Complete | Capital: {paper_trader.current_capital:.2f} | "
                f"PnL Today: {paper_trader.daily_pnl:+.2f} | "
                f"Open: {len(paper_trader.open_positions)} | "
                f"Closed: {len(paper_trader.closed_trades)}"
            )

        elif now_time >= "15:35" and now_time < "16:00" and not eod_audit_done_today:
            # ── EOD Readiness Gate Reconciliation ──
            logger.info("=" * 56)
            logger.info("  EOD READINESS GATE RECONCILIATION")
            logger.info("=" * 56)

            _print_readiness_report(paper_trader)

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

        next_run = get_next_run_time(now_ist, interval_minutes=settings.INTERVAL_MINUTES)
        sleep_seconds = max((next_run - datetime.now(IST)).total_seconds(), 5.0)
        logger.info(f"Next cycle at {next_run.strftime('%H:%M:%S IST')} (sleeping {sleep_seconds:.0f}s)")
        time.sleep(sleep_seconds)


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
