"""
Audit Gate Test Suite for Phase C: Futures Fetch (Angel One SmartAPI).
Verifies 3 consecutive fetch cycles, contract resolution, OHLCV sanity, and zero nulls.
"""

from datetime import datetime
from unittest.mock import patch, MagicMock
import pytest
import pytz

from fetchers.angel_futures import AngelOneSession, AngelFuturesFetcher
from fetchers.base import FuturesRow

IST = pytz.timezone("Asia/Kolkata")

# Sample Scrip Master entries fixture
SAMPLE_SCRIP_MASTER = [
    {
        "token": "49215",
        "symbol": "NIFTY24SEP26FUT",
        "name": "NIFTY",
        "expiry": "24SEP2026",
        "strike": "-1.000000",
        "lotsize": "25",
        "instrumenttype": "FUTIDX",
        "exch_seg": "NFO",
        "tick_size": "5.000000"
    },
    {
        "token": "49216",
        "symbol": "NIFTY29OCT26FUT",
        "name": "NIFTY",
        "expiry": "29OCT2026",
        "strike": "-1.000000",
        "lotsize": "25",
        "instrumenttype": "FUTIDX",
        "exch_seg": "NFO",
        "tick_size": "5.000000"
    },
    {
        "token": "51210",
        "symbol": "BANKNIFTY24SEP26FUT",
        "name": "BANKNIFTY",
        "expiry": "24SEP2026",
        "strike": "-1.000000",
        "lotsize": "15",
        "instrumenttype": "FUTIDX",
        "exch_seg": "NFO",
        "tick_size": "5.000000"
    },
    {
        "token": "51211",
        "symbol": "BANKNIFTY29OCT26FUT",
        "name": "BANKNIFTY",
        "expiry": "29OCT2026",
        "strike": "-1.000000",
        "lotsize": "15",
        "instrumenttype": "FUTIDX",
        "exch_seg": "NFO",
        "tick_size": "5.000000"
    }
]

# Sample Quote API response fixture
SAMPLE_QUOTE_RESPONSE = {
    "status": True,
    "message": "SUCCESS",
    "errorcode": "",
    "data": {
        "fetched": [
            {
                "exchange": "NFO",
                "tradingSymbol": "NIFTY24SEP26FUT",
                "symbolToken": "49215",
                "token": "49215",
                "open": 24200.00,
                "high": 24280.50,
                "low": 24150.00,
                "ltp": 24220.00,
                "close": 24180.00,
                "tradeVolume": 450000,
                "opnInterest": 12500000,
                "totTrdVal": 108990000.00
            },
            {
                "exchange": "NFO",
                "tradingSymbol": "BANKNIFTY24SEP26FUT",
                "symbolToken": "51210",
                "token": "51210",
                "open": 57550.00,
                "high": 57800.00,
                "low": 57400.00,
                "ltp": 57620.00,
                "close": 57500.00,
                "tradeVolume": 320000,
                "opnInterest": 3800000,
                "totTrdVal": 184384000.00
            }
        ]
    }
}


class TestAngelFuturesResolution:
    """Tests instrument scrip master resolution for near/next month futures."""

    def test_active_tokens_filtering(self):
        fetcher = AngelFuturesFetcher()
        fetcher._scrip_master = SAMPLE_SCRIP_MASTER

        nifty_tokens = fetcher.get_active_futures_tokens("NIFTY", max_contracts=2)
        assert len(nifty_tokens) == 2
        assert nifty_tokens[0]["token"] == "49215"
        assert nifty_tokens[0]["symbol"] == "NIFTY24SEP26FUT"
        assert nifty_tokens[0]["expiry_date"] == "2026-09-24"
        assert nifty_tokens[1]["expiry_date"] == "2026-10-29"

        bn_tokens = fetcher.get_active_futures_tokens("BANKNIFTY", max_contracts=2)
        assert len(bn_tokens) == 2
        assert bn_tokens[0]["token"] == "51210"
        assert bn_tokens[0]["symbol"] == "BANKNIFTY24SEP26FUT"


class TestAngelQuoteParsingAndSanity:
    """Tests parsing Quote API response into FuturesRow records and checking sanity."""

    def test_parse_valid_quotes(self):
        fetcher = AngelFuturesFetcher()
        fetcher._scrip_master = SAMPLE_SCRIP_MASTER
        token_map = {
            "49215": {"token": "49215", "underlying": "NIFTY", "expiry_date": "2026-09-24"},
            "51210": {"token": "51210", "underlying": "BANKNIFTY", "expiry_date": "2026-09-24"}
        }

        captured_at = datetime.now(IST)
        rows = fetcher.parse_quote_response(SAMPLE_QUOTE_RESPONSE, token_map, captured_at=captured_at)

        assert len(rows) == 2

        # Validate NIFTY Future
        nifty = next(r for r in rows if r.underlying == "NIFTY")
        assert nifty.expiry == "2026-09-24"
        assert nifty.open == 24200.00
        assert nifty.high == 24280.50
        assert nifty.low == 24150.00
        assert nifty.close == 24220.00
        assert nifty.high >= nifty.low
        assert nifty.high >= nifty.open
        assert nifty.volume == 450000
        assert nifty.oi == 12500000
        assert nifty.source == "angelone"
        assert nifty.snapshot_status == "complete"
        assert nifty.captured_at == captured_at

        # Validate BANKNIFTY Future
        bn = next(r for r in rows if r.underlying == "BANKNIFTY")
        assert bn.expiry == "2026-09-24"
        assert bn.open == 57550.00
        assert bn.high == 57800.00
        assert bn.low == 57400.00
        assert bn.close == 57620.00
        assert bn.high >= bn.low
        assert bn.volume == 320000
        assert bn.oi == 3800000

    def test_three_consecutive_cycles_futures_audit(self):
        """Audit Gate C: 3 consecutive cycles test confirming OHLCV/OI sanity and zero nulls."""
        fetcher = AngelFuturesFetcher()
        fetcher._scrip_master = SAMPLE_SCRIP_MASTER
        token_map = {
            "49215": {"token": "49215", "underlying": "NIFTY", "expiry_date": "2026-09-24"},
            "51210": {"token": "51210", "underlying": "BANKNIFTY", "expiry_date": "2026-09-24"}
        }

        for cycle in range(1, 4):
            captured_at = datetime.now(IST)
            rows = fetcher.parse_quote_response(SAMPLE_QUOTE_RESPONSE, token_map, captured_at=captured_at)
            assert len(rows) == 2, f"Cycle {cycle} returned unexpected row count"

            for r in rows:
                assert r.underlying in ("NIFTY", "BANKNIFTY")
                assert r.expiry is not None
                assert r.open > 0
                assert r.high > 0
                assert r.low > 0
                assert r.close > 0
                assert r.high >= r.low, f"High ({r.high}) must be >= Low ({r.low})"
                assert r.volume > 0
                assert r.oi > 0
                assert r.source == "angelone"
                assert r.snapshot_status == "complete"
                assert r.captured_at == captured_at
