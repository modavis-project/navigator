from __future__ import annotations

import atexit
from collections.abc import Iterator
from contextlib import contextmanager
from threading import Lock

import psycopg
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

from .config import Settings


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
                max_size=8,
                max_idle=30,
                timeout=10,
                open=True,
                kwargs={"row_factory": dict_row},
            )
            _pools[dsn] = pool
    return pool


@contextmanager
def connect(settings: Settings) -> Iterator[psycopg.Connection]:
    with _pool(settings).connection() as conn:
        yield conn
