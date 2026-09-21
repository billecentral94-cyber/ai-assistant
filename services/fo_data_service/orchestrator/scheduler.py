"""
Market-hours check and interval cycle scheduler for Indian Equities / F&O.
Enforces 09:15-15:30 IST market window, excludes weekends and official NSE holidays.
"""

from datetime import datetime, time, date, timedelta
from typing import Tuple, List, Optional, Callable
import pytz
import logging

from config.holidays import is_nse_holiday
from config.settings import settings

logger = logging.getLogger(__name__)
IST = pytz.timezone(settings.TIMEZONE)

# Standard market session times
MARKET_START = time(9, 15, 0)
MARKET_END = time(15, 30, 0)


def to_ist(dt: Optional[datetime] = None) -> datetime:
    """Converts or localizes datetime to IST (Asia/Kolkata)."""
    if dt is None:
        return datetime.now(IST)
    if dt.tzinfo is None:
        return IST.localize(dt)
    return dt.astimezone(IST)


def is_market_open(dt: Optional[datetime] = None) -> Tuple[bool, str]:
    """
    Checks if the given datetime falls within the active NSE trading session.
    
    Returns:
        (True, "market_open") if live trading window (09:15:00 - 15:30:00 IST on trading day).
        (False, reason) where reason is one of:
            - "weekend" (Saturday/Sunday)
            - "trading_holiday" (Official NSE holiday)
            - "pre_market" (Before 09:15 IST)
            - "post_market" (After 15:30 IST)
    """
    current_ist = to_ist(dt)
    curr_date = current_ist.date()
    curr_time = current_ist.time()

    # 1. Check Weekend (Monday=0 ... Sunday=6)
    if current_ist.weekday() >= 5:
        return False, "weekend"

    # 2. Check NSE Holiday
    if is_nse_holiday(curr_date):
        return False, "trading_holiday"

    # 3. Check Session Window
    if curr_time < MARKET_START:
        return False, "pre_market"
    elif curr_time > MARKET_END:
        return False, "post_market"

    return True, "market_open"


def is_trading_day(d: date) -> bool:
    """Returns True if the given date is a weekday and not an NSE holiday."""
    if d.weekday() >= 5:
        return False
    return not is_nse_holiday(d)


def get_trading_slots_for_date(trade_date: date, interval_minutes: int = 15) -> List[datetime]:
    """
    Generates all scheduled trigger timestamps for a specific trading day in IST.
    For standard 15-minute interval: returns 26 timestamps from 09:15 to 15:30 inclusive.
    """
    if not is_trading_day(trade_date):
        return []

    slots: List[datetime] = []
    current_dt = datetime.combine(trade_date, MARKET_START)
    current_dt = IST.localize(current_dt)

    end_dt = datetime.combine(trade_date, MARKET_END)
    end_dt = IST.localize(end_dt)

    delta = timedelta(minutes=interval_minutes)
    while current_dt <= end_dt:
        slots.append(current_dt)
        current_dt += delta

    return slots


def get_next_run_time(from_dt: Optional[datetime] = None, interval_minutes: int = 15) -> datetime:
    """
    Calculates the exact next scheduled timestamp based on current IST time.
    """
    current_ist = to_ist(from_dt)
    curr_date = current_ist.date()

    # If current day is a trading day
    if is_trading_day(curr_date):
        slots = get_trading_slots_for_date(curr_date, interval_minutes)
        future_slots = [s for s in slots if s > current_ist]
        if future_slots:
            return future_slots[0]

    # If past market hours or on a holiday/weekend, find the next valid trading day at 09:15 IST
    next_date = curr_date + timedelta(days=1)
    while not is_trading_day(next_date):
        next_date += timedelta(days=1)

    next_start = datetime.combine(next_date, MARKET_START)
    return IST.localize(next_start)


class MarketScheduler:
    """
    Scheduler engine for executing data retrieval cycles during market hours.
    """

    def __init__(self, interval_minutes: int = 15):
        self.interval_minutes = interval_minutes

    def evaluate_timestamp(self, dt: datetime) -> Tuple[bool, str]:
        """Evaluates whether a specific timestamp should trigger a data fetch cycle."""
        return is_market_open(dt)

    def dry_run(self, start_dt: datetime, end_dt: datetime, step_minutes: int = 15) -> List[dict]:
        """
        Executes a dry-run simulation across a date range and returns decision logs for every step.
        """
        results = []
        current = to_ist(start_dt)
        end = to_ist(end_dt)
        step = timedelta(minutes=step_minutes)

        while current <= end:
            should_run, reason = self.evaluate_timestamp(current)
            results.append({
                "timestamp_ist": current.isoformat(),
                "should_run": should_run,
                "reason": reason,
                "weekday": current.strftime("%A"),
                "is_trading_day": is_trading_day(current.date())
            })
            current += step

        return results
