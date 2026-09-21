"""
Base Fetcher Interface and Result Data Structures.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
import pytz

IST = pytz.timezone("Asia/Kolkata")


class OptionChainRow(BaseModel):
    underlying: str
    expiry: str                     # ISO YYYY-MM-DD
    strike: float
    option_type: str                # 'CE' or 'PE'
    oi: int
    change_in_oi: int
    volume: int
    iv: Optional[float] = None
    ltp: float
    spot_price: float
    source: str
    snapshot_status: str = "complete"
    captured_at: datetime


class FuturesRow(BaseModel):
    underlying: str
    expiry: str                     # ISO YYYY-MM-DD
    open: float
    high: float
    low: float
    close: float
    volume: int
    oi: int
    source: str
    snapshot_status: str = "complete"
    captured_at: datetime


class BaseFetcher(ABC):
    """Abstract Base Class for Data Fetchers."""

    @abstractmethod
    def fetch(self, underlying: str, **kwargs) -> List[Any]:
        """Fetch market data for the given underlying."""
        pass
