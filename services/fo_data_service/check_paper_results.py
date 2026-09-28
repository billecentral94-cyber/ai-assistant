"""
check_paper_results.py — Post-Market Paper Trading Report
Reads both live_trading_state.json (F&O Vault) and equity_trading_state.json (Equity Intraday Vault)
and prints a clean, formatted institutional Bloomberg-style summary of today's trades,
capital, PnL, leverage utilization, and the 3 Live Readiness Gates.
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

FO_STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "live_trading_state.json")
EQUITY_STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "equity_trading_state.json")

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

    print("\n" + "=" * 76)
    print(f"{BOLD}{CYAN}  ARTHA AI COPILOT — DUAL ENGINE POST-MARKET EXECUTION REPORT{RESET}")
    print("=" * 76)

    # Load F&O state
    fo_data = None
    if os.path.exists(FO_STATE_FILE):
        try:
            with open(FO_STATE_FILE, "r", encoding="utf-8") as f:
                fo_data = json.load(f)
        except Exception as e:
            print(f"{RED}Error reading F&O state file: {e}{RESET}")

    # Load Equity Intraday state
    eq_data = None
    if os.path.exists(EQUITY_STATE_FILE):
        try:
            with open(EQUITY_STATE_FILE, "r", encoding="utf-8") as f:
                eq_data = json.load(f)
        except Exception as e:
            print(f"{RED}Error reading Equity state file: {e}{RESET}")

    if not fo_data and not eq_data:
        print(f"{YELLOW}No trading state files found.{RESET}")
        print("Both engines will initialize state upon their first market run.")
        print("=" * 76 + "\n")
        return

    # Combined Capital Metrics
    fo_init = fo_data.get("initial_capital", 5000.0) if fo_data else 5000.0
    fo_curr = fo_data.get("current_capital", 5000.0) if fo_data else 5000.0
    fo_daily = fo_data.get("daily_pnl", 0.0) if fo_data else 0.0

    eq_init = eq_data.get("initial_capital", 2500.0) if eq_data else 2500.0
    eq_curr = eq_data.get("current_capital", 2500.0) if eq_data else 2500.0
    eq_daily = eq_data.get("daily_pnl", 0.0) if eq_data else 0.0

    total_init = fo_init + eq_init
    total_curr = fo_curr + eq_curr
    total_daily = fo_daily + eq_daily
    total_pnl = total_curr - total_init

    tot_daily_col = GREEN if total_daily >= 0 else RED
    tot_cum_col = GREEN if total_pnl >= 0 else RED

    print(f"\n{BOLD}COMBINED PORTFOLIO OVERVIEW (Individual Retail Trader Budget){RESET}")
    print(f"  Total Starting Capital : {format_inr(total_init)} (F&O: {format_inr(fo_init)} + Equity: {format_inr(eq_init)})")
    print(f"  Total Current Equity   : {BOLD}{format_inr(total_curr)}{RESET}")
    print(f"  Combined Today P&L     : {tot_daily_col}{BOLD}{format_inr(total_daily)}{RESET}")
    print(f"  Combined All-Time P&L  : {tot_cum_col}{format_inr(total_pnl)}{RESET}")

    # ─────────────────────────────────────────────────────────────
    # SECTION 1: EQUITY MARGINAL INTRADAY VAULT (5x Leverage)
    # ─────────────────────────────────────────────────────────────
    print("\n" + "-" * 76)
    print(f"{BOLD}{CYAN}1. EQUITY MARGINAL INTRADAY VAULT (5x MIS Leverage){RESET}")
    print("-" * 76)
    if eq_data:
        eq_open = eq_data.get("open_positions", [])
        eq_closed = eq_data.get("closed_trades", [])
        eq_power = eq_data.get("purchasing_power", eq_curr * 5.0)
        eq_daily_col = GREEN if eq_daily >= 0 else RED

        print(f"  Cash Allocated    : {format_inr(eq_curr)} | 5x Purchasing Power: {BOLD}{format_inr(eq_power)}{RESET}")
        print(f"  Intraday P&L      : {eq_daily_col}{BOLD}{format_inr(eq_daily)}{RESET}")
        print(f"  Universe (14)     : 14 Multi-Sector Stocks (Banks, IT, Auto, Metals, Energy, FMCG, Telecom)")
        print(f"  Open Positions    : {len(eq_open)}")
        if eq_open:
            for p in eq_open:
                print(f"    * {p.get('direction')} {p.get('symbol')} | Qty: {p.get('shares')} | Entry: {p.get('entry_price')} | SL: {p.get('stop_loss')} | Target: {p.get('target')}")
        else:
            print(f"    {GREEN}None (All squared off at EOD 15:15 IST — zero overnight risk){RESET}")

        print(f"  Closed Trades ({len(eq_closed)}):")
        if eq_closed:
            for i, t in enumerate(eq_closed, 1):
                pnl = t.get("pnl", 0.0)
                col = GREEN if pnl >= 0 else RED
                print(f"    {i}. {t.get('direction')} {t.get('symbol')} ({t.get('shares')} shs) | Entry: {t.get('entry_price')} -> Exit: {t.get('exit_price')} | PnL: {col}{format_inr(pnl)}{RESET} | Reason: {t.get('exit_reason')}")
        else:
            print("    No equity trades closed yet today.")
    else:
        print("  State not yet initialized.")

    # ─────────────────────────────────────────────────────────────
    # SECTION 2: F&O OPTIONS MICRO-VAULT (1 Lot Defined Risk)
    # ─────────────────────────────────────────────────────────────
    print("\n" + "-" * 76)
    print(f"{BOLD}{CYAN}2. F&O OPTIONS MICRO-VAULT (Defined-Risk Spreads){RESET}")
    print("-" * 76)
    if fo_data:
        fo_open = fo_data.get("open_positions", [])
        fo_closed = fo_data.get("closed_trades", [])
        gates = fo_data.get("readiness_gates", {})
        fo_daily_col = GREEN if fo_daily >= 0 else RED

        print(f"  Cash Allocated    : {format_inr(fo_curr)} (Single-lot discipline, max risk ₹300/trade)")
        print(f"  Options P&L       : {fo_daily_col}{BOLD}{format_inr(fo_daily)}{RESET}")
        print(f"  Underlyings       : NIFTY, BANKNIFTY")
        print(f"  Open Positions    : {len(fo_open)}")
        if fo_open:
            for p in fo_open:
                print(f"    * {p.get('direction')} {p.get('symbol')} | Qty: {p.get('qty')} | Entry: {p.get('entry_price')} | SL: {p.get('stop_loss')} | Target: {p.get('target_1')}")
        else:
            print(f"    {GREEN}None (All squared off at EOD 15:15 IST — zero theta decay overnight){RESET}")

        print(f"  Closed Trades ({len(fo_closed)}):")
        if fo_closed:
            for i, t in enumerate(fo_closed, 1):
                tpnl = t.get("net_pnl", 0.0)
                col = GREEN if tpnl >= 0 else RED
                print(f"    {i}. {t.get('direction')} {t.get('symbol')} | Entry: {t.get('entry_price')} -> Exit: {t.get('exit_price')} | PnL: {col}{format_inr(tpnl)}{RESET} | Reason: {t.get('exit_reason', 'N/A')}")
        else:
            print("    No options trades closed yet today.")

        # 3 Live Readiness Gates
        print(f"\n  {BOLD}3 Live Readiness Gates (F&O Live Deployment Verification):{RESET}")
        g1 = gates.get("gate_1_win_rate", {})
        g2 = gates.get("gate_2_profit_factor", {})
        g3 = gates.get("gate_3_max_drawdown", {})

        def gate_str(g):
            passed = g.get("passed", False)
            tag = f"{GREEN}[PASSED]{RESET}" if passed else f"{RED}[PENDING]{RESET}"
            return f"{tag} Val: {g.get('value', 0):.2f} (Required: {g.get('threshold', 0)})"

        print(f"    Gate 1 - Win Rate (>= 55%)      : {gate_str(g1)}")
        print(f"    Gate 2 - Profit Factor (>= 1.5) : {gate_str(g2)}")
        print(f"    Gate 3 - Max Drawdown (<= 4.0%) : {gate_str(g3)}")
        all_passed = gates.get("all_gates_passed", False)
        all_tag = f"{GREEN}{BOLD}ALL 3 GATES PASSED — READY FOR LIVE BROKER EXECUTION{RESET}" if all_passed else f"{YELLOW}IN PROGRESS (Requires minimum 3-5 trading sessions){RESET}"
        print(f"    Overall Status                  : {all_tag}")
    else:
        print("  State not yet initialized.")

    print("\n" + "=" * 76 + "\n")

    # Auto-generate / refresh the mobile dashboard HTML
    try:
        from generate_mobile_dashboard import generate as generate_dashboard
        generate_dashboard()
    except Exception as e:
        pass

if __name__ == "__main__":
    main()

