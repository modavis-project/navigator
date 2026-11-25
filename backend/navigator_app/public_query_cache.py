"""Small snapshot-bound JSON/byte caches with entry, byte and age limits."""
from __future__ import annotations

from collections import OrderedDict
from functools import wraps
import json
from threading import RLock
import time


class BoundedQueryCache:
    def __init__(self, *, max_entries=128, max_bytes=16 * 1024 * 1024, ttl=60, clock=time.monotonic):
        self.max_entries, self.max_bytes, self.ttl, self.clock = max_entries, max_bytes, ttl, clock
        self.entries = OrderedDict()
        self.bytes = 0
        self.lock = RLock()

    @staticmethod
    def _size(key, value):
        # Keys contain caller-controlled query text as well as snapshot IDs.
        # Bound their retained encoded bytes too, not just response payloads.
        return len(key.encode("utf-8") if isinstance(key, str) else key) + len(value)

    def _expire(self, now):
        for key, (expiry, value) in list(self.entries.items()):
            if expiry <= now:
                self.bytes -= self._size(key, value)
                del self.entries[key]

    def get(self, key):
        with self.lock:
            self._expire(self.clock())
            entry = self.entries.get(key)
            if entry is None:
                return None
            self.entries.move_to_end(key)
            return entry[1]

    def put(self, key, value: bytes):
        size = self._size(key, value)
        if size > self.max_bytes or self.max_entries < 1:
            return
        with self.lock:
            now = self.clock()
            self._expire(now)
            prior = self.entries.pop(key, None)
            if prior is not None:
                self.bytes -= self._size(key, prior[1])
            while self.entries and (len(self.entries) >= self.max_entries or self.bytes + size > self.max_bytes):
                old_key, (_, old_value) = self.entries.popitem(last=False)
                self.bytes -= self._size(old_key, old_value)
            self.entries[key] = (now + self.ttl, value)
            self.bytes += size

    def clear(self):
        with self.lock:
            self.entries.clear()
            self.bytes = 0


def snapshot_cached(function):
    """Repository-local cache with immutable source identity in every key."""
    @wraps(function)
    def wrapped(self, *args, **kwargs):
        cache = getattr(self, "_public_query_cache", None)
        binding = getattr(self, "snapshot_binding", None)
        if cache is None or binding is None:
            return function(self, *args, **kwargs)
        key = json.dumps([binding(), function.__name__, args, kwargs], sort_keys=True, separators=(",", ":"))
        cached = cache.get(key)
        if cached is not None:
            return json.loads(cached)
        value = function(self, *args, **kwargs)
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
        cache.put(key, encoded)
        # Do not return the cached mutable object to a caller that enriches rows.
        return value
    return wrapped
