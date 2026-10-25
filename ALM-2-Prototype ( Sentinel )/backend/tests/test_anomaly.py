import numpy as np

from app.anomaly import AnomalyConfig, AnomalyEngine, Welford, score_series
from conftest import pkt


def engine(clock):
    e = AnomalyEngine(clock, AnomalyConfig())
    e.generate_baseline(5, np.random.default_rng(1), {"10.0.1.10": 0.5, "203.0.113.50": 0.2})
    return e


def feed(e, clock, n, **kw):
    for _ in range(n):
        e.record(clock(), {**pkt(**kw), "verdict": "allowed"})


def test_score_series_formula():
    vals = [10.0, 12.0, 11.0, 9.0, 10.0, 11.0, 10.0, 12.0, 9.0, 10.0, 11.0, 100.0]
    df = score_series(vals, 3.0, 10)
    base = np.array(vals[:-1])
    std = max(base.std(), 0.1 * base.mean(), 0.05)  # documented floor
    expected = (100 - base.mean()) / std
    assert abs(df.z.iloc[-1] - expected) < 1e-9
    assert df.anomaly.iloc[-1] and not df.anomaly.iloc[:-1].any()


def test_flat_baseline_does_not_explode():
    df = score_series([5.0] * 13, 3.0, 10)
    assert not df.anomaly.any() and np.isfinite(df.z).all()


def test_insufficient_samples_never_anomalous():
    assert not score_series([1.0, 1.0, 500.0], 3.0, 10).anomaly.any()


def test_welford_matches_numpy():
    xs = [1.0, 4.0, 2.5, 8.0, 3.3]
    w = Welford()
    for x in xs:
        w.update(x)
    assert abs(w.mean - np.mean(xs)) < 1e-12 and abs(w.std - np.std(xs)) < 1e-12


def test_spike_triggers_alerts(clock):
    e = engine(clock)
    feed(e, clock, 150, src="203.0.113.50", type_="syn_flood", nbytes=60)
    keys = {a["rule_id"] for a in e.detect()}
    assert "ANOM-PPS" in keys and "ANOM-SRC" in keys
    m = {x["key"]: x for x in e.metrics()["metrics"]}
    assert m["packets_per_sec"]["points"][-1]["anomaly"] is True
    assert m["packets_per_sec"]["threshold"] < m["packets_per_sec"]["latest"]


def test_baseline_noise_is_quiet(clock):
    e = engine(clock)
    feed(e, clock, 5, src="10.0.1.10")
    for ip in ("10.0.5.1", "10.0.5.2", "10.0.5.3"):  # sources with no profile yet
        feed(e, clock, 4, src=ip)
    assert e.detect() == []
    assert not any(p["anomaly"] for m in e.metrics(600)["metrics"] for p in m["points"])


def test_alert_cooldown(clock):
    e = engine(clock)
    feed(e, clock, 150)
    assert e.detect()
    assert e.detect() == []
    clock.advance(31)
    feed(e, clock, 150)
    assert e.detect()


def test_no_baseline_no_alerts(clock):
    e = AnomalyEngine(clock)
    feed(e, clock, 300)
    assert e.detect() == []


def test_bucket_change_resets(clock):
    e = engine(clock)
    e.configure(AnomalyConfig(bucket_seconds=10))
    assert e.buckets == {}


def test_sources_profile(clock):
    e = engine(clock)
    feed(e, clock, 40, src="203.0.113.50")
    row = next(s for s in e.sources() if s["ip"] == "203.0.113.50")
    assert row["anomalous"] and row["samples"] >= 10 and row["z"] > 3
