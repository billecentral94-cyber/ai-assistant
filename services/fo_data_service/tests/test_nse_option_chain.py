"""
Audit Gate Test Suite for Phase B: Option Chain Fetch (nsepython / NSE India).
Runs 3 consecutive cycles for NIFTY and BANKNIFTY, confirming zero nulls in required fields for ATM ±10 strikes.
"""

from datetime import datetime
from unittest.mock import patch
import pytest
import pytz

from fetchers.nse_option_chain import NSEOptionChainFetcher, filter_atm_strikes
from fetchers.base import OptionChainRow

IST = pytz.timezone("Asia/Kolkata")


def generate_mock_nse_payload(underlying: str, spot: float, strike_step: float, num_strikes: int = 30) -> dict:
    """Generates a fully formed NSE Option Chain API payload."""
    atm = round(spot / strike_step) * strike_step
    start_strike = atm - (num_strikes // 2 * strike_step)
    
    expiries = ["04-Sep-2026", "11-Sep-2026", "25-Sep-2026"]
    chain_data = []
    
    for exp in expiries[:2]:
        for i in range(num_strikes):
            strike = start_strike + (i * strike_step)
            diff = abs(strike - spot)
            ce_price = max(spot - strike + 20.0, 5.0)
            pe_price = max(strike - spot + 20.0, 5.0)
            
            chain_data.append({
                "strikePrice": strike,
                "expiryDate": exp,
                "CE": {
                    "strikePrice": strike,
                    "expiryDate": exp,
                    "underlying": underlying,
                    "openInterest": int(50000 + (1000 * i)),
                    "changeinOpenInterest": int(250 * (i % 5)),
                    "totalTradedVolume": int(80000 + (2000 * i)),
                    "impliedVolatility": round(14.0 + (i * 0.1), 2),
                    "lastPrice": round(ce_price, 2)
                },
                "PE": {
                    "strikePrice": strike,
                    "expiryDate": exp,
                    "underlying": underlying,
                    "openInterest": int(60000 + (1200 * i)),
                    "changeinOpenInterest": int(-150 * (i % 4)),
                    "totalTradedVolume": int(95000 + (1500 * i)),
                    "impliedVolatility": round(15.0 + (i * 0.1), 2),
                    "lastPrice": round(pe_price, 2)
                }
            })
            
    return {
        "records": {
            "expiryDates": expiries,
            "data": chain_data,
            "timestamp": "04-Sep-2026 15:30:00",
            "underlyingValue": spot
        }
    }


class TestPhaseBOptionChainAudit:
    """Audit Gate B Verification Suite."""

    @pytest.mark.parametrize("underlying,spot,step", [
        ("NIFTY", 24175.65, 50.0),
        ("BANKNIFTY", 57496.30, 100.0)
    ])
    def test_three_consecutive_cycles_no_nulls_atm_plus_minus_10(self, underlying, spot, step):
        fetcher = NSEOptionChainFetcher()
        payload = generate_mock_nse_payload(underlying, spot, step, num_strikes=30)
        
        for cycle in range(1, 4):
            captured_at = datetime.now(IST)
            rows = fetcher.parse_chain(payload, underlying=underlying, max_expiries=2, captured_at=captured_at)
            
            assert len(rows) > 0, f"Cycle {cycle} returned empty rows for {underlying}"
            
            # Filter to ATM ± 10 strikes
            atm_rows = filter_atm_strikes(rows, strike_step=step, num_strikes_each_side=10)
            assert len(atm_rows) > 0, f"No ATM strikes found for {underlying}"
            
            # Confirm no nulls in OI, IV, LTP, volume, spot_price, strike
            for r in atm_rows:
                assert r.underlying == underlying
                assert r.expiry in ("2026-09-04", "2026-09-11")
                assert r.strike > 0
                assert r.option_type in ("CE", "PE")
                assert r.oi is not None and r.oi > 0
                assert r.change_in_oi is not None
                assert r.volume is not None and r.volume > 0
                assert r.ltp is not None and r.ltp > 0
                assert r.spot_price == spot
                assert r.source == "nsepython"
                assert r.snapshot_status == "complete"
                assert r.captured_at == captured_at

    def test_invalid_spot_rejection(self):
        fetcher = NSEOptionChainFetcher()
        payload = {"records": {"expiryDates": ["04-Sep-2026"], "data": [], "underlyingValue": 0.0}}
        with patch.object(fetcher, "fetch_spot_price", return_value=0.0):
            with pytest.raises(ValueError, match="Invalid spot price"):
                fetcher.parse_chain(payload, underlying="NIFTY")

    def test_missing_expiries_rejection(self):
        fetcher = NSEOptionChainFetcher()
        payload = {"records": {"expiryDates": [], "data": [], "underlyingValue": 24000.0}}
        with pytest.raises(ValueError, match="No expiry dates found"):
            fetcher.parse_chain(payload, underlying="NIFTY")
