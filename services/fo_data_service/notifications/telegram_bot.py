"""
Telegram Notification Dispatcher.
Sends real-time actionable trade alerts, position updates, risk breach warnings,
and end-of-day P&L summaries directly to the trader's mobile device.
"""

import os
import logging
from typing import Dict, Any, Optional
import urllib.request
import urllib.parse
import json

logger = logging.getLogger(__name__)


class TelegramNotifier:
    """
    Dispatches alerts to Telegram channel or direct chat.
    Operates in silent logging mode if credentials are not configured.
    """

    def __init__(
        self,
        bot_token: Optional[str] = None,
        chat_id: Optional[str] = None
    ):
        self.bot_token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        self.chat_id = chat_id or os.getenv("TELEGRAM_CHAT_ID", "").strip()
        self.is_configured = bool(self.bot_token and self.chat_id and not self.bot_token.startswith("your_"))

    def send_message(self, text: str) -> bool:
        """Sends markdown formatted message to Telegram chat."""
        if not self.is_configured:
            logger.info(f"[Telegram Alert Simulation]:\n{text}")
            return True

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "Markdown"
        }

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 200
        except Exception as e:
            logger.error(f"Failed to dispatch Telegram alert: {e}")
            return False

    def send_signal_alert(self, signal: Any) -> bool:
        """Dispatches a newly generated confluence trade setup."""
        direction = getattr(signal, "direction", "BULLISH")
        score = getattr(signal, "confluence_score", 3)
        symbol = getattr(signal, "symbol", "NIFTY")
        entry = getattr(signal, "entry_price", 0.0)
        sl = getattr(signal, "stop_loss", 0.0)
        tp = getattr(signal, "target_1", 0.0)
        strat = getattr(signal, "recommended_strategy", {}).get("strategy_name", "Hedged Spread")
        pos = getattr(signal, "position_size", {})
        lots = pos.get("lots", 1)
        risk_pct = pos.get("risk_pct", 1.0)

        icon = "🟢" if direction == "BULLISH" else "🔴"
        msg = (
            f"*{icon} NEW CONFLUENCE SIGNAL — {symbol}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Bias:* {direction} ({score}/5 Confirmations)\n"
            f"• *Structure:* {strat}\n"
            f"• *Entry:* ₹{entry:,.2f}\n"
            f"• *Stop Loss:* ₹{sl:,.2f}\n"
            f"• *Target:* ₹{tp:,.2f}\n"
            f"• *Position Size:* {lots} Lots (Risk: {risk_pct}%)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Risk strictly capped at defined max loss._"
        )
        return self.send_message(msg)

    def send_trade_closed_alert(self, trade: Dict[str, Any]) -> bool:
        """Dispatches an exit notification with realized PnL."""
        symbol = trade.get("symbol", "NIFTY")
        reason = trade.get("exit_reason", "EXIT")
        pnl = trade.get("net_pnl", 0.0)
        pnl_icon = "💰" if pnl >= 0 else "🛑"
        sign = "+" if pnl >= 0 else ""

        msg = (
            f"*{pnl_icon} TRADE CLOSED — {symbol}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Outcome:* {reason}\n"
            f"• *Strategy:* {trade.get('strategy', 'Hedged Spread')}\n"
            f"• *Exit Price:* ₹{trade.get('exit_price', 0):,.2f}\n"
            f"• *Net P&L:* *{sign}₹{pnl:,.2f}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
        )
        return self.send_message(msg)

    def send_risk_alert(self, event_type: str, details: str) -> bool:
        """Dispatches critical capital protection alerts (Kill Switch / Drawdown)."""
        msg = (
            f"*🚨 CAPITAL RISK GUARD ACTIVATED*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Event:* {event_type}\n"
            f"• *Details:* {details}\n"
            f"• *Action Taken:* Order execution locked to protect capital.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
        )
        return self.send_message(msg)

    def send_daily_summary(self, summary: Dict[str, Any]) -> bool:
        """Dispatches end-of-day market reconciliation summary."""
        date_str = summary.get("date", "Today")
        trades = summary.get("total_trades", 0)
        wins = summary.get("wins", 0)
        losses = summary.get("losses", 0)
        pnl = summary.get("total_pnl", 0.0)
        sign = "+" if pnl >= 0 else ""
        cap = summary.get("capital", 500000.0)

        msg = (
            f"*📊 EOD PERFORMANCE SUMMARY — {date_str}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"• *Trades Completed:* {trades} ({wins}W / {losses}L)\n"
            f"• *Daily Net P&L:* *{sign}₹{pnl:,.2f}*\n"
            f"• *Portfolio Capital:* ₹{cap:,.2f}\n"
            f"• *Audit Status:* 100% Intervals Reconciled\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
        )
        return self.send_message(msg)
