"""Database configuration helpers for the API gateway."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, URL, make_url
from sqlalchemy.orm import Session, sessionmaker

DEFAULT_DB_FILENAME = "gateway.db"
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / DEFAULT_DB_FILENAME
DB_URL_ENV_VAR = "GATEWAY_DB_URL"

_engine: Engine | None = None


def get_database_url() -> str:
    """Return the configured database URL (defaults to a SQLite file)."""
    env_url = os.getenv(DB_URL_ENV_VAR)
    if env_url:
        return env_url
    return f"sqlite:///{DEFAULT_DB_PATH}"


def _prepare_sqlite_path(url: URL) -> None:
    """Ensure on-disk SQLite paths exist before engine creation."""
    database = url.database
    if not database or database == ":memory:":
        return

    db_path = Path(database)
    if not db_path.is_absolute():
        db_path = (Path.cwd() / db_path).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)


def get_engine() -> Engine:
    """Create (or return) the global SQLAlchemy engine."""
    global _engine
    if _engine is None:
        database_url = get_database_url()
        parsed_url = make_url(database_url)
        if parsed_url.drivername.startswith("sqlite"):
            _prepare_sqlite_path(parsed_url)
            connect_args = {"check_same_thread": False}
        else:
            connect_args = {}
        _engine = create_engine(database_url, future=True, connect_args=connect_args)
    return _engine


SessionLocal = sessionmaker(
    bind=get_engine(),
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    future=True,
)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency for DB sessions (yield pattern)."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_db() -> None:
    """Create tables if they are missing."""
    from . import models  # noqa: WPS433 (import inside function)

    models.Base.metadata.create_all(bind=get_engine())

