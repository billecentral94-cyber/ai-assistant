"""
Strategy and Risk Engine for F&O Algo Trading System.
Provides confluence-based signal generation, hedged strategy selection,
and institutional capital protection.
"""

from .signal_generator import SignalGenerator, Signal
from .risk_manager import RiskManager
from .trade_recommender import recommend_hedged_strategy

__all__ = [
    "SignalGenerator",
    "Signal",
    "RiskManager",
    "recommend_hedged_strategy",
]
