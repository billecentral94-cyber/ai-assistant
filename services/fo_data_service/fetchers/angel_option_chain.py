"""
Angel One SmartAPI Option Chain Fetcher (Fallback Source for Option Chains).
Retrieves option strikes and quotes for NIFTY and BANKNIFTY from Angel One SmartAPI.
"""

from datetime import datetime, date
from typing import List, Dict, Any, Optional
import logging
import pytz
from dateutil import parser as date_parser

from config.settings import settings
from fetchers.base import BaseFetcher, OptionChainRow
from fetchers.angel_futures import AngelOneSession, AngelFuturesFetcher

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")
QUOTE_URL = "https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/"


class AngelOptionChainFetcher(BaseFetcher):
    """
    Fallback option chain fetcher using Angel One SmartAPI quotes.
    """

    def __init__(self, session: Optional[AngelOneSession] = None, timeout: int = 15):
        self.session_mgr = session or AngelOneSession(timeout=timeout)
        self.futures_helper = AngelFuturesFetcher(session=self.session_mgr, timeout=timeout)
        self.timeout = timeout

    def get_active_option_tokens(
        self,
        underlying: str,
        spot_price: float,
        strike_step: float = 50.0,
        num_strikes_each_side: int = 10,
        max_expiries: int = 2
    ) -> List[Dict[str, Any]]:
        """
        Filters Scrip Master for ATM ± N strikes across the near and next expiries.
        """
        underlying = underlying.upper()
        scrips = self.futures_helper.fetch_scrip_master()
        today = datetime.now(IST).date()

        atm_strike = round(spot_price / strike_step) * strike_step
        min_strike = atm_strike - (num_strikes_each_side * strike_step)
        max_strike = atm_strike + (num_strikes_each_side * strike_step)

        # Collect distinct future expiries
        expiries_set = set()
        for item in scrips:
            if item.get("exch_seg") == "NFO" and item.get("name") == underlying and item.get("instrumenttype") == "OPTIDX":
                try:
                    exp_d = date_parser.parse(item.get("expiry", "")).date()
                    if exp_d >= today:
                        expiries_set.add(exp_d)
                except Exception:
                    continue

        target_expiries = sorted(list(expiries_set))[:max_expiries]
        target_expiry_strs = {d.isoformat() for d in target_expiries}

        matching = []
        for item in scrips:
            if item.get("exch_seg") == "NFO" and item.get("name") == underlying and item.get("instrumenttype") == "OPTIDX":
                try:
                    exp_d = date_parser.parse(item.get("expiry", "")).date()
                    strike = float(item.get("strike", "0")) / 100.0 if float(item.get("strike", "0")) > 100000 else float(item.get("strike", "0"))
                    symbol = item.get("symbol", "")
                    opt_type = "CE" if symbol.endswith("CE") else "PE" if symbol.endswith("PE") else None

                    if exp_d.isoformat() in target_expiry_strs and min_strike <= strike <= max_strike and opt_type:
                        matching.append({
                            "token": item.get("token"),
                            "symbol": symbol,
                            "underlying": underlying,
                            "expiry_date": exp_d.isoformat(),
                            "strike": strike,
                            "option_type": opt_type,
                        })
                except Exception:
                    continue

        return matching

    def parse_quote_response(
        self,
        quote_data: Dict[str, Any],
        token_info_map: Dict[str, Dict[str, Any]],
        spot_price: float,
        captured_at: Optional[datetime] = None
    ) -> List[OptionChainRow]:
        """
        Parses Angel One Quote response for option strikes into OptionChainRow models.
        """
        if captured_at is None:
            captured_at = datetime.now(IST)

        fetched_list = quote_data.get("data", {}).get("fetched", [])
        if not fetched_list and isinstance(quote_data.get("data"), list):
            fetched_list = quote_data.get("data")

        rows: List[OptionChainRow] = []
        for item in fetched_list:
            token = str(item.get("token", ""))
            if token not in token_info_map:
                continue

            info = token_info_map[token]
            ltp = float(item.get("ltp") or item.get("close", 0.0))
            volume = int(item.get("tradeVolume") or item.get("volume", 0))
            oi = int(item.get("opnInterest") or item.get("oi", 0))

            rows.append(OptionChainRow(
                underlying=info["underlying"],
                expiry=info["expiry_date"],
                strike=info["strike"],
                option_type=info["option_type"],
                oi=oi,
                change_in_oi=0,  # SmartAPI full quote does not always provide change in OI
                volume=volume,
                iv=None,
                ltp=ltp,
                spot_price=spot_price,
                source="angelone",
                snapshot_status="complete",
                captured_at=captured_at
            ))

        return rows

    def fetch(
        self,
        underlying: str,
        spot_price: float = 0.0,
        strike_step: float = 50.0,
        num_strikes_each_side: int = 10,
        max_expiries: int = 2,
        captured_at: Optional[datetime] = None
    ) -> List[OptionChainRow]:
        """
        Fetches option chain via Angel One fallback.
        """
        if spot_price <= 0:
            raise ValueError(f"Valid spot price required for Angel One option chain resolution for {underlying}")

        matching_tokens = self.get_active_option_tokens(
            underlying=underlying,
            spot_price=spot_price,
            strike_step=strike_step,
            num_strikes_each_side=num_strikes_each_side,
            max_expiries=max_expiries
        )

        if not matching_tokens:
            raise RuntimeError(f"No option contract tokens found for {underlying} on Angel One")

        token_map = {item["token"]: item for item in matching_tokens}
        tokens = list(token_map.keys())

        # SmartAPI allows max 50 tokens per quote call; batch into chunks
        rows: List[OptionChainRow] = []
        chunk_size = 50
        headers = self.session_mgr._get_headers(with_auth=True)

        for i in range(0, len(tokens), chunk_size):
            chunk = tokens[i:i + chunk_size]
            payload = {
                "mode": "FULL",
                "exchangeTokens": {
                    "NFO": chunk
                }
            }
            resp = self.session_mgr.session.post(QUOTE_URL, json=payload, headers=headers, timeout=self.timeout)
            resp.raise_for_status()
            quote_json = resp.json()
            if quote_json.get("status"):
                chunk_rows = self.parse_quote_response(quote_json, token_map, spot_price=spot_price, captured_at=captured_at)
                rows.extend(chunk_rows)

        return rows
