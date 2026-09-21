"""
Open Interest (OI) Wall Analyzer.
Identifies institutional Call walls (resistance floors) and Put walls (support floors)
and tracks spatial strike shifts between snapshots.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from decimal import Decimal


def compute_oi_walls(
    option_rows: List[Any],
    underlying: str,
    captured_at: datetime,
    prev_walls: Optional[List[Dict[str, Any]]] = None,
    top_n: int = 5,
    target_expiry: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Computes top N Call walls and Put walls from option chain rows.

    Parameters:
    - option_rows: List of objects or dicts containing strike, option_type, oi, oi_change, expiry
    - underlying: 'NIFTY' | 'BANKNIFTY'
    - captured_at: Snapshot timestamp
    - prev_walls: Prior computed walls for shift detection
    - top_n: Number of walls to track per option type (default 5)
    - target_expiry: Specific expiry date string (default uses nearest expiry if None)
    """
    if not option_rows:
        return []

    # Filter by target expiry if specified, otherwise pick the earliest expiry present
    expiries = sorted(list({getattr(r, "expiry", None) if not isinstance(r, dict) else r.get("expiry") for r in option_rows}))
    chosen_expiry = target_expiry if target_expiry else (expiries[0] if expiries else None)

    filtered = []
    for r in option_rows:
        exp = getattr(r, "expiry", None) if not isinstance(r, dict) else r.get("expiry")
        if chosen_expiry is None or str(exp) == str(chosen_expiry):
            filtered.append(r)

    ce_rows = []
    pe_rows = []

    for r in filtered:
        opt_type = (getattr(r, "option_type", "") if not isinstance(r, dict) else r.get("option_type", "")).upper()
        if opt_type == "CE":
            ce_rows.append(r)
        elif opt_type == "PE":
            pe_rows.append(r)

    # Sort descending by Open Interest
    def get_oi(row):
        val = getattr(row, "oi", 0) if not isinstance(row, dict) else row.get("oi", 0)
        return int(val) if val is not None else 0

    def get_strike(row):
        val = getattr(row, "strike", 0) if not isinstance(row, dict) else row.get("strike", 0)
        return float(val)

    def get_oi_change(row):
        val = getattr(row, "change_in_oi", 0) if not isinstance(row, dict) else row.get("change_in_oi", 0)
        return int(val) if val is not None else 0

    sorted_ce = sorted(ce_rows, key=get_oi, reverse=True)[:top_n]
    sorted_pe = sorted(pe_rows, key=get_oi, reverse=True)[:top_n]

    # Map previous strikes for shift comparison by rank and type
    prev_map = {}
    if prev_walls:
        for pw in prev_walls:
            key = (pw.get("option_type"), pw.get("wall_rank"))
            prev_map[key] = float(pw.get("strike", 0))

    results = []

    for rank, r in enumerate(sorted_ce, start=1):
        cur_strike = get_strike(r)
        shift = "new"
        if ("CE", rank) in prev_map:
            prev_strike = prev_map[("CE", rank)]
            if cur_strike > prev_strike:
                shift = "up"
            elif cur_strike < prev_strike:
                shift = "down"
            else:
                shift = "stable"

        results.append({
            "underlying": underlying,
            "captured_at": captured_at,
            "strike": cur_strike,
            "option_type": "CE",
            "oi": get_oi(r),
            "oi_change": get_oi_change(r),
            "wall_rank": rank,
            "wall_shift_direction": shift
        })

    for rank, r in enumerate(sorted_pe, start=1):
        cur_strike = get_strike(r)
        shift = "new"
        if ("PE", rank) in prev_map:
            prev_strike = prev_map[("PE", rank)]
            if cur_strike > prev_strike:
                shift = "up"
            elif cur_strike < prev_strike:
                shift = "down"
            else:
                shift = "stable"

        results.append({
            "underlying": underlying,
            "captured_at": captured_at,
            "strike": cur_strike,
            "option_type": "PE",
            "oi": get_oi(r),
            "oi_change": get_oi_change(r),
            "wall_rank": rank,
            "wall_shift_direction": shift
        })

    return results
