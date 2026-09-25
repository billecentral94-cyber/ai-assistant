"""
check_paper_results.py — Post-Market Paper Trading Report
Reads live_trading_state.json and prints a clean, formatted Bloomberg-style summary
of today's paper trades, PnL, open/closed positions, and the 3 Live Readiness Gates.
"""

import os
import sys
import json
from datetime import datetime

# Configure Windows console for UTF-8
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "live_trading_state.json")

def format_inr(val):
    try:
        return f"₹{val:,.2f}"
    except:
        return f"Rs. {val}"

def main():
    os.system("") # Enable ANSI colors on Windows

    CYAN = "\033[96m"
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BOLD = "\033[1m"
    RESET = "\033[0m"

    print("\n" + "=" * 68)
    print(f"{BOLD}{CYAN}  ARTHA AI COPILOT — PAPER TRADING POST-MARKET REPORT{RESET}")
    print("=" * 68)

    if not os.path.exists(STATE_FILE):
        print(f"{YELLOW}No state file found at:{RESET} {STATE_FILE}")
        print("The engine will generate this state after its first market run.")
        print("=" * 68 + "\n")
        return

    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"{RED}Error reading state file: {e}{RESET}")
        return

    initial_cap = data.get("initial_capital", 500000.0)
    current_cap = data.get("current_capital", 500000.0)
    daily_pnl = data.get("daily_pnl", 0.0)
    total_pnl = current_cap - initial_cap
    open_pos = data.get("open_positions", [])
    closed = data.get("closed_trades", [])
    gates = data.get("readiness_gates", {})
    last_updated = data.get("last_updated", "N/A")

    pnl_col = GREEN if daily_pnl >= 0 else RED
    tot_col = GREEN if total_pnl >= 0 else RED

    print(f"\n{BOLD}ACCOUNT & CAPITAL SUMMARY{RESET}")
    print(f"  Starting Capital : {format_inr(initial_cap)}")
    print(f"  Current Equity   : {BOLD}{format_inr(current_cap)}{RESET}")
    print(f"  Today's P&L      : {pnl_col}{BOLD}{format_inr(daily_pnl)}{RESET}")
    print(f"  Cumulative P&L   : {tot_col}{format_inr(total_pnl)}{RESET}")
    print(f"  Last Updated     : {last_updated}")

    # Open Positions
    print(f"\n{BOLD}OPEN POSITIONS ({len(open_pos)}){RESET}")
    if open_pos:
        for p in open_pos:
            print(f"  - {p.get('direction')} {p.get('symbol')} | Qty: {p.get('qty')} | Entry: {p.get('entry_price')} | SL: {p.get('stop_loss')} | Target: {p.get('target_1')}")
    else:
        print(f"  {GREEN}None (All positions squared off at EOD 15:15 IST){RESET}")

    # Closed Trades
    print(f"\n{BOLD}CLOSED TRADES TODAY ({len(closed)}){RESET}")
    if closed:
        for i, t in enumerate(closed, 1):
            tpnl = t.get("net_pnl", 0.0)
            col = GREEN if tpnl >= 0 else RED
            print(f"  {i}. {t.get('direction')} {t.get('symbol')} | Entry: {t.get('entry_price')} -> Exit: {t.get('exit_price')} | PnL: {col}{format_inr(tpnl)}{RESET} | Reason: {t.get('exit_reason', 'N/A')}")
    else:
        print("  No trades executed yet today.")

    # 3 Live Readiness Gates
    print(f"\n{BOLD}3 LIVE READINESS GATES (Verification for Live Deployment){RESET}")
    g1 = gates.get("gate_1_win_rate", {})
    g2 = gates.get("gate_2_profit_factor", {})
    g3 = gates.get("gate_3_max_drawdown", {})

    def gate_str(g):
        passed = g.get("passed", False)
        tag = f"{GREEN}[PASSED]{RESET}" if passed else f"{RED}[PENDING]{RESET}"
        return f"{tag} Val: {g.get('value', 0):.2f} (Required: {g.get('threshold', 0)})"

    print(f"  Gate 1 - Win Rate (>= 55%)      : {gate_str(g1)}")
    print(f"  Gate 2 - Profit Factor (>= 1.5) : {gate_str(g2)}")
    print(f"  Gate 3 - Max Drawdown (<= 4.0%) : {gate_str(g3)}")
    all_passed = gates.get("all_gates_passed", False)
    all_tag = f"{GREEN}{BOLD}ALL 3 GATES PASSED — READY FOR LIVE BROKER EXECUTION{RESET}" if all_passed else f"{YELLOW}IN PROGRESS (Requires minimum 3-5 trading sessions){RESET}"
    print(f"  Overall Status                  : {all_tag}")

    print("\n" + "=" * 68 + "\n")

if __name__ == "__main__":
    main()
