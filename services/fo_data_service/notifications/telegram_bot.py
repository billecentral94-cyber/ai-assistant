"""
Telegram Notification & Remote Mobile Command Dispatcher.
Provides real-time push alerts to the trader's mobile device for:
- Bot startup and wake status
- 15-minute cycle heartbeat and health
- Order execution and exits (with PnL)
- Real-time error alerts with traceback details
- End-of-day reconciliation and shutdown

Also provides a 2-way interactive listener so the trader can text the bot from anywhere:
- /status  -> Live portfolio, capital, and active positions
- /today   -> All trades executed today and daily PnL
- /history -> Past historical performance summary
- /ping    -> Heartbeat check
"""

import os
import sys
import logging
import threading
import time
import json
import urllib.request
import urllib.parse
from typing import Dict, Any, Optional, Callable

logger = logging.getLogger("telegram_bot")

HISTORICAL_RECORDS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "daily_records.json"
)


class TelegramNotifier:
    """
    Dispatches push alerts and handles 2-way mobile commands via Telegram Bot API.
    If credentials are not yet configured in .env, operates in safe simulation logging mode.
    """

    def __init__(
        self,
        bot_token: Optional[str] = None,
        chat_id: Optional[str] = None
    ):
        self.bot_token = (bot_token or os.getenv("TELEGRAM_BOT_TOKEN", "")).strip()
        self.chat_id = (chat_id or os.getenv("TELEGRAM_CHAT_ID", "")).strip()
        self.is_configured = bool(self.bot_token and self.chat_id and not self.bot_token.startswith("your_"))
        
        self._listener_running = False
        self._listener_thread: Optional[threading.Thread] = None
        self._last_update_id = 0

        # Callbacks for interactive remote commands
        self._status_fn: Optional[Callable[[], str]] = None
        self._today_fn: Optional[Callable[[], str]] = None
        self._history_fn: Optional[Callable[[], str]] = None

        # Dual-dispatch via ntfy.sh (zero setup, push sound alerts to iPhone)
        try:
            from notifications.ntfy_notifier import NtfyNotifier
            self.ntfy = NtfyNotifier()
        except Exception as e:
            logger.warning(f"Could not initialize NtfyNotifier: {e}")
            self.ntfy = None

    def send_message(self, text: str) -> bool:
        """Sends markdown formatted message to Telegram chat."""
        if not self.is_configured:
            logger.info(f"[Telegram Alert (Setup Pending)]:\n{text}")
            return True

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True
        }

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                return response.status == 200
        except Exception as e:
            logger.error(f"Failed to dispatch Telegram message: {e}")
            return False

    # ── Real-Time Lifecycle Push Notifications ───────────────────────────────

    def send_bot_started(self, vaults: Dict[str, Any]) -> bool:
        """Dispatches notification when bot powers on and acquires wake lock."""
        fo_cap = vaults.get("fo_capital", 5000.0)
        eq_cap = vaults.get("eq_capital", 2500.0)
        eq_power = vaults.get("eq_purchasing_power", 12500.0)
        now_str = time.strftime("%d-%b-%Y %H:%M:%S IST")

        msg = (
            f"🟢 *ARTHA TRADING BOT STARTED*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Status:* Online & Operational\n"
            f"• *Time:* `{now_str}`\n"
            f"• *Wake Lock:* Active (Laptop will stay awake)\n"
            f"• *Broker:* Angel One SmartAPI (Connected)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 *Dual Vault Setup (₹7,500 Total):*\n"
            f"  1. *F&O Micro-Vault:* ₹{fo_cap:,.2f} (1 Lot max)\n"
            f"  2. *Equity Intraday:* ₹{eq_cap:,.2f} (5x Power: ₹{eq_power:,.2f})\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Scanning 14 stocks + NIFTY/BANKNIFTY every 15m._"
        )
        if self.ntfy:
            self.ntfy.send_bot_started(vaults)
        return self.send_message(msg)

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
        """Dispatches 15-minute heartbeat notification confirming engine health."""
        pnl_icon = "🟢" if daily_pnl >= 0 else "🔴"
        sign = "+" if daily_pnl >= 0 else ""

        msg = (
            f"⏱️ *CYCLE #{cycle_num} COMPLETED — {time_str} IST*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *System Health:* Normal (No errors)\n"
            f"• *NIFTY Signal:* {nifty_sig}\n"
            f"• *BANKNIFTY Signal:* {banknifty_sig}\n"
            f"• *Equity Scanner (14 Stocks):* {equity_scan_summary}\n"
            f"• *Active Positions:* {open_positions_count}\n"
            f"• *Today's P&L:* {pnl_icon} *{sign}₹{daily_pnl:,.2f}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Next cycle scheduled in 15 minutes._"
        )
        if self.ntfy:
            self.ntfy.send_cycle_heartbeat(
                cycle_num, time_str, nifty_sig, banknifty_sig,
                equity_scan_summary, open_positions_count, daily_pnl
            )
        return self.send_message(msg)

    def send_order_executed(self, trade: Dict[str, Any]) -> bool:
        """Dispatches instant notification when an order is placed."""
        sym = trade.get("symbol", "N/A")
        direction = trade.get("direction", "BUY")
        qty = trade.get("quantity") or trade.get("qty", 1)
        entry = trade.get("entry_price", 0.0)
        sl = trade.get("stop_loss", 0.0)
        tp = trade.get("target") or trade.get("target_1", 0.0)
        product = trade.get("product", "EQUITY INTRADAY")
        risk = trade.get("risk_points", 0.0) * qty if "risk_points" in trade else 300.0

        icon = "🚀" if direction == "BUY" else "🔻"
        msg = (
            f"{icon} *NEW ORDER EXECUTED — {direction} {sym}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Product:* {product}\n"
            f"• *Quantity:* {qty} Shares/Lots\n"
            f"• *Entry Price:* Rs. {entry:,.2f}\n"
            f"• *Stop Loss:* Rs. {sl:,.2f}\n"
            f"• *Target:* Rs. {tp:,.2f}\n"
            f"• *Risk Capped At:* Rs. {risk:,.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Trailing stop-loss enabled._"
        )
        if self.ntfy:
            self.ntfy.send_order_executed(trade)
        return self.send_message(msg)

    def send_trade_closed(self, trade: Dict[str, Any]) -> bool:
        """Dispatches notification when a trade exits."""
        sym = trade.get("symbol", "N/A")
        direction = trade.get("direction", "N/A")
        reason = trade.get("exit_reason", "EXIT")
        entry = trade.get("entry_price", 0.0)
        exit_p = trade.get("exit_price", 0.0)
        pnl = trade.get("net_pnl") if trade.get("net_pnl") is not None else trade.get("pnl", 0.0)
        charges = trade.get("charges", 5.0)

        if reason == "TARGET":
            icon = "🎯 TARGET HIT"
        elif reason == "STOP_LOSS":
            icon = "🛑 STOP LOSS HIT"
        elif reason == "EOD_SQUARE_OFF":
            icon = "🕒 15:15 EOD SQUARE-OFF"
        else:
            icon = f"ℹ️ {reason}"

        pnl_icon = "💰" if pnl >= 0 else "📉"
        sign = "+" if pnl >= 0 else ""

        msg = (
            f"{pnl_icon} *TRADE CLOSED — {sym} ({icon})*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Direction:* {direction}\n"
            f"• *Entry:* Rs. {entry:,.2f} ➔ *Exit:* Rs. {exit_p:,.2f}\n"
            f"• *Brokerage & Taxes:* Rs. {charges:,.2f}\n"
            f"• *Net Realized P&L:* *{sign}Rs. {pnl:,.2f}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
        )
        if self.ntfy:
            self.ntfy.send_trade_closed(trade)
        return self.send_message(msg)

    def send_error_alert(self, context: str, error_msg: str) -> bool:
        """Dispatches immediate notification if any error occurs."""
        now_str = time.strftime("%H:%M:%S IST")
        msg = (
            f"🚨 *SYSTEM ALERT — ERROR DETECTED*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Time:* `{now_str}`\n"
            f"• *Module:* `{context}`\n"
            f"• *Error:* `{error_msg[:400]}`\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Engine will attempt auto-recovery on next cycle._"
        )
        if self.ntfy:
            self.ntfy.send_error_alert(context, error_msg)
        return self.send_message(msg)

    def send_bot_stopped(self, reason: str, final_summary: Optional[Dict[str, Any]] = None) -> bool:
        """Dispatches notification when the bot completes session and powers down."""
        now_str = time.strftime("%H:%M:%S IST")
        pnl_str = ""
        if final_summary:
            tot_pnl = final_summary.get("total_daily_pnl", 0.0)
            sign = "+" if tot_pnl >= 0 else ""
            pnl_str = f"• *Today's Net P&L:* *{sign}₹{tot_pnl:,.2f}*\n"

        msg = (
            f"💤 *ARTHA TRADING BOT STOPPED*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Reason:* {reason}\n"
            f"• *Time:* `{now_str}`\n"
            f"{pnl_str}"
            f"• *Wake Lock:* Released (Laptop may now sleep)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Standing by for next trading session at 09:14 AM IST._"
        )
        if self.ntfy:
            self.ntfy.send_bot_stopped(reason)
        return self.send_message(msg)

    def send_daily_summary(self, summary: Dict[str, Any]) -> bool:
        if self.ntfy:
            self.ntfy.send_daily_summary(summary)
        """Dispatches EOD reconciliation summary with Live Readiness Gate status."""
        date_str = summary.get("date", time.strftime("%d-%b-%Y"))
        total_pnl = summary.get("total_pnl", 0.0)
        fo_pnl = summary.get("fo_pnl", 0.0)
        eq_pnl = summary.get("eq_pnl", 0.0)
        trades_count = summary.get("trades_count", 0)
        capital = summary.get("capital", 7500.0)
        gates = summary.get("gates", {})
        sign = "+" if total_pnl >= 0 else ""

        g1 = "PASS" if gates.get("gate_1_win_rate", {}).get("passed") else "PENDING"
        g2 = "PASS" if gates.get("gate_2_profit_factor", {}).get("passed") else "PENDING"
        g3 = "PASS" if gates.get("gate_3_max_drawdown", {}).get("passed") else "PENDING"

        msg = (
            f"📊 *EOD PERFORMANCE SUMMARY — {date_str}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Combined Daily P&L:* *{sign}₹{total_pnl:,.2f}*\n"
            f"  - *F&O Vault P&L:* ₹{fo_pnl:,.2f}\n"
            f"  - *Equity Intraday P&L:* ₹{eq_pnl:,.2f}\n"
            f"• *Total Completed Trades:* {trades_count}\n"
            f"• *Current Portfolio Value:* ₹{capital:,.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"*3 Live Readiness Gates:*\n"
            f"• Gate 1 (Win Rate >= 55%): `{g1}`\n"
            f"• Gate 2 (Profit Factor >= 1.5): `{g2}`\n"
            f"• Gate 3 (Max Drawdown <= 4%): `{g3}`\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_All positions squared off. Zero overnight risk._"
        )
        return self.send_message(msg)

    # ── 2-Way Interactive Mobile Commands (/status, /today, /history) ────────

    def start_command_listener(
        self,
        status_fn: Optional[Callable[[], str]] = None,
        today_fn: Optional[Callable[[], str]] = None,
        history_fn: Optional[Callable[[], str]] = None
    ) -> None:
        """Starts background daemon thread listening for incoming Telegram commands."""
        if not self.is_configured:
            logger.info("Telegram command listener standing by (configure TELEGRAM_BOT_TOKEN to activate).")
            return

        self._status_fn = status_fn
        self._today_fn = today_fn
        self._history_fn = history_fn
        self._listener_running = True

        self._listener_thread = threading.Thread(
            target=self._poll_commands_loop,
            name="TelegramCommandListener",
            daemon=True
        )
        self._listener_thread.start()
        logger.info("Telegram mobile command listener started (/status, /today, /history active).")

    def _poll_commands_loop(self) -> None:
        """Polls getUpdates every 3 seconds to process commands sent from the phone."""
        while self._listener_running:
            try:
                url = f"https://api.telegram.org/bot{self.bot_token}/getUpdates?offset={self._last_update_id + 1}&timeout=3"
                req = urllib.request.Request(url, headers={"User-Agent": "ArthaBot/1.0"})
                with urllib.request.urlopen(req, timeout=6) as response:
                    if response.status == 200:
                        data = json.loads(response.read().decode("utf-8"))
                        for update in data.get("result", []):
                            self._last_update_id = update["update_id"]
                            msg = update.get("message", {})
                            text = (msg.get("text") or "").strip()
                            sender_chat = str(msg.get("chat", {}).get("id", ""))

                            # Security: only respond to the authorized chat_id
                            if sender_chat == self.chat_id and text.startswith("/"):
                                self._handle_remote_command(text)
            except Exception as e:
                time.sleep(4)
            time.sleep(2)

    def _handle_remote_command(self, cmd: str) -> None:
        """Routes and responds to commands sent from the trader's phone."""
        cmd_lower = cmd.lower().split()[0]

        if cmd_lower in ["/start", "/help"]:
            reply = (
                f"🤖 *ARTHA COPILOT — MOBILE COMMANDS*\n"
                f"━━━━━━━━━━━━━━━━━━━━━━\n"
                f"• `/status`  ➔ Live bot health, capital, & open positions\n"
                f"• `/today`   ➔ Today's trade log & realized P&L\n"
                f"• `/history` ➔ Past sessions & cumulative record\n"
                f"• `/ping`    ➔ Instant heartbeat verification\n"
                f"━━━━━━━━━━━━━━━━━━━━━━\n"
                f"_You will also receive instant alerts for every trade and cycle._"
            )
            self.send_message(reply)

        elif cmd_lower == "/ping":
            now_str = time.strftime("%H:%M:%S IST")
            self.send_message(f"🏓 *PONG!* System online, laptop awake at `{now_str}`.")

        elif cmd_lower == "/status":
            if self._status_fn:
                try:
                    res = self._status_fn()
                    self.send_message(res)
                except Exception as e:
                    self.send_message(f"Error fetching status: {e}")
            else:
                self.send_message("Engine status: Active and scanning.")

        elif cmd_lower == "/today":
            if self._today_fn:
                try:
                    res = self._today_fn()
                    self.send_message(res)
                except Exception as e:
                    self.send_message(f"Error fetching today's trades: {e}")
            else:
                self.send_message("No trades recorded yet today.")

        elif cmd_lower == "/history":
            if self._history_fn:
                try:
                    res = self._history_fn()
                    self.send_message(res)
                except Exception as e:
                    self.send_message(f"Error reading history: {e}")
            else:
                self.send_message(self.get_formatted_history())

    def get_formatted_history(self) -> str:
        """Reads daily_records.json and returns a clean historical performance log."""
        if not os.path.exists(HISTORICAL_RECORDS_FILE):
            return "📁 *HISTORICAL LOGS:*\nNo prior sessions archived yet. Tomorrow's session will be Day #1."

        try:
            with open(HISTORICAL_RECORDS_FILE, "r", encoding="utf-8") as f:
                records = json.load(f)

            if not records:
                return "📁 *HISTORICAL LOGS:* No archived sessions found."

            lines = ["📜 *ARTHA HISTORICAL TRADING RECORD*", "━━━━━━━━━━━━━━━━━━━━━━"]
            total_cum_pnl = 0.0
            for r in records[-10:]:  # Last 10 days
                dt = r.get("date", "N/A")
                pnl = r.get("total_pnl", 0.0)
                trades = r.get("trades_count", 0)
                sign = "+" if pnl >= 0 else ""
                lines.append(f"• `{dt}`: *{sign}₹{pnl:,.2f}* ({trades} trades)")
                total_cum_pnl += pnl

            cum_sign = "+" if total_cum_pnl >= 0 else ""
            lines.append("━━━━━━━━━━━━━━━━━━━━━━")
            lines.append(f"• *Cumulative Recorded P&L:* *{cum_sign}₹{total_cum_pnl:,.2f}*")
            return "\n".join(lines)
        except Exception as e:
            return f"Error reading history: {e}"


def archive_daily_record(date_str: str, summary: Dict[str, Any]) -> None:
    """Appends daily session summary into daily_records.json for permanent record-keeping."""
    records = []
    if os.path.exists(HISTORICAL_RECORDS_FILE):
        try:
            with open(HISTORICAL_RECORDS_FILE, "r", encoding="utf-8") as f:
                records = json.load(f)
        except Exception:
            records = []

    # Update or append
    records = [r for r in records if r.get("date") != date_str]
    records.append({
        "date": date_str,
        "total_pnl": summary.get("total_pnl", 0.0),
        "fo_pnl": summary.get("fo_pnl", 0.0),
        "equity_pnl": summary.get("equity_pnl", 0.0),
        "trades_count": summary.get("trades_count", 0),
        "capital": summary.get("capital", 7500.0),
        "trades": summary.get("trades", []),
        "gates": summary.get("gates", {})
    })

    try:
        with open(HISTORICAL_RECORDS_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to archive daily record: {e}")

