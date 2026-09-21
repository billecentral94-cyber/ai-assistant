"""
Strict Validation Layer for Option Chain and Futures Snapshots.
Enforces Zero Partial Rows and Zero Corrupted Data Rules.
"""

from typing import List, Tuple
from datetime import datetime
from dateutil import parser as date_parser
from fetchers.base import OptionChainRow, FuturesRow


class ValidationResult:
    def __init__(self, is_valid: bool, errors: List[str]):
        self.is_valid = is_valid
        self.errors = errors

    def __bool__(self):
        return self.is_valid


def validate_option_chain_batch(
    rows: List[OptionChainRow],
    expected_underlying: str,
    min_strikes_required: int = 10
) -> ValidationResult:
    """
    Validates an entire Option Chain batch.
    ZERO-TOLERANCE RULE: If even a single field of a single row is missing or malformed,
    the entire batch is rejected.
    """
    errors: List[str] = []

    if not rows:
        return ValidationResult(False, ["Option chain batch is completely empty"])

    expected_underlying = expected_underlying.upper()
    strikes_seen = set()

    for idx, r in enumerate(rows):
        row_id = f"Row {idx} (Strike {getattr(r, 'strike', 'N/A')} {getattr(r, 'option_type', 'N/A')})"

        # 1. Underlying validation
        if not r.underlying or r.underlying.upper() != expected_underlying:
            errors.append(f"{row_id}: Invalid underlying '{r.underlying}', expected '{expected_underlying}'")

        # 2. Expiry validation
        if not r.expiry:
            errors.append(f"{row_id}: Missing expiry date")
        else:
            try:
                exp_date = date_parser.parse(r.expiry).date()
            except Exception:
                errors.append(f"{row_id}: Malformed expiry date '{r.expiry}'")

        # 3. Strike validation
        if r.strike is None or r.strike <= 0:
            errors.append(f"{row_id}: Invalid strike price '{r.strike}'")
        else:
            strikes_seen.add(r.strike)

        # 4. Option Type
        if r.option_type not in ("CE", "PE"):
            errors.append(f"{row_id}: Invalid option type '{r.option_type}'")

        # 5. Spot price
        if r.spot_price is None or r.spot_price <= 0:
            errors.append(f"{row_id}: Invalid spot price '{r.spot_price}'")

        # 6. LTP
        if r.ltp is None or r.ltp < 0:
            errors.append(f"{row_id}: Invalid LTP '{r.ltp}'")

        # 7. Open Interest & Volume
        if r.oi is None or r.oi < 0:
            errors.append(f"{row_id}: Invalid Open Interest '{r.oi}'")
        if r.volume is None or r.volume < 0:
            errors.append(f"{row_id}: Invalid Volume '{r.volume}'")

        # 8. Change in OI
        if r.change_in_oi is None:
            errors.append(f"{row_id}: Null change_in_oi")

        # 9. Captured At
        if not r.captured_at:
            errors.append(f"{row_id}: Missing captured_at timestamp")

    if len(strikes_seen) < min_strikes_required:
        errors.append(f"Insufficient unique strikes in batch: found {len(strikes_seen)}, required minimum {min_strikes_required}")

    return ValidationResult(is_valid=len(errors) == 0, errors=errors)


def validate_futures_batch(
    rows: List[FuturesRow],
    expected_underlying: str
) -> ValidationResult:
    """
    Validates a Futures batch.
    ZERO-TOLERANCE RULE: Rejects entire snapshot if any OHLCV or contract field is invalid.
    """
    errors: List[str] = []

    if not rows:
        return ValidationResult(False, ["Futures batch is completely empty"])

    expected_underlying = expected_underlying.upper()

    for idx, r in enumerate(rows):
        row_id = f"Futures Row {idx} ({r.underlying} Exp: {r.expiry})"

        # 1. Underlying
        if not r.underlying or r.underlying.upper() != expected_underlying:
            errors.append(f"{row_id}: Invalid underlying '{r.underlying}', expected '{expected_underlying}'")

        # 2. Expiry
        if not r.expiry:
            errors.append(f"{row_id}: Missing expiry date")

        # 3. OHLC prices
        if r.open is None or r.open <= 0:
            errors.append(f"{row_id}: Invalid Open price '{r.open}'")
        if r.high is None or r.high <= 0:
            errors.append(f"{row_id}: Invalid High price '{r.high}'")
        if r.low is None or r.low <= 0:
            errors.append(f"{row_id}: Invalid Low price '{r.low}'")
        if r.close is None or r.close <= 0:
            errors.append(f"{row_id}: Invalid Close price '{r.close}'")

        # 4. OHLC relationship sanity
        if r.high is not None and r.low is not None and r.high < r.low:
            errors.append(f"{row_id}: High ({r.high}) cannot be less than Low ({r.low})")

        # 5. Volume & OI
        if r.volume is None or r.volume < 0:
            errors.append(f"{row_id}: Invalid Volume '{r.volume}'")
        if r.oi is None or r.oi < 0:
            errors.append(f"{row_id}: Invalid OI '{r.oi}'")

        # 6. Timestamp
        if not r.captured_at:
            errors.append(f"{row_id}: Missing captured_at timestamp")

    return ValidationResult(is_valid=len(errors) == 0, errors=errors)
