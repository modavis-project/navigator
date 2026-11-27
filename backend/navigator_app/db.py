from __future__ import annotations

import atexit
from contextvars import ContextVar
import time
from collections.abc import Iterator
from contextlib import contextmanager
from threading import Lock

import psycopg
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

from .config import Settings


query_deadline = ContextVar("navigator_query_deadline", default=None)
_use_connection_pool = ContextVar("navigator_use_connection_pool", default=True)


def constrain_sqlite_reads(connection, seconds=10):
    """Apply the same remaining request budget to an immutable SQLite reader."""
    deadline = min(time.monotonic() + seconds, query_deadline.get() or float("inf"))
    connection.set_progress_handler(lambda: int(time.monotonic() >= deadline), 1000)
    if time.monotonic() >= deadline:
        raise TimeoutError("Read query budget exhausted")
    return deadline


_pools: dict[str, ConnectionPool] = {}
_pools_lock = Lock()


def close_pools() -> None:
    with _pools_lock:
        pools = list(_pools.values())
        _pools.clear()
    for pool in pools:
        pool.close()


atexit.register(close_pools)


def _pool(settings: Settings) -> ConnectionPool:
    dsn = settings.db_dsn
    pool = _pools.get(dsn)
    if pool is not None:
        return pool
    with _pools_lock:
        pool = _pools.get(dsn)
        if pool is None:
            # Historical releases must not reserve idle server connections.
            pool = ConnectionPool(
                conninfo=dsn,
                min_size=0,
                max_size=settings.db_pool_max_size,
                max_idle=30,
                timeout=10,
                open=True,
                kwargs={"row_factory": dict_row, "autocommit": False, "connect_timeout": 5},
            )
            _pools[dsn] = pool
    return pool


class _DeadlineConnection:
    def __init__(self, connection, deadline):
        self._connection = connection
        self._deadline = deadline

    def execute(self, query, *args, **kwargs):
        remaining = self._deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Read query budget exhausted")
        self._connection.execute(
            "SELECT set_config('statement_timeout', %s, true)",
            (str(max(1, int(remaining * 1000))),),
        )
        return self._connection.execute(query, *args, **kwargs)

    def transaction(self, *args, **kwargs):
        return self._connection.transaction(*args, **kwargs)

    def __getattr__(self, name):
        # Preserve safe connection metadata used by existing read adapters.
        return getattr(self._connection, name)


@contextmanager
def transient_read_connections() -> Iterator[None]:
    token = _use_connection_pool.set(False)
    try:
        yield
    finally:
        _use_connection_pool.reset(token)


@contextmanager
def connect(settings: Settings) -> Iterator[psycopg.Connection]:
    deadline = query_deadline.get()
    remaining = deadline - time.monotonic() if deadline is not None else None
    if remaining is not None and remaining <= 0:
        raise TimeoutError("Read query budget exhausted")
    connection = (
        _pool(settings).connection(timeout=remaining if remaining is not None else 10)
        if settings.db_pool_max_size and _use_connection_pool.get()
        else psycopg.connect(settings.db_dsn, row_factory=dict_row, autocommit=False)
    )
    with connection as conn:
        with conn.transaction():
            # Enforce the public application's contract even if an operator
            # accidentally supplies a writer role. Deployment grants remain
            # an independent boundary and must also deny writes.
            conn.execute("SET TRANSACTION READ ONLY")
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("Read query budget exhausted")
                conn.execute(
                    "SELECT set_config('statement_timeout', %s, true)",
                    (str(max(1, int(remaining * 1000))),),
                )
            yield _DeadlineConnection(conn, deadline) if deadline is not None else conn
