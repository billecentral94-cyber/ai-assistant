"""
Notifications package for F&O Algo Trading System.
Provides Telegram alert dispatching for signals, fills, risk breaches, and EOD reports.
"""

from .telegram_bot import TelegramNotifier

__all__ = ["TelegramNotifier"]
