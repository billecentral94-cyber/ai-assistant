"""
Database Connection and Session Management.
Supports both PostgreSQL (production) and SQLite (testing / offline dry-runs).
"""

from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from config.settings import settings
from db.models import Base

_engine = None
_SessionFactory = None


def get_engine(database_url: str = ""):
    """Returns or creates the SQLAlchemy engine."""
    global _engine, _SessionFactory
    url = database_url or settings.DATABASE_URL
    if _engine is None or str(_engine.url) != url:
        # If sqlite, enable check_same_thread=False
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, echo=False, connect_args=connect_args, pool_pre_ping=True)
        _SessionFactory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def init_db(engine=None) -> None:
    """Initializes all database tables (CREATE TABLE IF NOT EXISTS)."""
    eng = engine or get_engine()
    Base.metadata.create_all(bind=eng)


@contextmanager
def get_db_session(engine=None) -> Generator[Session, None, None]:
    """Context manager for transactional database sessions."""
    eng = engine or get_engine()
    session_factory = sessionmaker(bind=eng, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
