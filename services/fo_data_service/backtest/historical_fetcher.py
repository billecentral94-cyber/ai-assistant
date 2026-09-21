"""
Historical Data Fetcher.
Downloads 15-minute OHLCV + Volume candles from Angel One SmartAPI getCandleData
for backtesting the strategy against real past market data.
"""

import logging
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class HistoricalFetcher:
    """
    Fetches historical index futures candles from Angel One SmartAPI.
    Designed for batch download of 1-2 years of 15-minute data for backtesting.
    """

    def __init__(self, angel_session=None):
        self.session = angel_session

    def fetch_candles(
        self,
        symbol_token: str,
        exchange: str = "NFO",
        interval: str = "FIFTEEN_MINUTE",
        from_date: str = "2025-01-01 09:15",
        to_date: str = "2026-09-01 15:30",
    ) -> List[Dict[str, Any]]:
        """
        Fetches historical candle data from Angel One getCandleData API.

        Note: Angel One limits each request to ~30 days of 15-min data.
        This method auto-chunks the date range into 30-day windows.
        """
        if self.session is None:
            logger.warning("No Angel One session provided; returning empty candles.")
            return []

        all_candles = []
        from_dt = datetime.strptime(from_date, "%Y-%m-%d %H:%M")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d %H:%M")
        chunk_days = 25  # Safe margin under 30-day API limit

        current_from = from_dt
        while current_from < to_dt:
            current_to = min(current_from + timedelta(days=chunk_days), to_dt)
            try:
                params = {
                    "exchange": exchange,
                    "symboltoken": symbol_token,
                    "interval": interval,
                    "fromdate": current_from.strftime("%Y-%m-%d %H:%M"),
                    "todate": current_to.strftime("%Y-%m-%d %H:%M"),
                }
                resp = self.session.getCandleData(params)
                if resp and resp.get("status") and resp.get("data"):
                    for row in resp["data"]:
                        # Angel One returns: [timestamp, open, high, low, close, volume]
                        all_candles.append({
                            "timestamp": row[0],
                            "open": float(row[1]),
                            "high": float(row[2]),
                            "low": float(row[3]),
                            "close": float(row[4]),
                            "volume": int(row[5]),
                        })
            except Exception as e:
                logger.error(f"Historical fetch error for chunk {current_from} to {current_to}: {e}")

            current_from = current_to + timedelta(minutes=1)

        logger.info(f"Downloaded {len(all_candles)} historical candles for token {symbol_token}")
        return all_candles


def generate_synthetic_candles(
    start_date: date,
    end_date: date,
    base_price: float = 24000.0,
    trend: str = "mixed",
    candles_per_day: int = 26
) -> List[Dict[str, Any]]:
    """
    Generates deterministic synthetic 15-minute candle data for offline backtesting.
    Used when Angel One credentials are not available or for unit tests.

    Supports trend modes: 'bull', 'bear', 'mixed' (alternating weeks).
    """
    import math

    candles = []
    current_date = start_date
    day_count = 0
    price = base_price

    while current_date <= end_date:
        weekday = current_date.weekday()
        if weekday >= 5:  # Skip weekends
            current_date += timedelta(days=1)
            continue

        day_count += 1

        # Determine daily trend direction
        if trend == "bull":
            daily_drift = 0.0008
        elif trend == "bear":
            daily_drift = -0.0008
        else:  # mixed: alternate every 5 trading days
            week_num = day_count // 5
            daily_drift = 0.0008 if week_num % 2 == 0 else -0.0006

        for slot in range(candles_per_day):
            hour = 9 + (slot * 15 + 15) // 60
            minute = (9 * 60 + 15 + slot * 15) % 60
            ts = datetime(current_date.year, current_date.month, current_date.day, hour, minute)

            # Intraday volatility pattern (higher at open/close, lower midday)
            intraday_factor = 1.0 + 0.3 * math.sin(math.pi * slot / candles_per_day)
            noise = math.sin(day_count * 7 + slot * 3) * 0.002 * intraday_factor

            open_price = round(price, 2)
            change = price * (daily_drift / candles_per_day + noise)
            close_price = round(price + change, 2)

            high_price = round(max(open_price, close_price) * (1 + abs(noise) * 0.5), 2)
            low_price = round(min(open_price, close_price) * (1 - abs(noise) * 0.5), 2)

            volume = int(50000 + 30000 * abs(math.sin(day_count + slot)))

            candles.append({
                "timestamp": ts.isoformat(),
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": volume,
            })

            price = close_price

        current_date += timedelta(days=1)

    return candles
