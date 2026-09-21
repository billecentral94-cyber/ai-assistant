"""
Max Pain Strike Calculator.
Identifies the strike price where option buyers face maximum cumulative intrinsic loss
at expiry, representing institutional option sellers' maximum payout retention.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, date


def compute_max_pain(
    option_rows: List[Any],
    underlying: str,
    captured_at: datetime,
    spot_price: float,
    expiry: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Calculates the Max Pain strike across the option chain.

    Parameters:
    - option_rows: List of option rows containing strike, option_type, oi, expiry
    - underlying: 'NIFTY' | 'BANKNIFTY'
    - captured_at: Snapshot timestamp
    - spot_price: Current underlying spot price
    - expiry: Specific target expiry (defaults to earliest if not specified)
    """
    if not option_rows:
        exp_date = expiry or date.today()
        if isinstance(exp_date, str):
            exp_date = date.fromisoformat(exp_date)
        return {
            "underlying": underlying,
            "expiry": exp_date,
            "captured_at": captured_at,
            "spot_price": spot_price,
            "max_pain_strike": spot_price,
            "distance_from_spot_pct": 0.0
        }

    def get_val(row, key, default=0):
        val = getattr(row, key, default) if not isinstance(row, dict) else row.get(key, default)
        return val if val is not None else default

    # Filter by expiry if multiple exist
    expiries = sorted(list({get_val(r, "expiry") for r in option_rows if get_val(r, "expiry")}))
    chosen_expiry = expiry if expiry else (expiries[0] if expiries else date.today())
    if isinstance(chosen_expiry, str):
        chosen_expiry = date.fromisoformat(chosen_expiry)

    filtered = [r for r in option_rows if str(get_val(r, "expiry")) == str(chosen_expiry)]
    if not filtered:
        filtered = option_rows

    ce_dict = {} # strike -> oi
    pe_dict = {} # strike -> oi
    all_strikes = set()

    for r in filtered:
        strike = float(get_val(r, "strike", 0))
        opt_type = str(get_val(r, "option_type", "")).upper()
        oi = int(get_val(r, "oi", 0))

        if strike > 0 and oi > 0:
            all_strikes.add(strike)
            if opt_type == "CE":
                ce_dict[strike] = ce_dict.get(strike, 0) + oi
            elif opt_type == "PE":
                pe_dict[strike] = pe_dict.get(strike, 0) + oi

    if not all_strikes:
        return {
            "underlying": underlying,
            "expiry": chosen_expiry,
            "captured_at": captured_at,
            "spot_price": spot_price,
            "max_pain_strike": spot_price,
            "distance_from_spot_pct": 0.0
        }

    sorted_strikes = sorted(list(all_strikes))
    min_total_loss = float("inf")
    max_pain_strike = sorted_strikes[0]

    for test_strike in sorted_strikes:
        total_loss = 0.0

        # Call options payout if expiry settles at test_strike
        for ce_strike, oi in ce_dict.items():
            if test_strike > ce_strike:
                total_loss += (test_strike - ce_strike) * oi

        # Put options payout if expiry settles at test_strike
        for pe_strike, oi in pe_dict.items():
            if test_strike < pe_strike:
                total_loss += (pe_strike - test_strike) * oi

        if total_loss < min_total_loss:
            min_total_loss = total_loss
            max_pain_strike = test_strike

    distance_from_spot_pct = 0.0
    if spot_price > 0:
        distance_from_spot_pct = round(((spot_price - max_pain_strike) / spot_price) * 100.0, 2)

    return {
        "underlying": underlying,
        "expiry": chosen_expiry,
        "captured_at": captured_at,
        "spot_price": spot_price,
        "max_pain_strike": max_pain_strike,
        "distance_from_spot_pct": distance_from_spot_pct
    }
