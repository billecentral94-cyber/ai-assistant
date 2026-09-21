"""
Futures Price and Open Interest Buildup Classifier.
Categorizes index futures positioning into Long Buildup, Short Buildup,
Short Covering, or Long Unwinding.
"""

from typing import Dict, Any, Optional
from datetime import datetime, date


def classify_buildup(
    current_row: Any,
    prev_row: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Classifies futures price/OI dynamics into institutional buildup states.

    Parameters:
    - current_row: Futures snapshot object or dict (close, open, oi, expiry, underlying, captured_at)
    - prev_row: Prior futures snapshot object or dict
    """
    def get_val(row, key, default=0):
        val = getattr(row, key, default) if not isinstance(row, dict) else row.get(key, default)
        return val if val is not None else default

    underlying = str(get_val(current_row, "underlying", "NIFTY"))
    expiry = get_val(current_row, "expiry", date.today())
    if isinstance(expiry, str):
        expiry = date.fromisoformat(expiry)
    captured_at = get_val(current_row, "captured_at", datetime.now())

    current_close = float(get_val(current_row, "close", 0.0))
    current_open = float(get_val(current_row, "open", current_close))
    current_oi = int(get_val(current_row, "oi", 0))

    if prev_row is not None:
        prev_close = float(get_val(prev_row, "close", current_close))
        prev_oi = int(get_val(prev_row, "oi", current_oi))
        price_change = round(current_close - prev_close, 2)
        oi_change = current_oi - prev_oi
    else:
        price_change = round(current_close - current_open, 2)
        oi_change = 0

    # Classification logic
    if price_change >= 0 and oi_change >= 0:
        buildup_type = "Long Buildup"
    elif price_change >= 0 and oi_change < 0:
        buildup_type = "Short Covering"
    elif price_change < 0 and oi_change >= 0:
        buildup_type = "Short Buildup"
    else:
        buildup_type = "Long Unwinding"

    # Confidence calculation: higher if both price and OI show clear directional delta
    base_confidence = 65.0
    price_pct = abs(price_change) / max(current_close, 1.0) * 100
    oi_pct = abs(oi_change) / max(current_oi, 1) * 100 if current_oi > 0 else 0.0

    additional_conf = min(30.0, (price_pct * 15.0) + (oi_pct * 5.0))
    confidence_pct = round(min(95.0, base_confidence + additional_conf), 2)

    return {
        "underlying": underlying,
        "expiry": expiry,
        "captured_at": captured_at,
        "price_change": price_change,
        "oi_change": oi_change,
        "buildup_type": buildup_type,
        "confidence_pct": confidence_pct
    }
