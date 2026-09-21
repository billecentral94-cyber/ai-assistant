"""
SQLAlchemy ORM Models for F&O Data Retrieval Service.
Implements the 4 exact required tables with strict unique constraints.
Uses BIGINT/BIGSERIAL on PostgreSQL and Integer autoincrement on SQLite.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    BigInteger,
    Integer,
    String,
    Numeric,
    Date,
    DateTime,
    Boolean,
    Text,
    UniqueConstraint,
    Index
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def now_utc():
    return datetime.now(timezone.utc)


class OptionChainSnapshot(Base):
    """Stores full option chain snapshots per strike and expiry."""
    __tablename__ = "option_chain_snapshots"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    underlying = Column(String(20), nullable=False)
    expiry = Column(Date, nullable=False)
    strike = Column(Numeric(12, 2), nullable=False)
    option_type = Column(String(2), nullable=False)        # 'CE' | 'PE'
    oi = Column(BigInteger, nullable=False)
    change_in_oi = Column(BigInteger, nullable=False)
    volume = Column(BigInteger, nullable=False)
    iv = Column(Numeric(8, 4), nullable=True)             # Nullable if source lacks IV
    ltp = Column(Numeric(12, 2), nullable=False)
    spot_price = Column(Numeric(12, 2), nullable=False)
    source = Column(String(30), nullable=False)           # 'nsepython' | 'angelone'
    snapshot_status = Column(String(20), nullable=False)  # 'complete' | 'incomplete' | 'failed'
    captured_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        UniqueConstraint(
            "underlying", "expiry", "strike", "option_type", "captured_at",
            name="uq_option_chain_snapshot"
        ),
        Index("idx_opt_snap_query", "underlying", "expiry", "captured_at"),
    )


class FuturesSnapshot(Base):
    """Stores Index Futures OHLCV + OI snapshots."""
    __tablename__ = "futures_snapshots"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    underlying = Column(String(20), nullable=False)
    expiry = Column(Date, nullable=False)
    open = Column(Numeric(12, 2), nullable=False)
    high = Column(Numeric(12, 2), nullable=False)
    low = Column(Numeric(12, 2), nullable=False)
    close = Column(Numeric(12, 2), nullable=False)
    volume = Column(BigInteger, nullable=False)
    oi = Column(BigInteger, nullable=False)
    source = Column(String(30), nullable=False)           # 'angelone' | 'nse'
    snapshot_status = Column(String(20), nullable=False)  # 'complete' | 'incomplete' | 'failed'
    captured_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        UniqueConstraint(
            "underlying", "expiry", "captured_at",
            name="uq_futures_snapshot"
        ),
        Index("idx_fut_snap_query", "underlying", "expiry", "captured_at"),
    )


class GapLog(Base):
    """Records missing or rejected snapshots with explicit reason codes."""
    __tablename__ = "gap_log"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    data_type = Column(String(30), nullable=False)        # 'option_chain' | 'futures'
    underlying = Column(String(20), nullable=False)
    expected_timestamp = Column(DateTime(timezone=True), nullable=False)
    reason = Column(String(50), nullable=False)           # 'timeout' | 'rate_limit' | 'incomplete' | 'source_down' | 'validation_error'
    details = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_gap_log_query", "underlying", "data_type", "expected_timestamp"),
    )


class RetrievalAuditLog(Base):
    """Logs cycle audits and EOD reconciliation summaries."""
    __tablename__ = "retrieval_audit_log"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    run_timestamp = Column(DateTime(timezone=True), nullable=False)
    data_type = Column(String(30), nullable=False)        # 'option_chain' | 'futures' | 'eod_reconciliation'
    underlying = Column(String(20), nullable=False)
    rows_expected = Column(Integer, nullable=False)
    rows_captured = Column(Integer, nullable=False)
    rows_rejected_incomplete = Column(Integer, nullable=False)
    rows_deduped = Column(Integer, nullable=False)
    source_used = Column(String(30), nullable=False)      # 'primary' | 'fallback' | 'none'
    severity = Column(String(20), nullable=False)         # 'OK' | 'MINOR' | 'MAJOR' | 'CRITICAL'
    message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_audit_log_time", "run_timestamp", "severity"),
    )


class AnalyticsOIWall(Base):
    """Stores Top Call and Put OI walls (support & resistance) with shift tracking."""
    __tablename__ = "analytics_oi_walls"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    underlying = Column(String(20), nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    strike = Column(Numeric(12, 2), nullable=False)
    option_type = Column(String(2), nullable=False)       # 'CE' (Resistance) | 'PE' (Support)
    oi = Column(BigInteger, nullable=False)
    oi_change = Column(BigInteger, nullable=False)
    wall_rank = Column(Integer, nullable=False)           # 1 (Strongest) to 5
    wall_shift_direction = Column(String(20), nullable=True) # 'up', 'down', 'stable', 'new'
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_oi_walls_query", "underlying", "captured_at", "option_type"),
    )


class AnalyticsPCR(Base):
    """Stores Put-Call Ratio and market sentiment zone."""
    __tablename__ = "analytics_pcr"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    underlying = Column(String(20), nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    total_put_oi = Column(BigInteger, nullable=False)
    total_call_oi = Column(BigInteger, nullable=False)
    overall_pcr = Column(Numeric(8, 4), nullable=False)
    atm_pcr = Column(Numeric(8, 4), nullable=False)
    pcr_trend = Column(String(20), nullable=False)        # 'rising', 'falling', 'flat'
    sentiment_zone = Column(String(30), nullable=False)   # 'oversold_bullish', 'overbought_bearish', 'neutral'
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_pcr_query", "underlying", "captured_at"),
    )


class AnalyticsFuturesBuildup(Base):
    """Stores Futures price and OI buildup classification."""
    __tablename__ = "analytics_futures_buildup"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    underlying = Column(String(20), nullable=False)
    expiry = Column(Date, nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    price_change = Column(Numeric(12, 2), nullable=False)
    oi_change = Column(BigInteger, nullable=False)
    buildup_type = Column(String(30), nullable=False)     # 'Long Buildup', 'Short Buildup', 'Short Covering', 'Long Unwinding'
    confidence_pct = Column(Numeric(5, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_futures_buildup_query", "underlying", "captured_at"),
    )


class AnalyticsIV(Base):
    """Stores Implied Volatility metrics, skew, and option pricing regime."""
    __tablename__ = "analytics_iv"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    underlying = Column(String(20), nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    atm_iv = Column(Numeric(8, 4), nullable=False)
    iv_percentile = Column(Numeric(6, 2), nullable=True)  # 0 to 100%
    iv_skew = Column(Numeric(8, 4), nullable=True)        # OTM Put IV - OTM Call IV
    iv_regime = Column(String(30), nullable=False)        # 'cheap_buy_options', 'elevated_sell_options', 'normal'
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_iv_query", "underlying", "captured_at"),
    )


class AnalyticsMaxPain(Base):
    """Stores Max Pain strike price where option sellers maximize retention."""
    __tablename__ = "analytics_max_pain"

    id = Column(Integer().with_variant(BigInteger, "postgresql"), primary_key=True, autoincrement=True)
    underlying = Column(String(20), nullable=False)
    expiry = Column(Date, nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    spot_price = Column(Numeric(12, 2), nullable=False)
    max_pain_strike = Column(Numeric(12, 2), nullable=False)
    distance_from_spot_pct = Column(Numeric(6, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("idx_max_pain_query", "underlying", "expiry", "captured_at"),
    )

