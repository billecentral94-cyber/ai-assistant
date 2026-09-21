"""
NSE India Futures Fetcher (Fallback Source for Futures).
Retrieves Index Futures OHLCV + OI contracts from NSE derivative quotes.
"""

from datetime import datetime, date
from typing import List, Dict, Any, Optional
import logging
import pytz
from dateutil import parser as date_parser

from fetchers.base import BaseFetcher, FuturesRow
from fetchers.nse_option_chain import NSEOptionChainFetcher

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")
QUOTE_DERIVATIVE_URL = "https://www.nseindia.com/api/quote-derivative?symbol={symbol}"


class NSEFuturesFetcher(BaseFetcher):
    """
    Fallback futures fetcher using NSE derivative quotes.
    """

    def __init__(self, nse_session_fetcher: Optional[NSEOptionChainFetcher] = None, timeout: int = 15):
        self.session_fetcher = nse_session_fetcher or NSEOptionChainFetcher(timeout=timeout)
        self.timeout = timeout

    def fetch_raw_futures(self, underlying: str) -> Dict[str, Any]:
        """Fetches raw derivative quotes from NSE."""
        underlying = underlying.upper()
        if not self.session_fetcher._session_warmed:
            self.session_fetcher._warm_session()

        url = QUOTE_DERIVATIVE_URL.format(symbol=underlying)
        headers = {
            "accept": "*/*",
            "referer": f"https://www.nseindia.com/get-quotes/derivatives?symbol={underlying}",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }

        resp = self.session_fetcher.session.get(url, headers=headers, timeout=self.timeout)
        if resp.status_code == 200:
            return resp.json()
        raise RuntimeError(f"NSE Derivative Quote returned HTTP {resp.status_code} for {underlying}")

    def parse_futures(
        self,
        raw_data: Dict[str, Any],
        underlying: str,
        max_contracts: int = 2,
        captured_at: Optional[datetime] = None
    ) -> List[FuturesRow]:
        """
        Parses NSE derivative quote JSON into FuturesRow models.
        """
        if captured_at is None:
            captured_at = datetime.now(IST)

        stocks = raw_data.get("stocks", [])
        fut_items = [s for s in stocks if s.get("metadata", {}).get("instrumentType") == "FUTIDX"]

        rows: List[FuturesRow] = []
        for item in fut_items[:max_contracts]:
            meta = item.get("metadata", {})
            market = item.get("marketDeptOrderBook", {}).get("tradeInfo", {})
            
            raw_exp = meta.get("expiryDate", "")
            exp_date = date_parser.parse(raw_exp).date().isoformat()
            
            open_p = float(market.get("open", 0.0))
            high_p = float(market.get("high", 0.0))
            low_p = float(market.get("low", 0.0))
            close_p = float(meta.get("lastPrice", 0.0))
            volume = int(market.get("tradedVolume", 0))
            oi = int(market.get("openInterest", 0))

            rows.append(FuturesRow(
                underlying=underlying,
                expiry=exp_date,
                open=open_p if open_p > 0 else close_p,
                high=high_p if high_p > 0 else close_p,
                low=low_p if low_p > 0 else close_p,
                close=close_p,
                volume=volume,
                oi=oi,
                source="nse",
                snapshot_status="complete",
                captured_at=captured_at
            ))

        return rows

    def fetch(self, underlying: str, max_contracts: int = 2, captured_at: Optional[datetime] = None) -> List[FuturesRow]:
        """Fetches near/next month futures from NSE derivative quote."""
        raw_data = self.fetch_raw_futures(underlying)
        return self.parse_futures(raw_data, underlying, max_contracts=max_contracts, captured_at=captured_at)
