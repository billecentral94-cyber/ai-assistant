"""
Analytics package for F&O Algo Trading System.
Provides quantitative calculations for Open Interest, PCR, Futures Buildup, IV regimes, and Max Pain.
"""

from .oi_analyzer import compute_oi_walls
from .pcr_calculator import compute_pcr
from .futures_buildup import classify_buildup
from .iv_analyzer import compute_iv_metrics
from .max_pain import compute_max_pain
from .engine import AnalyticsEngine

__all__ = [
    "compute_oi_walls",
    "compute_pcr",
    "classify_buildup",
    "compute_iv_metrics",
    "compute_max_pain",
    "AnalyticsEngine",
]
