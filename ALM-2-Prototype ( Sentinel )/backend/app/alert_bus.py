"""In-process pub/sub (alerts + typed events) for SSE clients, plus a token-bucket rate limiter."""
from __future__ import annotations

import queue
import threading
import time
from typing import Any, Callable


class AlertBus:
    """Thread-safe broadcast bus. Each subscriber owns a bounded queue; slow clients drop events."""

    def __init__(self, maxsize: int = 1000) -> None:
        self._subs: set[queue.Queue[dict[str, Any]]] = set()
        self._lock = threading.Lock()
        self._maxsize = maxsize

    def subscribe(self) -> "queue.Queue[dict[str, Any]]":
        q: queue.Queue[dict[str, Any]] = queue.Queue(self._maxsize)
        with self._lock:
            self._subs.add(q)
        return q

    def unsubscribe(self, q: "queue.Queue[dict[str, Any]]") -> None:
        with self._lock:
            self._subs.discard(q)

    def publish(self, alert: dict[str, Any]) -> None:
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(alert)
            except queue.Full:
                pass

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subs)


class EventBus:
    """Typed pub/sub for ``GET /api/events``. Subscribers receive ``(event_type, data)`` tuples."""

    def __init__(self, maxsize: int = 1000) -> None:
        self._subs: set[queue.Queue[tuple[str, Any]]] = set()
        self._lock = threading.Lock()
        self._maxsize = maxsize

    def subscribe(self) -> "queue.Queue[tuple[str, Any]]":
        q: queue.Queue[tuple[str, Any]] = queue.Queue(self._maxsize)
        with self._lock:
            self._subs.add(q)
        return q

    def unsubscribe(self, q: "queue.Queue[tuple[str, Any]]") -> None:
        with self._lock:
            self._subs.discard(q)

    def publish(self, event_type: str, data: Any) -> None:
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait((event_type, data))
            except queue.Full:
                pass

    def change(self, entity: str) -> None:
        self.publish("change", {"entity": entity})

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subs)


class RateLimiter:
    """Per-key token bucket (in-process). ``allow`` returns False when the key is out of tokens."""

    def __init__(self, rate: float = 20.0, burst: float = 40.0, now: Callable[[], float] = time.monotonic) -> None:
        self.rate, self.burst = rate, burst
        self._now = now
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        t = self._now()
        with self._lock:
            tokens, last = self._buckets.get(key, (self.burst, t))
            tokens = min(self.burst, tokens + (t - last) * self.rate)
            ok = tokens >= 1.0
            self._buckets[key] = (tokens - 1.0 if ok else tokens, t)
            if len(self._buckets) > 10000:
                self._buckets.clear()
            return ok
