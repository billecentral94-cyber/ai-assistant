"""
Audit Gate Test Suite for Phase A: Reference Data & Scheduler Skeleton.
Validates 100% correct trigger/skip decisions across weekends, holidays, pre/post-market, and market hours.
"""

from datetime import datetime, date, time
import pytest
import pytz

from config.holidays import is_nse_holiday, ALL_NSE_HOLIDAYS
from orchestrator.scheduler import (
    is_market_open,
    is_trading_day,
    get_trading_slots_for_date,
    get_next_run_time,
    MarketScheduler,
    IST
)


def make_ist_dt(year: int, month: int, day: int, hour: int, minute: int, second: int = 0) -> datetime:
    """Helper to create timezone-aware IST datetime."""
    return IST.localize(datetime(year, month, day, hour, minute, second))


class TestHolidayCalendar:
    """Tests NSE holiday resolution."""

    def test_known_holidays_2024_2026(self):
        # 2024 Republic Day
        assert is_nse_holiday(date(2024, 1, 26)) is True
        # 2024 Christmas
        assert is_nse_holiday(date(2024, 12, 25)) is True
        # 2025 Independence Day
        assert is_nse_holiday(date(2025, 8, 15)) is True
        # 2026 Good Friday
        assert is_nse_holiday(date(2026, 4, 3)) is True

    def test_regular_trading_days_not_holidays(self):
        # A random regular Wednesday
        assert is_nse_holiday(date(2026, 8, 26)) is False
        # A random regular Monday
        assert is_nse_holiday(date(2026, 8, 24)) is False


class TestMarketHoursChecker:
    """Tests market-hours check (09:15-15:30 IST) across diverse scenarios."""

    @pytest.mark.parametrize("dt,expected_open,expected_reason", [
        # Normal Trading Day: Wednesday 2026-08-26
        (make_ist_dt(2026, 8, 26, 8, 30, 0), False, "pre_market"),
        (make_ist_dt(2026, 8, 26, 9, 14, 59), False, "pre_market"),
        (make_ist_dt(2026, 8, 26, 9, 15, 0), True, "market_open"),      # Boundary: Exact start
        (make_ist_dt(2026, 8, 26, 11, 30, 0), True, "market_open"),    # Mid session
        (make_ist_dt(2026, 8, 26, 15, 30, 0), True, "market_open"),    # Boundary: Exact end
        (make_ist_dt(2026, 8, 26, 15, 30, 1), False, "post_market"),   # 1 sec after close
        (make_ist_dt(2026, 8, 26, 16, 0, 0), False, "post_market"),
        (make_ist_dt(2026, 8, 26, 23, 0, 0), False, "post_market"),

        # Weekends
        (make_ist_dt(2026, 8, 29, 10, 0, 0), False, "weekend"),        # Saturday
        (make_ist_dt(2026, 8, 30, 12, 0, 0), False, "weekend"),        # Sunday

        # NSE Trading Holidays (Weekday)
        (make_ist_dt(2026, 1, 26, 10, 0, 0), False, "trading_holiday"), # Republic Day (Monday)
        (make_ist_dt(2026, 4, 3, 11, 0, 0), False, "trading_holiday"),  # Good Friday (Friday)
        (make_ist_dt(2025, 8, 15, 14, 0, 0), False, "trading_holiday"), # Independence Day (Friday)
    ])
    def test_market_open_scenarios(self, dt, expected_open, expected_reason):
        is_open, reason = is_market_open(dt)
        assert is_open is expected_open
        assert reason == expected_reason


class TestTradingSlotsAndCadence:
    """Tests interval slot generator and cadence rules."""

    def test_trading_day_slot_count(self):
        # Normal Wednesday: 09:15 to 15:30 every 15 min = 26 intervals
        slots = get_trading_slots_for_date(date(2026, 8, 26), interval_minutes=15)
        assert len(slots) == 26
        assert slots[0].time() == time(9, 15, 0)
        assert slots[-1].time() == time(15, 30, 0)
        assert slots[1].time() == time(9, 30, 0)

    def test_non_trading_day_slots(self):
        # Saturday
        assert get_trading_slots_for_date(date(2026, 8, 29)) == []
        # Holiday
        assert get_trading_slots_for_date(date(2026, 1, 26)) == []


class TestNextRunCalculation:
    """Tests next scheduled run calculation."""

    def test_intraday_next_run(self):
        # Wednesday at 09:16 -> Next is 09:30
        current = make_ist_dt(2026, 8, 26, 9, 16, 0)
        next_run = get_next_run_time(current, interval_minutes=15)
        assert next_run == make_ist_dt(2026, 8, 26, 9, 30, 0)

    def test_post_market_to_next_day(self):
        # Wednesday at 16:00 -> Next is Thursday at 09:15
        current = make_ist_dt(2026, 8, 26, 16, 0, 0)
        next_run = get_next_run_time(current, interval_minutes=15)
        assert next_run == make_ist_dt(2026, 8, 27, 9, 15, 0)

    def test_friday_post_market_to_monday(self):
        # Friday at 16:00 (2026-08-28) -> Next is Monday at 09:15 (2026-08-31)
        current = make_ist_dt(2026, 8, 28, 16, 0, 0)
        next_run = get_next_run_time(current, interval_minutes=15)
        assert next_run == make_ist_dt(2026, 8, 31, 9, 15, 0)


class TestSchedulerDryRun:
    """Tests end-to-end dry run evaluation across full sample weeks."""

    def test_dry_run_week_simulation(self):
        scheduler = MarketScheduler(interval_minutes=15)
        start = make_ist_dt(2026, 8, 24, 0, 0, 0) # Monday midnight
        end = make_ist_dt(2026, 8, 30, 23, 45, 0)   # Sunday midnight

        log = scheduler.dry_run(start, end, step_minutes=15)
        assert len(log) > 0

        # Mon-Fri: 5 days * 26 slots = 130 active runs
        runs = [item for item in log if item["should_run"]]
        assert len(runs) == 5 * 26  # exactly 130 runs

        # Weekend slots must all be False with reason 'weekend'
        weekend_items = [item for item in log if item["weekday"] in ("Saturday", "Sunday")]
        assert all(item["should_run"] is False for item in weekend_items)
        assert all(item["reason"] == "weekend" for item in weekend_items)
