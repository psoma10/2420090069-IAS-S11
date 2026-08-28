"""PostgreSQL (Neon) connection handling.

A small connection pool is opened once per process and shared. Each request
borrows a connection through :func:`get_connection` and returns it on exit,
which matters on Neon where opening a TLS connection per query would dominate
request latency.

Rows come back as dictionaries so repositories can return plain dicts without
a per-query mapping step.
"""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

TABLES = ("activity_log", "encryption_logs", "transfers", "documents", "users")


def init_pool(database_url: str, *, min_size: int = 1, max_size: int = 8) -> ConnectionPool:
    """Create the process-wide connection pool (idempotent)."""
    global _pool
    with _pool_lock:
        if _pool is not None:
            return _pool
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL is not configured. Set it in the environment or in .env"
            )
        _pool = ConnectionPool(
            conninfo=database_url,
            min_size=min_size,
            max_size=max_size,
            kwargs={"row_factory": dict_row},
            open=True,
            timeout=30,
        )
        logger.info("Database pool opened (min=%s max=%s)", min_size, max_size)
        return _pool


def close_pool() -> None:
    """Close the pool. Used by tests and shutdown hooks."""
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None


def pool_is_open() -> bool:
    return _pool is not None


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    """Borrow a pooled connection.

    The connection is committed on clean exit and rolled back if the body
    raises, so a failed operation never leaves a half-written transaction.
    """
    if _pool is None:
        raise RuntimeError("Database pool is not initialised; call init_pool() first")
    with _pool.connection() as conn:
        yield conn


@contextmanager
def get_cursor() -> Iterator[psycopg.Cursor]:
    """Borrow a cursor over a pooled connection."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            yield cur


def apply_schema() -> None:
    """Apply schema.sql.

    Every statement is ``IF NOT EXISTS``, so this is safe to run on every
    startup and never destroys existing data.
    """
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    logger.info("Database schema applied")


def truncate_all(*, i_understand_this_deletes_all_data: bool = False) -> None:
    """Remove every row from every table, preserving the schema.

    Destructive, and used only by the automated test suite against a test
    database. The keyword flag has to be passed explicitly so this can never
    be triggered by an accidental call.
    """
    if not i_understand_this_deletes_all_data:
        raise RuntimeError(
            "truncate_all() deletes all data and must be called with "
            "i_understand_this_deletes_all_data=True"
        )
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"
            )
    logger.warning("All CyberVault tables truncated")
