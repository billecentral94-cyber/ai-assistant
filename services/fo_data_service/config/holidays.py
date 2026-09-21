"""
NSE Trading Holidays Calendar (2024 - 2026)
Provides holiday lookup and validation for the Indian Equity / Derivatives Market.
"""

from datetime import date
from typing import Set


# Official NSE Trading Holidays (Equities and F&O Segment)
# Format: YYYY-MM-DD
NSE_HOLIDAYS_2024: Set[date] = {
    date(2024, 1, 22),  # Special Holiday
    date(2024, 1, 26),  # Republic Day
    date(2024, 3, 8),   # Mahashivratri
    date(2024, 3, 25),  # Holi
    date(2024, 3, 29),  # Good Friday
    date(2024, 4, 11),  # Id-Ul-Fitr (Ramzan Id)
    date(2024, 4, 17),  # Shri Ram Navami
    date(2024, 5, 1),   # Maharashtra Day
    date(2024, 5, 20),  # Parliamentary Elections Mumbai
    date(2024, 6, 17),  # Bakri Id
    date(2024, 7, 17),  # Muharram
    date(2024, 8, 15),  # Independence Day / Parsi New Year
    date(2024, 10, 2),  # Mahatma Gandhi Jayanti
    date(2024, 11, 1),  # Diwali Laxmi Pujan (Muhurat Trading only, regular market closed)
    date(2024, 11, 15), # Guru Nanak Jayanti
    date(2024, 12, 25), # Christmas
}

NSE_HOLIDAYS_2025: Set[date] = {
    date(2025, 2, 26),  # Mahashivratri
    date(2025, 3, 14),  # Holi
    date(2025, 3, 31),  # Id-Ul-Fitr
    date(2025, 4, 10),  # Mahavir Jayanti
    date(2025, 4, 14),  # Dr. Baba Saheb Ambedkar Jayanti
    date(2025, 4, 18),  # Good Friday
    date(2025, 5, 1),   # Maharashtra Day
    date(2025, 6, 7),   # Bakri Id
    date(2025, 8, 15),  # Independence Day
    date(2025, 8, 27),  # Ganesh Chaturthi
    date(2025, 10, 2),  # Mahatma Gandhi Jayanti / Dussehra
    date(2025, 10, 21), # Diwali Laxmi Pujan
    date(2025, 10, 22), # Diwali Balipratipada
    date(2025, 11, 5),  # Guru Nanak Jayanti
    date(2025, 12, 25), # Christmas
}

NSE_HOLIDAYS_2026: Set[date] = {
    date(2026, 1, 26),  # Republic Day
    date(2026, 2, 17),  # Mahashivratri
    date(2026, 3, 4),   # Holi
    date(2026, 3, 20),  # Id-Ul-Fitr
    date(2026, 4, 3),   # Good Friday
    date(2026, 4, 14),  # Dr. Baba Saheb Ambedkar Jayanti
    date(2026, 5, 1),   # Maharashtra Day
    date(2026, 5, 28),  # Bakri Id
    date(2026, 6, 26),  # Muharram
    date(2026, 8, 15),  # Independence Day
    date(2026, 9, 14),  # Ganesh Chaturthi
    date(2026, 10, 2),  # Mahatma Gandhi Jayanti
    date(2026, 10, 20), # Dussehra
    date(2026, 11, 9),  # Diwali Laxmi Pujan
    date(2026, 11, 10), # Diwali Balipratipada
    date(2026, 11, 24), # Guru Nanak Jayanti
    date(2026, 12, 25), # Christmas
}

ALL_NSE_HOLIDAYS: Set[date] = NSE_HOLIDAYS_2024 | NSE_HOLIDAYS_2025 | NSE_HOLIDAYS_2026


def is_nse_holiday(check_date: date) -> bool:
    """Returns True if the given date is a designated NSE trading holiday."""
    return check_date in ALL_NSE_HOLIDAYS


def add_custom_holiday(custom_date: date) -> None:
    """Allows dynamic registration of sudden special non-trading days."""
    ALL_NSE_HOLIDAYS.add(custom_date)
