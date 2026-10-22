"""Wires all engines together; one instance per app (tests build their own with a ManualClock)."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .alert_bus import AlertBus, EventBus, RateLimiter
from .anomaly import AnomalyConfig, AnomalyEngine
from .clock import Clock, system_clock
from .db import DEFAULT_DB_PATH, Database
from .firewall import FirewallEngine
from .ids_rules import IdsEngine
from .simulator import Simulator

VERSION = "1.0.0"


class AppContext:
    def __init__(self, db_path: str | Path = DEFAULT_DB_PATH, clock: Clock = system_clock,
                 seed: Optional[int] = None, auto_seed: bool = True) -> None:
        self.clock = clock
        self.started_at = clock()
        self.db = Database(db_path)
        self.bus = AlertBus()
        self.events = EventBus()
        self.rate_limiter = RateLimiter(20.0, 40.0)
        self.firewall = FirewallEngine(self.db)
        self.ids = IdsEngine(self.db)
        cfg = self.db.get_setting("anomaly_config", {})
        self.anomaly = AnomalyEngine(clock, AnomalyConfig(**cfg) if cfg else AnomalyConfig())
        self.sim = Simulator(self.db, self.firewall, self.ids, self.anomaly, self.bus, clock, seed,
                         self.events)
        if auto_seed:
            if self.db.scalar("SELECT COUNT(*) FROM hosts") == 0:
                self.sim.seed()
            else:  # persisted DB, but the in-memory baseline is gone after a restart
                self.sim.baseline(5)

    def notify(self, entity: str) -> None:
        self.events.change(entity)

    def set_anomaly_config(self, cfg: AnomalyConfig) -> None:
        with self.db.lock:
            bucket_changed = cfg.bucket_seconds != self.anomaly.config.bucket_seconds
            self.anomaly.configure(cfg)
            self.db.set_setting("anomaly_config", cfg.as_dict())
            if bucket_changed:
                self.sim.baseline(5)
