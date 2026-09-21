"""
Angel One SmartAPI Futures Fetcher.
Authenticates with SmartAPI (MPIN + TOTP) and retrieves live OHLCV + OI data for NIFTY and BANKNIFTY Futures.
"""

from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
import logging
import requests
import pyotp
import pytz
from dateutil import parser as date_parser

from config.settings import settings
from fetchers.base import BaseFetcher, FuturesRow

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

SMARTAPI_BASE_URL = "https://apiconnect.angelbroking.com"
LOGIN_URL = f"{SMARTAPI_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword"
REFRESH_URL = f"{SMARTAPI_BASE_URL}/rest/auth/angelbroking/jwt/v1/generateTokens"
QUOTE_URL = f"{SMARTAPI_BASE_URL}/rest/secure/angelbroking/market/v1/quote/"
SCRIP_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"


class AngelOneSession:
    """Manages authentication, JWT token generation, and token refresh with Angel One SmartAPI."""

    def __init__(
        self,
        client_id: Optional[str] = None,
        pin: Optional[str] = None,
        api_key: Optional[str] = None,
        totp_secret: Optional[str] = None,
        timeout: int = 15
    ):
        self.client_id = client_id or settings.ANGELONE_CLIENT_ID
        self.pin = pin or settings.ANGELONE_PIN
        self.api_key = api_key or settings.ANGELONE_API_KEY
        self.totp_secret = totp_secret or settings.ANGELONE_TOTP_SECRET
        self.timeout = timeout
        
        self.jwt_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.feed_token: Optional[str] = None
        self.session = requests.Session()

    def generate_totp(self) -> str:
        """Generates current 6-digit TOTP code."""
        if not self.totp_secret:
            raise ValueError("ANGELONE_TOTP_SECRET is not configured")
        totp = pyotp.TOTP(self.totp_secret.replace(" ", ""))
        return totp.now()

    def _get_headers(self, with_auth: bool = True) -> Dict[str, str]:
        """Constructs required headers for SmartAPI requests."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": "127.0.0.1",
            "X-ClientPublicIP": "127.0.0.1",
            "X-MACAddress": "00:00:00:00:00:00",
            "X-PrivateKey": self.api_key or "",
            "api_key": self.api_key or "",
        }
        if with_auth:
            if not self.jwt_token:
                self.login()
            if self.jwt_token:
                headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers

    def login(self) -> Dict[str, Any]:
        """Authenticates with Angel One using ClientCode + MPIN + TOTP."""
        if not (self.client_id and self.pin and self.api_key and self.totp_secret):
            raise ValueError("Missing one or more required Angel One credentials in configuration")

        totp_code = self.generate_totp()
        payload = {
            "clientcode": self.client_id,
            "password": self.pin,
            "totp": totp_code
        }

        resp = self.session.post(
            LOGIN_URL,
            json=payload,
            headers=self._get_headers(with_auth=False),
            timeout=self.timeout
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("status") or not data.get("data"):
            raise RuntimeError(f"Angel One login failed: {data.get('message', 'Unknown error')}")

        auth_data = data["data"]
        self.jwt_token = auth_data.get("jwtToken")
        self.refresh_token = auth_data.get("refreshToken")
        self.feed_token = auth_data.get("feedToken")
        return auth_data

    def get_jwt(self) -> str:
        """Returns valid JWT token, initiating login if not already authenticated."""
        if not self.jwt_token:
            self.login()
        return self.jwt_token or ""


class AngelFuturesFetcher(BaseFetcher):
    """
    Fetches live near-month and next-month Index Futures OHLCV + OI data from Angel One SmartAPI.
    """

    def __init__(self, session: Optional[AngelOneSession] = None, timeout: int = 15):
        self.session_mgr = session or AngelOneSession(timeout=timeout)
        self.timeout = timeout
        self._scrip_master: Optional[List[Dict[str, Any]]] = None

    def fetch_scrip_master(self) -> List[Dict[str, Any]]:
        """Downloads and caches the Angel One instrument scrip master."""
        if self._scrip_master is None:
            resp = requests.get(SCRIP_MASTER_URL, timeout=30)
            resp.raise_for_status()
            self._scrip_master = resp.json()
        return self._scrip_master

    def get_active_futures_tokens(self, underlying: str, max_contracts: int = 2) -> List[Dict[str, Any]]:
        """
        Finds active near-month and next-month Futures contracts for NIFTY or BANKNIFTY.
        """
        underlying = underlying.upper()
        scrips = self.fetch_scrip_master()
        today = datetime.now(IST).date()

        matching = []
        for item in scrips:
            if (
                item.get("exch_seg") == "NFO"
                and item.get("instrumenttype") == "FUTIDX"
                and item.get("name") == underlying
            ):
                raw_exp = item.get("expiry", "")
                try:
                    exp_date = date_parser.parse(raw_exp).date()
                    if exp_date >= today:
                        matching.append({
                            "token": item.get("token"),
                            "symbol": item.get("symbol"),
                            "expiry_date": exp_date.isoformat(),
                            "expiry_raw": raw_exp,
                            "underlying": underlying,
                            "lotsize": int(item.get("lotsize", 1))
                        })
                except Exception:
                    continue

        matching.sort(key=lambda x: x["expiry_date"])
        return matching[:max_contracts]

    def parse_quote_response(
        self,
        quote_data: Dict[str, Any],
        token_info_map: Dict[str, Dict[str, Any]],
        captured_at: Optional[datetime] = None
    ) -> List[FuturesRow]:
        """
        Parses Angel One Quote API JSON into normalized FuturesRow records.
        """
        if captured_at is None:
            captured_at = datetime.now(IST)

        fetched_list = quote_data.get("data", {}).get("fetched", [])
        if not fetched_list and isinstance(quote_data.get("data"), list):
            fetched_list = quote_data.get("data")

        rows: List[FuturesRow] = []
        for item in fetched_list:
            token = str(item.get("symbolToken") or item.get("token", ""))
            if token not in token_info_map:
                continue

            info = token_info_map[token]
            open_p = float(item.get("open", 0.0))
            high_p = float(item.get("high", 0.0))
            low_p = float(item.get("low", 0.0))
            close_p = float(item.get("ltp") or item.get("close", 0.0))
            volume = int(item.get("tradeVolume") or item.get("volume", 0))
            oi = int(item.get("opnInterest") or item.get("oi", 0))

            # Basic sanity checks: High >= Low, Close > 0
            if close_p <= 0:
                raise ValueError(f"Invalid close/LTP price {close_p} for token {token}")

            rows.append(FuturesRow(
                underlying=info["underlying"],
                expiry=info["expiry_date"],
                open=open_p if open_p > 0 else close_p,
                high=high_p if high_p > 0 else close_p,
                low=low_p if low_p > 0 else close_p,
                close=close_p,
                volume=volume,
                oi=oi,
                source="angelone",
                snapshot_status="complete",
                captured_at=captured_at
            ))

        return rows

    def fetch(self, underlying: str, max_contracts: int = 2, captured_at: Optional[datetime] = None) -> List[FuturesRow]:
        """
        Fetches live near-month and next-month futures for the given underlying.
        """
        contracts = self.get_active_futures_tokens(underlying, max_contracts=max_contracts)
        if not contracts:
            raise RuntimeError(f"No active futures contracts found for {underlying}")

        token_map = {c["token"]: c for c in contracts}
        tokens = list(token_map.keys())

        headers = self.session_mgr._get_headers(with_auth=True)
        payload = {
            "mode": "FULL",
            "exchangeTokens": {
                "NFO": tokens
            }
        }

        resp = self.session_mgr.session.post(QUOTE_URL, json=payload, headers=headers, timeout=self.timeout)
        resp.raise_for_status()
        quote_json = resp.json()

        if not quote_json.get("status"):
            raise RuntimeError(f"Angel One Quote API error: {quote_json.get('message')}")

        return self.parse_quote_response(quote_json, token_map, captured_at=captured_at)
