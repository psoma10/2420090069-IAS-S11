"""Statistical anomaly detection: bucketed time series, rolling z-score (pandas/numpy), per-source Welford profiles.

z = (x - mean) / max(std, floor), where mean/std are taken over the trailing buckets *excluding* the current one.
floor = max(REL_FLOOR * |mean|, abs_floor) (abs_floor is roughly one "quantum" of the metric, e.g. one packet or one
login in a bucket) keeps a perfectly flat baseline from producing infinite z-scores.
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

import numpy as np
import pandas as pd

from .clock import Clock, iso

RETAIN_BUCKETS = 120
ABS_FLOOR = 0.05           # default absolute std floor
REL_FLOOR = 0.10
MIN_RATIO_PACKETS = 5      # blocked_ratio is meaningless for a nearly empty bucket
MIN_SRC_PACKETS = 5        # per-source anomaly needs a few packets in the current bucket
ESCALATION = 1.5          # a repeat alert inside the cooldown is allowed if value > 1.5x the last alerted value
ALERT_COOLDOWN = 10.0      # seconds between repeated alerts for the same metric / source

METRICS: list[dict[str, str]] = [
    dict(key="packets_per_sec", label="Packets per second", unit="pkt/s", rule_id="ANOM-PPS", severity="high"),
    dict(key="login_attempts_per_min", label="Login attempts per minute", unit="logins/min", rule_id="ANOM-LOGIN",
         severity="high"),
    dict(key="bytes_per_dst", label="Bytes to busiest destination", unit="bytes", rule_id="ANOM-BYTES",
         severity="high"),
    dict(key="distinct_ports_per_src", label="Distinct ports per source", unit="ports", rule_id="ANOM-PORTS",
         severity="high"),
    dict(key="blocked_ratio", label="Blocked-packet ratio", unit="ratio", rule_id="ANOM-BLOCK", severity="medium"),
]


@dataclass
class AnomalyConfig:
    sigma: float = 3.0
    bucket_seconds: int = 5
    min_samples: int = 10

    def as_dict(self) -> dict[str, Any]:
        return {"sigma": self.sigma, "bucket_seconds": self.bucket_seconds, "min_samples": self.min_samples}


@dataclass
class Bucket:
    packets: int = 0
    allowed: int = 0
    blocked: int = 0
    logins: int = 0
    src: Counter = field(default_factory=Counter)
    dst: Counter = field(default_factory=Counter)
    bytes_by_dst: dict[str, int] = field(default_factory=dict)
    ports_by_src: dict[str, set] = field(default_factory=dict)


class Welford:
    """Running mean / population std without storing samples."""

    __slots__ = ("n", "mean", "m2")

    def __init__(self) -> None:
        self.n, self.mean, self.m2 = 0, 0.0, 0.0

    def update(self, x: float) -> None:
        self.n += 1
        d = x - self.mean
        self.mean += d / self.n
        self.m2 += d * (x - self.mean)

    @property
    def std(self) -> float:
        return math.sqrt(self.m2 / self.n) if self.n > 1 else 0.0


def effective_std(std: Any, mean: Any, abs_floor: float = ABS_FLOOR) -> Any:
    return np.maximum(np.nan_to_num(std), np.maximum(REL_FLOOR * np.abs(np.nan_to_num(mean)), abs_floor))


def score_series(values: list[float], sigma: float, min_samples: int, abs_floor: float = ABS_FLOOR) -> pd.DataFrame:
    """Rolling (expanding over the retained window) z-score of every point against the points before it."""
    s = pd.Series(values, dtype="float64")
    prior = s.shift(1).expanding(min_periods=1)
    mean, std, n = prior.mean(), prior.std(ddof=0), prior.count()
    std_eff = pd.Series(effective_std(std.to_numpy(), mean.to_numpy(), abs_floor), index=s.index)
    valid = n >= min_samples
    z = ((s - mean.fillna(0.0)) / std_eff).where(valid, 0.0)
    return pd.DataFrame(
        {"value": s, "mean": mean.fillna(0.0), "std": std_eff, "z": z, "anomaly": valid & (z > sigma)}
    )


class AnomalyEngine:
    def __init__(self, clock: Clock, config: Optional[AnomalyConfig] = None) -> None:
        self.clock = clock
        self.config = config or AnomalyConfig()
        self.buckets: dict[int, Bucket] = {}
        self._last_alert: dict[str, tuple[float, float]] = {}

    # ------------------------------------------------------------------ ingestion
    def reset(self) -> None:
        self.buckets.clear()
        self._last_alert.clear()

    def _idx(self, ts: float) -> int:
        return int(ts // self.config.bucket_seconds)

    def record(self, ts: float, p: dict[str, Any]) -> None:
        b = self.buckets.setdefault(self._idx(ts), Bucket())
        b.packets += 1
        if p["verdict"] == "blocked":
            b.blocked += 1
        else:
            b.allowed += 1
        if p["type"] == "ssh_login":
            b.logins += 1
        b.src[p["src_ip"]] += 1
        b.dst[p["dst_ip"]] += 1
        b.bytes_by_dst[p["dst_ip"]] = b.bytes_by_dst.get(p["dst_ip"], 0) + int(p["bytes"])
        if p.get("dst_port") is not None:
            b.ports_by_src.setdefault(p["src_ip"], set()).add(p["dst_port"])
        floor = self._idx(self.clock()) - RETAIN_BUCKETS * 2
        if len(self.buckets) > RETAIN_BUCKETS * 3:
            for k in [k for k in self.buckets if k < floor]:
                del self.buckets[k]

    def configure(self, cfg: AnomalyConfig) -> None:
        changed = cfg.bucket_seconds != self.config.bucket_seconds
        self.config = cfg
        if changed:  # old buckets are meaningless at a different resolution
            self.reset()

    # ------------------------------------------------------------------ baseline generator
    def generate_baseline(
        self, minutes: int, rng: Optional[np.random.Generator] = None, src_rates: Optional[Mapping[str, float]] = None
    ) -> int:
        """Fill the buckets before the current one with synthetic, Poisson-noise 'normal' traffic."""
        rng = rng or np.random.default_rng()
        bs = self.config.bucket_seconds
        cur = self._idx(self.clock())
        n = max(1, min(int(minutes * 60 // bs), RETAIN_BUCKETS - 1))
        rates = dict(src_rates or {"10.0.1.10": 0.5, "192.168.1.100": 0.4, "198.51.100.7": 0.6, "203.0.113.50": 0.2})
        for idx in range(cur - n, cur):
            lam = 5.0 * bs
            # Noise is truncated at +-2.5 sd so the synthetic baseline itself never looks anomalous.
            total = int(np.clip(rng.poisson(lam), lam - 2.5 * math.sqrt(lam), lam + 2.5 * math.sqrt(lam)))
            blocked = int(rng.binomial(total, 0.08))
            b = Bucket(packets=total, allowed=total - blocked, blocked=blocked, logins=min(int(rng.poisson(0.1 * bs)), 2))
            for ip, rate in rates.items():
                c = int(rng.poisson(rate * bs))
                if c:
                    b.src[ip] = c
            b.bytes_by_dst = {"baseline": int(np.clip(rng.normal(30000, 8000), 18000, 42000))}
            b.ports_by_src = {"baseline": set(range(1 + min(int(rng.poisson(1.5)), 3)))}
            self.buckets[idx] = b
        return n

    # ------------------------------------------------------------------ series
    def _range(self) -> list[int]:
        cur = self._idx(self.clock())
        past = [k for k in self.buckets if k <= cur]
        start = max(min(past), cur - RETAIN_BUCKETS + 1) if past else cur
        return list(range(start, cur + 1))

    def _values(self, b: Optional[Bucket]) -> dict[str, float]:
        bs = self.config.bucket_seconds
        if b is None or b.packets == 0:
            return {m["key"]: 0.0 for m in METRICS}
        return {
            "packets_per_sec": b.packets / bs,
            "login_attempts_per_min": b.logins * 60.0 / bs,
            "bytes_per_dst": float(max(b.bytes_by_dst.values(), default=0)),
            "distinct_ports_per_src": float(max((len(s) for s in b.ports_by_src.values()), default=0)),
            "blocked_ratio": b.blocked / b.packets,
        }

    def _floor(self, key: str) -> float:
        bs = self.config.bucket_seconds
        return {"packets_per_sec": 1.0 / bs, "login_attempts_per_min": 60.0 / bs, "bytes_per_dst": 500.0,
                "distinct_ports_per_src": 1.0, "blocked_ratio": 0.05}[key]

    def frames(self) -> tuple[list[int], dict[str, pd.DataFrame]]:
        idxs = self._range()
        rows = [self._values(self.buckets.get(i)) for i in idxs]
        df = pd.DataFrame(rows, index=idxs)
        cfg = self.config
        return idxs, {m["key"]: score_series(df[m["key"]].tolist(), cfg.sigma, cfg.min_samples, self._floor(m["key"]))
                      for m in METRICS}

    def metrics(self, window: int = 60) -> dict[str, Any]:
        cfg = self.config
        idxs, frames = self.frames()
        npts = max(1, min(int(math.ceil(window / cfg.bucket_seconds)), len(idxs)))
        out = []
        for m in METRICS:
            f = frames[m["key"]]
            tail = f.tail(npts)
            points = [
                {"ts": iso(i * cfg.bucket_seconds), "value": round(float(r.value), 4), "z": round(float(r.z), 3),
                 "anomaly": bool(r.anomaly)}
                for i, r in zip(idxs[-npts:], tail.itertuples())
            ]
            last = f.iloc[-1]
            out.append({
                "key": m["key"], "label": m["label"], "unit": m["unit"], "points": points,
                "mean": round(float(last["mean"]), 4), "std": round(float(last["std"]), 4),
                "threshold": round(float(last["mean"] + cfg.sigma * last["std"]), 4),
                "latest": round(float(last["value"]), 4),
            })
        return {"sigma": cfg.sigma, "bucket_seconds": cfg.bucket_seconds, "metrics": out}

    def throughput(self, n: int = 60) -> list[dict[str, Any]]:
        bs = self.config.bucket_seconds
        cur = self._idx(self.clock())
        res = []
        for i in range(cur - n + 1, cur + 1):
            b = self.buckets.get(i)
            res.append({"ts": iso(i * bs), "allowed": b.allowed if b else 0, "blocked": b.blocked if b else 0})
        return res

    # ------------------------------------------------------------------ per-source profiles
    def sources(self) -> list[dict[str, Any]]:
        cfg = self.config
        bs = cfg.bucket_seconds
        idxs = self._range()
        cur = idxs[-1]
        ips = {ip for i in idxs for ip in self.buckets.get(i, Bucket()).src}
        # Pooled profile of all sources: used for sources too new to have their own history.
        pool = Welford()
        for i in idxs[:-1]:
            for c in (self.buckets[i].src.values() if i in self.buckets else ()):
                pool.update(c / bs)
        rows = []
        for ip in ips:
            w = Welford()
            for i in idxs[:-1]:
                b = self.buckets.get(i)
                if b and b.src.get(ip):
                    w.update(b.src[ip] / bs)
            own_samples = w.n
            if w.n < cfg.min_samples and pool.n >= cfg.min_samples:
                w = pool
            cb = self.buckets.get(cur)
            count = cb.src.get(ip, 0) if cb else 0
            last = count / bs
            std = float(effective_std(w.std, w.mean, 1.0 / bs))
            valid = w.n >= cfg.min_samples
            z = (last - w.mean) / std if valid else 0.0
            rows.append({
                "ip": ip, "mean_pps": round(w.mean, 4), "std_pps": round(w.std, 4), "last_pps": round(last, 4),
                "z": round(z, 3), "anomalous": bool(valid and z > cfg.sigma and count >= MIN_SRC_PACKETS),
                "samples": own_samples, "_count": count,
            })
        rows.sort(key=lambda r: (not r["anomalous"], -r["z"], -r["last_pps"]))
        for r in rows:
            r.pop("_count")
        return [r for r in rows if r["samples"] > 0 or r["last_pps"] > 0][:50]

    # ------------------------------------------------------------------ detection
    def _cool(self, key: str, now: float, value: float) -> bool:
        """Cooldown per metric/source, bypassed when the new value clearly escalates (> ESCALATION x last alert)."""
        last = self._last_alert.get(key)
        if last is not None and now - last[0] < ALERT_COOLDOWN and value <= ESCALATION * last[1]:
            return False
        self._last_alert[key] = (now, value)
        return True

    def detect(self) -> list[dict[str, Any]]:
        """Evaluate the current bucket; returns alert dicts for metrics / sources that are anomalous."""
        now = self.clock()
        cfg = self.config
        cb = self.buckets.get(self._idx(now))
        if cb is None or cb.packets == 0:
            return []
        top_src = cb.src.most_common(1)[0][0]
        top_dst = cb.dst.most_common(1)[0][0]
        alerts = []
        _, frames = self.frames()
        for m in METRICS:
            last = frames[m["key"]].iloc[-1]
            if not last["anomaly"]:
                continue
            if m["key"] == "blocked_ratio" and cb.packets < MIN_RATIO_PACKETS:
                continue
            if not self._cool(m["rule_id"], now, float(last["value"])):
                continue
            thr = float(last["mean"] + cfg.sigma * last["std"])
            alerts.append(dict(
                ts=now, source="anomaly", severity=m["severity"], rule_id=m["rule_id"],
                title=f"Anomalous {m['label'].lower()}",
                description=(f"{m['label']} = {last['value']:.2f} {m['unit']} is {last['z']:.1f} sigma above the "
                             f"baseline mean {last['mean']:.2f} (threshold {thr:.2f})."),
                src_ip=top_src, dst_ip=top_dst, metric=m["key"], value=round(float(last["value"]), 4),
                threshold=round(thr, 4)))
        bs = cfg.bucket_seconds
        for row in self.sources():
            if row["anomalous"] and self._cool("ANOM-SRC|" + row["ip"], now, row["last_pps"]):
                thr = row["mean_pps"] + cfg.sigma * float(effective_std(row["std_pps"], row["mean_pps"], 1.0 / bs))
                alerts.append(dict(
                    ts=now, source="anomaly", severity="medium", rule_id="ANOM-SRC",
                    title="Anomalous source activity",
                    description=(f"{row['ip']} sent {row['last_pps']:.2f} pkt/s, {row['z']:.1f} sigma above its own "
                                 f"profile (mean {row['mean_pps']:.2f}, std {row['std_pps']:.2f})."),
                    src_ip=row["ip"], dst_ip=top_dst, metric="source_pps", value=row["last_pps"],
                    threshold=round(thr, 4)))
        return alerts
