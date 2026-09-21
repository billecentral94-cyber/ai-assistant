"""
F&O Data Retrieval Service — CLI Entrypoint.
Provides commands for running live retrieval, market-hour dry-runs, EOD gap audits, and DB init.
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
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
