"""
Implied Volatility (IV) Analyzer.
Calculates ATM IV, IV Percentile, IV Skew, and Option Pricing Regimes.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime


def compute_iv_metrics(
    option_rows: List[Any],
    underlying: str,
    captured_at: datetime,
    spot_price: float,
    historical_ivs: Optional[List[float]] = None
) -> Dict[str, Any]:
    """
    Computes ATM IV, IV Percentile against history, IV Skew, and option pricing regime.

    Parameters:
    - option_rows: List of option rows containing strike, option_type, iv
    - underlying: 'NIFTY' | 'BANKNIFTY'
    - captured_at: Snapshot timestamp
    - spot_price: Current underlying spot price
    - historical_ivs: List of historical ATM IV values for percentile ranking
    """
    if not option_rows or spot_price <= 0:
        return {
            "underlying": underlying,
            "captured_at": captured_at,
            "atm_iv": 15.0,
            "iv_percentile": 50.0,
            "iv_skew": 0.0,
            "iv_regime": "normal"
        }

    def get_val(row, key, default=0):
        val = getattr(row, key, default) if not isinstance(row, dict) else row.get(key, default)
        return val if val is not None else default

    # Group strikes and IVs
    strikes = set()
    ce_ivs = {}
    pe_ivs = {}

    for r in option_rows:
        strike = float(get_val(r, "strike", 0))
        opt_type = str(get_val(r, "option_type", "")).upper()
        raw_iv = get_val(r, "iv", None)

        if raw_iv is not None and float(raw_iv) > 0:
            iv = float(raw_iv)
            strikes.add(strike)
            if opt_type == "CE":
                ce_ivs[strike] = iv
            elif opt_type == "PE":
                pe_ivs[strike] = iv

    if not strikes:
        return {
            "underlying": underlying,
            "captured_at": captured_at,
            "atm_iv": 15.0,
            "iv_percentile": 50.0,
            "iv_skew": 0.0,
            "iv_regime": "normal"
        }

    sorted_strikes = sorted(list(strikes))
    closest_strike = min(sorted_strikes, key=lambda s: abs(s - spot_price))

    atm_ce_iv = ce_ivs.get(closest_strike)
    atm_pe_iv = pe_ivs.get(closest_strike)

    if atm_ce_iv is not None and atm_pe_iv is not None:
        atm_iv = round((atm_ce_iv + atm_pe_iv) / 2.0, 4)
    elif atm_ce_iv is not None:
        atm_iv = round(atm_ce_iv, 4)
    elif atm_pe_iv is not None:
        atm_iv = round(atm_pe_iv, 4)
    else:
        # Fallback to any valid IV near ATM
        valid_ivs = list(ce_ivs.values()) + list(pe_ivs.values())
        atm_iv = round(sum(valid_ivs) / len(valid_ivs), 4) if valid_ivs else 15.0

    # IV Percentile calculation
    if historical_ivs and len(historical_ivs) > 0:
        all_ivs = historical_ivs + [atm_iv]
        min_iv = min(all_ivs)
        max_iv = max(all_ivs)
        if max_iv > min_iv:
            iv_percentile = round(((atm_iv - min_iv) / (max_iv - min_iv)) * 100.0, 2)
            iv_percentile = max(0.0, min(100.0, iv_percentile))
        else:
            iv_percentile = 50.0
    else:
        iv_percentile = 50.0

    # IV Skew: OTM Put IV - OTM Call IV
    closest_idx = sorted_strikes.index(closest_strike)
    otm_pe_strike = sorted_strikes[max(0, closest_idx - 2)]
    otm_ce_strike = sorted_strikes[min(len(sorted_strikes) - 1, closest_idx + 2)]

    otm_pe_iv = pe_ivs.get(otm_pe_strike, atm_iv)
    otm_ce_iv = ce_ivs.get(otm_ce_strike, atm_iv)
    iv_skew = round(otm_pe_iv - otm_ce_iv, 4)

    # IV Regime
    if iv_percentile < 30.0:
        iv_regime = "cheap_buy_options"
    elif iv_percentile > 70.0:
        iv_regime = "elevated_sell_options"
    else:
        iv_regime = "normal"

    return {
        "underlying": underlying,
        "captured_at": captured_at,
        "atm_iv": atm_iv,
        "iv_percentile": iv_percentile,
        "iv_skew": iv_skew,
        "iv_regime": iv_regime
    }
