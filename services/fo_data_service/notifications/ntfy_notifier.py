"""
ntfy_notifier.py — Instant Push Notification Engine via ntfy.sh
Provides zero-configuration, 100% free sound alerts directly to iPhone.
No account, no API key, and no phone number needed.
"""

import os
import sys
import logging
import json
import urllib.request
from typing import Dict, Any, Optional, List

logger = logging.getLogger("ntfy_notifier")

DEFAULT_TOPIC = "artha_sentinel_bille94"
WIDGET_URL = "https://ai-assistant-v4w4.vercel.app/widget"

PRIORITY_MAP = {
    "min": 1,
    "low": 2,
    "default": 3,
    "high": 4,
    "urgent": 5
}


class NtfyNotifier:
    """
    Sends real-time push notifications with sound, priority levels,
    and clickable widget links directly to the trader's iPhone via ntfy.sh.
    """

    def __init__(self, topic: Optional[str] = None):
        self.topic = (topic or os.getenv("NTFY_TOPIC", DEFAULT_TOPIC)).strip()
        logger.info(f"NtfyNotifier initialized for topic: {self.topic}")

    def send_notification(
        self,
        title: str,
        message: str,
        priority: str = "default",
        tags: Optional[List[str]] = None,
        click_url: Optional[str] = WIDGET_URL
    ) -> bool:
        """
        Dispatches push notification via ntfy.sh JSON API.
        Priority 5 ('urgent') rings loudly on iPhone even in silent/focus mode.
        """
        prio_num = PRIORITY_MAP.get(priority.lower(), 3)
        payload = {
            "topic": self.topic,
            "title": title,
            "message": message,
            "priority": prio_num,
            "tags": tags or [],
            "click": click_url
        }

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                "https://ntfy.sh",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                success = response.status in (200, 201)
                if success:
                    logger.info(f"[ntfy] Push alert delivered: {title}")
                return success
        except Exception as e:
            logger.warning(f"[ntfy] Failed to dispatch push notification: {e}")
            return False

    def send_bot_started(self, vaults: Dict[str, Any]) -> bool:
        fo_cap = vaults.get("fo_capital", 5000.0)
        eq_cap = vaults.get("eq_capital", 2500.0)
        eq_power = vaults.get("eq_purchasing_power", 12500.0)

        title = "Artha Trading Bot Started"
        body = (
            f"Status: Online & Operational\n"
            f"F&O Vault: ₹{fo_cap:,.0f} | Equity: ₹{eq_cap:,.0f} (5x Power: ₹{eq_power:,.0f})\n"
            f"Scanning 14 stocks + NIFTY/BANKNIFTY every 15m."
        )
        return self.send_notification(title, body, priority="default", tags=["rocket", "green_circle"])

    def send_cycle_heartbeat(
        self,
        cycle_num: int,
        time_str: str,
        nifty_sig: str,
        banknifty_sig: str,
        equity_scan_summary: str,
        open_positions_count: int,
        daily_pnl: float
    ) -> bool:
        sign = "+" if daily_pnl >= 0 else ""
        title = f"Cycle #{cycle_num} Complete ({time_str} IST)"
        body = (
            f"NIFTY: {nifty_sig} | BANKNIFTY: {banknifty_sig}\n"
            f"Equity: {equity_scan_summary}\n"
            f"Active: {open_positions_count} | Today P&L: {sign}₹{daily_pnl:,.2f}"
        )
        # Low priority so heartbeat updates stay in lockscreen feed without buzzing loudly every 15m
        return self.send_notification(title, body, priority="low", tags=["timer_clock"])

    def send_order_executed(self, trade: Dict[str, Any]) -> bool:
        sym = trade.get("symbol", "N/A")
        dir_ = trade.get("direction", "N/A")
        entry = trade.get("entry_price", 0.0)
        sl = trade.get("stop_loss", 0.0)
        target = trade.get("target") or trade.get("target_1") or 0.0
        strat = trade.get("strategy_name", "Intraday")

        title = f"Order Executed — {sym} ({dir_})"
        body = (
            f"Entry: ₹{entry:,.2f} | Strategy: {strat}\n"
            f"Stop Loss: ₹{sl:,.2f} | Target: ₹{target:,.2f}"
        )
        return self.send_notification(title, body, priority="high", tags=["chart_with_upwards_trend", "bell"])

    def send_trade_closed(self, trade: Dict[str, Any]) -> bool:
        sym = trade.get("symbol", "N/A")
        dir_ = trade.get("direction", "N/A")
        entry = trade.get("entry_price", 0.0)
        exit_ = trade.get("exit_price", 0.0)
        reason = trade.get("exit_reason", "NORMAL")
        pnl = trade.get("net_pnl") if trade.get("net_pnl") is not None else trade.get("pnl", 0.0)
        sign = "+" if pnl >= 0 else ""

        title = f"Trade Closed — {sym} ({sign}₹{pnl:,.2f})"
        body = (
            f"Direction: {dir_} | Exit: ₹{exit_:,.2f} (Entry: ₹{entry:,.2f})\n"
            f"Reason: {reason} | Net Realized: {sign}₹{pnl:,.2f}"
        )
        tags = ["moneybag", "white_check_mark"] if pnl >= 0 else ["x", "chart_with_downwards_trend"]
        return self.send_notification(title, body, priority="high", tags=tags)

    def send_error_alert(self, stage: str, error_msg: str) -> bool:
        """Urgent alert that rings iPhone loudly immediately to allow trader intervention."""
        title = f"URGENT: Alert in {stage}"
        body = (
            f"Error occurred:\n{error_msg[:240]}\n"
            f"Action: Check laptop Wi-Fi, power, or broker connectivity immediately."
        )
        return self.send_notification(title, body, priority="urgent", tags=["warning", "rotating_light"])

    def send_bot_stopped(self, reason: str = "NORMAL_SHUTDOWN") -> bool:
        title = "Artha Bot Stopped"
        body = f"Engine has powered down. Reason: {reason}\nWake Lock released."
        return self.send_notification(title, body, priority="default", tags=["octagonal_sign"])

    def send_daily_summary(self, summary: Dict[str, Any]) -> bool:
        pnl = summary.get("total_pnl", 0.0)
        sign = "+" if pnl >= 0 else ""
        date_str = summary.get("date", "")
        trades = summary.get("trades_count", 0)
        cap = summary.get("capital", 7500.0)

        title = f"Daily Session Summary ({date_str})"
        body = (
            f"Total P&L: {sign}₹{pnl:,.2f}\n"
            f"Closed Trades: {trades} | Ending Portfolio: ₹{cap:,.2f}\n"
            f"F&O: ₹{summary.get('fo_pnl', 0):,.2f} | EQ: ₹{summary.get('equity_pnl', 0):,.2f}"
        )
        return self.send_notification(title, body, priority="high", tags=["bar_chart", "trophy"])
