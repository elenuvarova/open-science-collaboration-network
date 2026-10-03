"""A small in-process cache for read endpoints whose data only changes when the
weekly ETL runs. Entries live `ttl` seconds; past `max_items` the least recently
used go first, so a client walking through parameter values can't grow it."""
import threading
import time
from collections import OrderedDict


class TTLCache:
    def __init__(self, ttl: float, max_items: int = 128):
        self.ttl = ttl
        self.max_items = max_items
        self._data: OrderedDict = OrderedDict()
        self._lock = threading.Lock()

    def get_or_build(self, key, build):
        now = time.monotonic()
        with self._lock:
            hit = self._data.get(key)
            if hit and now - hit[0] < self.ttl:
                self._data.move_to_end(key)
                return hit[1]
        value = build()  # outside the lock: a slow build must not block other keys
        with self._lock:
            self._data[key] = (time.monotonic(), value)
            self._data.move_to_end(key)
            while len(self._data) > self.max_items:
                self._data.popitem(last=False)
        return value

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
