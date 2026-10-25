"""Live traffic engine: a background thread that keeps the simulation moving without anyone clicking.

Every tick it feeds a Poisson-sized batch of benign packets through the normal pipeline and, at random
intervals, launches an attack scenario from a fresh external address (so per-(rule, source) cooldowns never
swallow it). Attack packets are dripped over a few ticks instead of arriving in one burst.
"""
from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING, Any, Optional

from . import simulator as S

if TYPE_CHECKING:  # pragma: no cover
    from .context import AppContext

SETTING_KEY = "live"
DEFAULTS: dict[str, Any] = {"enabled": True, "rate": 2.0, "attack_interval": 60}
LIMITS = {"rate": (0.2, 20.0), "attack_interval": (0, 3600)}  # attack_interval 0 = benign traffic only
ATTACKS = ("brute_force", "port_scan", "ddos", "exfiltration", "telnet_probe", "bastion_bypass")
ATTACKER_IPS = (S.ATTACKER, S.FLOODER, S.PROBER, S.BYPASSER)
TICK = 1.0


def normalize(cfg: dict[str, Any]) -> dict[str, Any]:
    out = dict(DEFAULTS)
    out["enabled"] = bool(cfg.get("enabled", out["enabled"]))
    for key, (lo, hi) in LIMITS.items():
        out[key] = min(hi, max(lo, type(DEFAULTS[key])(cfg.get(key, out[key]))))
    return out


class LiveTraffic:
    def __init__(self, ctx: "AppContext") -> None:
        self.ctx = ctx
        self.config = normalize(ctx.db.get_setting(SETTING_KEY, {}))
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._queue: list[dict[str, Any]] = []  # attack packets still to be dripped out
        self._per_tick = 1
        self._next_attack: Optional[float] = None
        self.stats = {"ticks": 0, "packets": 0, "attacks": 0, "last_attack": None, "last_attack_at": None}

    # ------------------------------------------------------------------ control
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="sentinel-live", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None

    def configure(self, patch: dict[str, Any]) -> dict[str, Any]:
        self.config = normalize({**self.config, **patch})
        self._next_attack = None
        self.ctx.db.set_setting(SETTING_KEY, self.config)
        return self.status()

    def status(self) -> dict[str, Any]:
        running = bool(self._thread and self._thread.is_alive()) and self.config["enabled"]
        return {**self.config, "running": running, **self.stats, "queued": len(self._queue)}

    # ------------------------------------------------------------------ generation
    def benign_batch(self, n: int) -> list[dict[str, Any]]:
        """Individual benign packets drawn from the same mix as the 'normal' scenario."""
        sim, r = self.ctx.sim, self.ctx.sim.rng
        s = sim._spec
        makers = (
            lambda: s("https", S.PARTNER, r.choice((S.WEB1, S.WEB2))),
            lambda: s("http", S.PARTNER, r.choice((S.WEB1, S.WEB2))),
            lambda: s("ssh_login", S.PARTNER, S.BASTION, success=True),
            lambda: s("dns", r.choice((S.WEB1, S.WEB2, S.DB)), r.choice((S.WEB2, S.BASTION))),
            lambda: s("ping", S.BASTION, r.choice((S.WEB1, S.WEB2, S.DB))),
            lambda: s("http", S.WEB1, S.WEB2),
            lambda: s("http", S.WS, S.WEB1),  # blocked: quarantined workstation (low-severity FW-BLOCK alert)
        )
        weights = (5, 4, 1, 3, 2, 2, 1)
        return [r.choices(makers, weights)[0]() for _ in range(n)]

    def attack_batch(self) -> tuple[str, list[dict[str, Any]]]:
        sim, r = self.ctx.sim, self.ctx.sim.rng
        name = r.choice(ATTACKS)
        specs = sim.build_scenario(name)
        fresh = f"203.0.113.{r.randint(60, 250)}"
        for sp in specs:
            for key in ("src_ip", "dst_ip"):
                if sp[key] in ATTACKER_IPS:
                    sp[key] = fresh
        return name, specs

    def tick(self, now: Optional[float] = None) -> int:
        """One iteration (also called directly by tests). Returns the number of packets processed."""
        ctx, cfg = self.ctx, self.config
        now = time.monotonic() if now is None else now
        batch: list[dict[str, Any]] = []
        if cfg["enabled"]:
            batch += self.benign_batch(int(ctx.sim.np_rng.poisson(cfg["rate"] * TICK)))
            if cfg["attack_interval"] > 0:
                if self._next_attack is None:
                    self._next_attack = now + ctx.sim.rng.uniform(0.3, 1.2) * cfg["attack_interval"]
                elif now >= self._next_attack and not self._queue:
                    name, specs = self.attack_batch()
                    self._queue = specs
                    self._per_tick = max(1, -(-len(specs) // 5))  # spread over ~5 ticks
                    self.stats.update(attacks=self.stats["attacks"] + 1, last_attack=name,
                                      last_attack_at=ctx.clock())
                    self._next_attack = now + ctx.sim.rng.uniform(0.6, 1.4) * cfg["attack_interval"]
            if self._queue:
                batch += self._queue[:self._per_tick]
                self._queue = self._queue[self._per_tick:]
        self.stats["ticks"] += 1
        if not batch:
            return 0
        packets = ctx.sim.process(batch)
        self.stats["packets"] += len(packets)
        ctx.notify("packets")
        ctx.notify("rules")
        if any(p["alerts"] for p in packets):
            ctx.notify("alerts")
        return len(packets)

    def _run(self) -> None:
        while not self._stop.wait(TICK):
            try:
                self.tick()
            except Exception:  # keep the feed alive; a bad tick must not kill live mode
                import logging
                logging.getLogger("sentinel.live").exception("live tick failed")
