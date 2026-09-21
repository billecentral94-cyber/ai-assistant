"""
Put-Call Ratio (PCR) and Market Sentiment Calculator.
Computes overall PCR, ATM PCR, directional trends, and contrarian sentiment zones.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime


def compute_pcr(
    option_rows: List[Any],
    underlying: str,
    captured_at: datetime,
    spot_price: float,
    prior_pcr_values: Optional[List[float]] = None,
    atm_strike_window: int = 3
) -> Dict[str, Any]:
    """
    Computes overall PCR, ATM PCR, trend, and sentiment zone from option chain rows.

    Parameters:
    - option_rows: List of option rows containing strike, option_type, oi
    - underlying: 'NIFTY' | 'BANKNIFTY'
    - captured_at: Snapshot timestamp
    - spot_price: Current underlying spot price
    - prior_pcr_values: List of recent historical overall PCRs (newest last)
    - atm_strike_window: Number of strikes above and below ATM to include in ATM PCR
    """
    if not option_rows:
        return {
            "underlying": underlying,
            "captured_at": captured_at,
            "total_put_oi": 0,
            "total_call_oi": 0,
            "overall_pcr": 1.0,
            "atm_pcr": 1.0,
            "pcr_trend": "flat",
            "sentiment_zone": "neutral"
        }

    def get_val(row, key, default=0):
        val = getattr(row, key, default) if not isinstance(row, dict) else row.get(key, default)
        return val if val is not None else default

    total_put_oi = 0
    total_call_oi = 0
    unique_strikes = set()

    for r in option_rows:
        opt_type = str(get_val(r, "option_type", "")).upper()
        oi = int(get_val(r, "oi", 0))
        strike = float(get_val(r, "strike", 0))
        unique_strikes.add(strike)

        if opt_type == "PE":
            total_put_oi += oi
        elif opt_type == "CE":
            total_call_oi += oi

    overall_pcr = round(total_put_oi / total_call_oi, 4) if total_call_oi > 0 else 1.0

    # Calculate ATM PCR
    atm_put_oi = 0
    atm_call_oi = 0

    if unique_strikes and spot_price > 0:
        sorted_strikes = sorted(list(unique_strikes))
        # Find ATM strike
        closest_strike = min(sorted_strikes, key=lambda s: abs(s - spot_price))
        closest_idx = sorted_strikes.index(closest_strike)

        start_idx = max(0, closest_idx - atm_strike_window)
        end_idx = min(len(sorted_strikes), closest_idx + atm_strike_window + 1)
        atm_strike_set = set(sorted_strikes[start_idx:end_idx])

        for r in option_rows:
            opt_type = str(get_val(r, "option_type", "")).upper()
            strike = float(get_val(r, "strike", 0))
            if strike in atm_strike_set:
                oi = int(get_val(r, "oi", 0))
                if opt_type == "PE":
                    atm_put_oi += oi
                elif opt_type == "CE":
                    atm_call_oi += oi

    atm_pcr = round(atm_put_oi / atm_call_oi, 4) if atm_call_oi > 0 else overall_pcr

    # Trend detection
    pcr_trend = "flat"
    if prior_pcr_values and len(prior_pcr_values) > 0:
        last_pcr = prior_pcr_values[-1]
        delta = overall_pcr - last_pcr
        if delta > 0.02:
            pcr_trend = "rising"
        elif delta < -0.02:
            pcr_trend = "falling"

    # Sentiment zone
    if overall_pcr >= 1.30:
        sentiment_zone = "oversold_bullish"
    elif overall_pcr <= 0.70:
        sentiment_zone = "overbought_bearish"
    else:
        sentiment_zone = "neutral"

    return {
        "underlying": underlying,
        "captured_at": captured_at,
        "total_put_oi": total_put_oi,
        "total_call_oi": total_call_oi,
        "overall_pcr": overall_pcr,
        "atm_pcr": atm_pcr,
        "pcr_trend": pcr_trend,
        "sentiment_zone": sentiment_zone
    }
