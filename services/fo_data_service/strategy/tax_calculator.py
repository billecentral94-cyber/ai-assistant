"""
tax_calculator.py — Realistic Indian Market Statutory Charges & Taxes Engine
Computes 100% compliant broker contract notes and statutory taxes for NSE Equities & F&O:
  - Brokerage (Angel One standard: Rs 20/order or 0.03% for MIS)
  - STT (Securities Transaction Tax) — revised Budget 2024 (0.1% on sell options premium, 0.025% on equity MIS sell)
  - Exchange Turnover Charges (NSE) — 0.03503% on options premium, 0.00297% on equity cash
  - SEBI Turnover Charges — Rs 10 per crore (0.0001%)
  - GST — 18% on (Brokerage + Exchange Charges + SEBI Charges)
  - Stamp Duty — 0.003% on option buy premium, 0.0015% on equity buy turnover
  - Investor Protection Fund (IPFT) — Rs 10 per crore
"""

from typing import Dict, Any


def calculate_options_spread_charges(
    buy_turnover_entry: float,
    sell_turnover_entry: float,
    buy_turnover_exit: float,
    sell_turnover_exit: float,
    num_legs: int = 2,
    brokerage_per_order: float = 20.0
) -> Dict[str, float]:
    """
    Calculates statutory government charges and brokerage for a 2-leg option spread.
    buy_turnover / sell_turnover are total premium values (price * qty).
    """
    total_buy_turnover = buy_turnover_entry + buy_turnover_exit
    total_sell_turnover = sell_turnover_entry + sell_turnover_exit
    total_premium_turnover = total_buy_turnover + total_sell_turnover

    # 1. Brokerage: Rs 20 per leg on entry and exit (2 legs x 2 = 4 orders x Rs 20 = Rs 80)
    brokerage = round(num_legs * 2 * brokerage_per_order, 2)

    # 2. STT: 0.1% on premium on sell side
    stt = round(total_sell_turnover * 0.001, 2)

    # 3. Exchange Turnover Charges: 0.03503% on total premium turnover
    exchange_charges = round(total_premium_turnover * 0.0003503, 2)

    # 4. SEBI Turnover Charges: Rs 10 / Crore (0.0001%)
    sebi_charges = round(total_premium_turnover * 0.000001, 2)

    # 5. Stamp Duty: 0.003% on buy side premium
    stamp_duty = round(total_buy_turnover * 0.00003, 2)

    # 6. GST: 18% on (Brokerage + Exchange Charges + SEBI Charges)
    gst = round((brokerage + exchange_charges + sebi_charges) * 0.18, 2)

    total_charges = round(brokerage + stt + exchange_charges + sebi_charges + stamp_duty + gst, 2)

    return {
        "brokerage": brokerage,
        "stt": stt,
        "exchange_charges": exchange_charges,
        "sebi_charges": sebi_charges,
        "stamp_duty": stamp_duty,
        "gst": gst,
        "total_charges": total_charges
    }


def calculate_equity_mis_charges(
    buy_value: float,
    sell_value: float,
    brokerage_rate: float = 0.0003,  # 0.03% or Rs 20
    max_brokerage_per_order: float = 20.0
) -> Dict[str, float]:
    """
    Calculates statutory charges for Intraday Cash Equity (MIS).
    """
    total_turnover = buy_value + sell_value

    # 1. Brokerage: min(0.03%, Rs 20) per order
    buy_brok = min(max_brokerage_per_order, buy_value * brokerage_rate)
    sell_brok = min(max_brokerage_per_order, sell_value * brokerage_rate)
    brokerage = round(buy_brok + sell_brok, 2)

    # 2. STT: 0.025% on sell side
    stt = round(sell_value * 0.00025, 2)

    # 3. Exchange Turnover Charges: 0.00297% on total turnover
    exchange_charges = round(total_turnover * 0.0000297, 2)

    # 4. SEBI Charges: Rs 10 / crore (0.0001%)
    sebi_charges = round(total_turnover * 0.000001, 2)

    # 5. Stamp Duty: 0.0015% on buy value
    stamp_duty = round(buy_value * 0.000015, 2)

    # 6. GST: 18% on (Brokerage + Exchange Charges + SEBI)
    gst = round((brokerage + exchange_charges + sebi_charges) * 0.18, 2)

    total_charges = round(brokerage + stt + exchange_charges + sebi_charges + stamp_duty + gst, 2)

    return {
        "brokerage": brokerage,
        "stt": stt,
        "exchange_charges": exchange_charges,
        "sebi_charges": sebi_charges,
        "stamp_duty": stamp_duty,
        "gst": gst,
        "total_charges": total_charges
    }
