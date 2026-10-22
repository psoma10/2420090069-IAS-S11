"""Injectable time source. All engine code receives a ``clock`` callable (epoch seconds, float)."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Callable

Clock = Callable[[], float]


def system_clock() -> float:
    """Wall-clock epoch seconds (UTC)."""
    return time.time()


def iso(ts: float) -> str:
    """Epoch seconds -> ``2026-01-01T12:00:00.123Z``."""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


class ManualClock:
    """Deterministic clock for tests: call ``advance(seconds)`` to move time."""

    def __init__(self, start: float = 1_700_000_000.0) -> None:
        self.now = float(start)

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> float:
        self.now += seconds
        return self.now
