"""
Live Audit Harness for Phase B: Option Chain Fetch (nsepython / NSE India).
Executes 3 live cycles for NIFTY and BANKNIFTY, validates ATM ±10 strikes, and checks for zero nulls.
"""

import sys
import time
from datetime import datetime
import pytz

from fetchers.nse_option_chain import NSEOptionChainFetcher, filter_atm_strikes
from fetchers.base import OptionChainRow

IST = pytz.timezone("Asia/Kolkata")


def run_live_phase_b_audit():
    fetcher = NSEOptionChainFetcher(timeout=15)
    underlyings = ["NIFTY", "BANKNIFTY"]
    strike_steps = {"NIFTY": 50.0, "BANKNIFTY": 100.0}

    print("================================================================================")
    print("PHASE B AUDIT: LIVE OPTION CHAIN FETCH (3 CONSECUTIVE CYCLES)")
    print("================================================================================")

    audit_records = []
    all_passed = True

    for cycle in range(1, 4):
        print(f"\n--- Cycle {cycle} of 3 (Timestamp: {datetime.now(IST).isoformat()}) ---")
        for sym in underlyings:
            try:
                cycle_start = time.time()
                rows = fetcher.fetch(sym, max_expiries=2)
                elapsed = time.time() - cycle_start
                
                atm_rows = filter_atm_strikes(rows, strike_step=strike_steps[sym], num_strikes_each_side=10)
                
                # Check for nulls in required fields
                null_violations = []
                for r in atm_rows:
                    if r.oi is None: null_violations.append(f"{r.strike} {r.option_type} OI is None")
                    if r.volume is None: null_violations.append(f"{r.strike} {r.option_type} Volume is None")
                    if r.ltp is None: null_violations.append(f"{r.strike} {r.option_type} LTP is None")
                    if r.spot_price is None or r.spot_price <= 0: null_violations.append(f"Spot price invalid: {r.spot_price}")

                spot = rows[0].spot_price if rows else 0
                expiries = sorted(list(set(r.expiry for r in rows)))

                status = "PASS" if not null_violations and len(atm_rows) > 0 else "FAIL"
                if status == "FAIL":
                    all_passed = False

                print(f"[{sym}] Fetched {len(rows)} total rows | ATM±10: {len(atm_rows)} rows | Spot: {spot} | Expiries: {expiries} | Duration: {elapsed:.2f}s | Status: {status}")
                if null_violations:
                    print(f"  --> Violations: {null_violations[:5]}")

                audit_records.append({
                    "cycle": cycle,
                    "underlying": sym,
                    "total_rows": len(rows),
                    "atm_rows": len(atm_rows),
                    "spot_price": spot,
                    "expiries": expiries,
                    "null_violations_count": len(null_violations),
                    "status": status
                })

            except Exception as e:
                print(f"[{sym}] Cycle {cycle} failed with exception: {e}")
                audit_records.append({
                    "cycle": cycle,
                    "underlying": sym,
                    "total_rows": 0,
                    "atm_rows": 0,
                    "spot_price": 0,
                    "expiries": [],
                    "null_violations_count": 1,
                    "status": "FAIL",
                    "error": str(e)
                })
                all_passed = False

        if cycle < 3:
            time.sleep(2)  # brief pause between cycles

    print("\n================================================================================")
    print("PHASE B AUDIT SUMMARY")
    print("================================================================================")
    for rec in audit_records:
        print(f"Cycle {rec['cycle']} | {rec['underlying']:10} | Spot: {rec['spot_price']:<10.2f} | Rows: {rec['total_rows']:<4} | ATM Rows: {rec['atm_rows']:<3} | Null Violations: {rec['null_violations_count']} | Status: {rec['status']}")

    print(f"\nOVERALL PHASE B AUDIT GATE: {'PASSED' if all_passed else 'FAILED'}")
    return all_passed


if __name__ == "__main__":
    success = run_live_phase_b_audit()
    sys.exit(0 if success else 1)
