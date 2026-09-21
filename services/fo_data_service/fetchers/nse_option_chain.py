"""
NSE Option Chain Fetcher using curl_cffi / nsepython / direct NSE session API.
Extracts full option chains for NIFTY and BANKNIFTY (current and next expiry).
"""

from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
import logging
import pytz
from dateutil import parser as date_parser
from curl_cffi import requests

from fetchers.base import BaseFetcher, OptionChainRow

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

NSE_HOMEPAGE_URL = "https://www.nseindia.com"
OPTION_CHAIN_PAGE_URL = "https://www.nseindia.com/option-chain"
OPTION_CHAIN_INDICES_URL = "https://www.nseindia.com/api/option-chain-indices?symbol={symbol}"
ALL_INDICES_URL = "https://www.nseindia.com/api/allIndices"


class NSEOptionChainFetcher(BaseFetcher):
    """
    Retrieves and parses NSE Option Chain data for Index Derivatives.
    Uses browser impersonation (curl_cffi) for resilient cookie and session handling.
    """

    def __init__(self, timeout: int = 15):
        self.timeout = timeout
        self.session = requests.Session(impersonate="chrome120")
        self._session_warmed = False

    def _warm_session(self) -> bool:
        """Primes cookies by visiting the main NSE homepage and option chain page."""
        try:
            doc_headers = {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "accept-language": "en-US,en;q=0.9",
                "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
            }
            r1 = self.session.get(NSE_HOMEPAGE_URL, headers=doc_headers, timeout=self.timeout)
            if r1.status_code == 200:
                doc_headers["sec-fetch-site"] = "same-origin"
                doc_headers["referer"] = "https://www.nseindia.com/"
                self.session.get(OPTION_CHAIN_PAGE_URL, headers=doc_headers, timeout=self.timeout)
                self._session_warmed = True
                return True
        except Exception as e:
            logger.warning(f"Session warm-up encountered issue: {e}")
        self._session_warmed = False
        return False

    def fetch_spot_price(self, underlying: str) -> float:
        """Fetches the latest spot price from NSE allIndices endpoint."""
        try:
            if not self._session_warmed:
                self._warm_session()
            headers = {
                "accept": "*/*",
                "referer": "https://www.nseindia.com/market-data/live-equity-market",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
            }
            resp = self.session.get(ALL_INDICES_URL, headers=headers, timeout=self.timeout)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                symbol_map = {"NIFTY": "NIFTY 50", "BANKNIFTY": "NIFTY BANK"}
                target = symbol_map.get(underlying.upper(), underlying.upper())
                for item in data:
                    if item.get("indexSymbol") == target:
                        return float(item.get("last", 0.0))
        except Exception as e:
            logger.warning(f"Failed to fetch spot from allIndices for {underlying}: {e}")
        return 0.0

    def fetch_raw_data(self, underlying: str) -> Dict[str, Any]:
        """
        Fetches the raw option chain JSON from NSE India API.
        """
        underlying = underlying.upper()
        if not self._session_warmed:
            self._warm_session()

        url = OPTION_CHAIN_INDICES_URL.format(symbol=underlying)
        api_headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "referer": "https://www.nseindia.com/option-chain",
            "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "priority": "u=1, i",
        }

        try:
            resp = self.session.get(url, headers=api_headers, timeout=self.timeout)
            if resp.status_code in (401, 403):
                self._warm_session()
                resp = self.session.get(url, headers=api_headers, timeout=self.timeout)

            if resp.status_code == 200:
                data = resp.json()
                if "records" in data:
                    return data
            elif resp.status_code == 404:
                logger.warning(f"NSE Option Chain returned 404 for {underlying} (Market closed/weekend maintenance)")
        except Exception as e:
            logger.warning(f"Direct NSE fetch failed for {underlying}: {e}")

        # Try nsepython wrapper fallback
        try:
            import nsepython
            data = nsepython.nse_optionchain_scrapper(underlying)
            if data and isinstance(data, dict) and "records" in data:
                return data
        except Exception as e:
            logger.error(f"nsepython fetch also failed for {underlying}: {e}")

        raise RuntimeError(f"Failed to fetch live option chain for {underlying} from NSE (Status 404/Off-Market)")

    def parse_chain(
        self,
        raw_data: Dict[str, Any],
        underlying: str,
        max_expiries: int = 2,
        captured_at: Optional[datetime] = None
    ) -> List[OptionChainRow]:
        """
        Parses raw NSE option chain data into a list of normalized OptionChainRow objects.
        Extracts current and next expiry contracts.
        """
        if captured_at is None:
            captured_at = datetime.now(IST)

        records = raw_data.get("records", {})
        spot_price = float(records.get("underlyingValue", 0.0))
        if spot_price <= 0:
            # Fallback to fetching live spot from indices if missing in payload
            spot_price = self.fetch_spot_price(underlying)

        if spot_price <= 0:
            raise ValueError(f"Invalid spot price {spot_price} for {underlying}")

        expiry_dates_raw = records.get("expiryDates", [])
        if not expiry_dates_raw:
            raise ValueError(f"No expiry dates found in option chain payload for {underlying}")

        target_expiries = expiry_dates_raw[:max_expiries]
        normalized_expiries = {exp: date_parser.parse(exp).date().isoformat() for exp in target_expiries}

        rows: List[OptionChainRow] = []
        chain_data = records.get("data", [])

        for item in chain_data:
            expiry_date_str = item.get("expiryDate")
            if expiry_date_str not in normalized_expiries:
                continue

            iso_expiry = normalized_expiries[expiry_date_str]
            strike = float(item.get("strikePrice", 0.0))

            # Parse CE (Call Option)
            if "CE" in item:
                ce_data = item["CE"]
                oi = int(ce_data.get("openInterest", 0))
                change_in_oi = int(ce_data.get("changeinOpenInterest", 0))
                volume = int(ce_data.get("totalTradedVolume", 0))
                iv_val = ce_data.get("impliedVolatility")
                iv = float(iv_val) if iv_val is not None and iv_val > 0 else None
                ltp = float(ce_data.get("lastPrice", 0.0))

                rows.append(OptionChainRow(
                    underlying=underlying,
                    expiry=iso_expiry,
                    strike=strike,
                    option_type="CE",
                    oi=oi,
                    change_in_oi=change_in_oi,
                    volume=volume,
                    iv=iv,
                    ltp=ltp,
                    spot_price=spot_price,
                    source="nsepython",
                    snapshot_status="complete",
                    captured_at=captured_at
                ))

            # Parse PE (Put Option)
            if "PE" in item:
                pe_data = item["PE"]
                oi = int(pe_data.get("openInterest", 0))
                change_in_oi = int(pe_data.get("changeinOpenInterest", 0))
                volume = int(pe_data.get("totalTradedVolume", 0))
                iv_val = pe_data.get("impliedVolatility")
                iv = float(iv_val) if iv_val is not None and iv_val > 0 else None
                ltp = float(pe_data.get("lastPrice", 0.0))

                rows.append(OptionChainRow(
                    underlying=underlying,
                    expiry=iso_expiry,
                    strike=strike,
                    option_type="PE",
                    oi=oi,
                    change_in_oi=change_in_oi,
                    volume=volume,
                    iv=iv,
                    ltp=ltp,
                    spot_price=spot_price,
                    source="nsepython",
                    snapshot_status="complete",
                    captured_at=captured_at
                ))

        return rows

    def fetch(self, underlying: str, max_expiries: int = 2, captured_at: Optional[datetime] = None) -> List[OptionChainRow]:
        """Fetches and parses option chain for an underlying."""
        raw_data = self.fetch_raw_data(underlying)
        return self.parse_chain(raw_data, underlying, max_expiries=max_expiries, captured_at=captured_at)


def filter_atm_strikes(rows: List[OptionChainRow], strike_step: float = 50.0, num_strikes_each_side: int = 10) -> List[OptionChainRow]:
    """
    Filters rows to ATM ± N strikes for each expiry and option type.
    """
    if not rows:
        return []

    spot = rows[0].spot_price
    atm_strike = round(spot / strike_step) * strike_step
    min_strike = atm_strike - (num_strikes_each_side * strike_step)
    max_strike = atm_strike + (num_strikes_each_side * strike_step)

    return [r for r in rows if min_strike <= r.strike <= max_strike]
