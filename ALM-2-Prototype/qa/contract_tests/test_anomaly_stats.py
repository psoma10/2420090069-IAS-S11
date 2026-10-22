import time

import pytest
from conftest import *

METRIC_KEYS = ["packets_per_sec", "login_attempts_per_min", "bytes_per_dst", "distinct_ports_per_src", "blocked_ratio"]


@pytest.fixture(autouse=True)
def restore_config(client):
    cfg = client.get("/anomaly/config").json()
    yield
    client.put("/anomaly/config", json=cfg)


def metrics(client, window=60):
    r = client.get("/anomaly/metrics", params={"window": window})
    assert r.status_code == 200, r.text
    return r.json()


def test_config_get_put(client):
    c = client.get("/anomaly/config").json()
    assert_keys(c, ["sigma", "bucket_seconds", "min_samples"])
    assert c["sigma"] == 3.0 and c["bucket_seconds"] == 5
    r = client.put("/anomaly/config", json={"sigma": 2.5, "bucket_seconds": 5, "min_samples": 10})
    assert r.status_code == 200
    assert r.json()["sigma"] == 2.5
    assert client.get("/anomaly/config").json()["sigma"] == 2.5


@pytest.mark.parametrize("body", [
    {"sigma": 0.5, "bucket_seconds": 5, "min_samples": 10},
    {"sigma": 7, "bucket_seconds": 5, "min_samples": 10},
    {"sigma": 3, "bucket_seconds": 0, "min_samples": 10},
    {"sigma": 3, "bucket_seconds": 61, "min_samples": 10},
])
def test_config_validation(client, body):
    assert client.put("/anomaly/config", json=body).status_code == 422


def test_metrics_shape(client):
    j = metrics(client)
    assert_keys(j, ["sigma", "bucket_seconds", "metrics"])
    assert {m["key"] for m in j["metrics"]} >= set(METRIC_KEYS)
    for m in j["metrics"]:
        assert_keys(m, ["key", "label", "unit", "points", "mean", "std", "threshold", "latest"])
        assert m["threshold"] == pytest.approx(m["mean"] + j["sigma"] * m["std"], rel=1e-3, abs=1e-3)
        for p in m["points"]:
            assert_keys(p, ["ts", "value", "z", "anomaly"])
            assert isinstance(p["anomaly"], bool)


def test_baseline(client):
    r = client.post("/anomaly/baseline", json={"minutes": 5})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] is True and j["buckets"] >= 10
    m = {x["key"]: x for x in metrics(client)["metrics"]}
    assert len(m["packets_per_sec"]["points"]) >= 10
    assert m["packets_per_sec"]["mean"] > 0
    assert not any(p["anomaly"] for p in m["packets_per_sec"]["points"])


def test_baseline_default_body(client):
    assert client.post("/anomaly/baseline", json={}).status_code == 200


def test_anomaly_flow_ddos(client):
    client.post("/simulation/reset", json={"keep_rules": True})
    assert client.post("/anomaly/baseline", json={"minutes": 5}).json()["ok"] is True
    scenario(client, "ddos")
    ms = None
    deadline = time.time() + 12
    while time.time() < deadline:
        ms = {m["key"]: m for m in metrics(client)["metrics"]}
        if any(p["anomaly"] for p in ms["packets_per_sec"]["points"]):
            break
        time.sleep(1)
    pps = ms["packets_per_sec"]
    assert any(p["anomaly"] for p in pps["points"]), "no anomalous packets_per_sec bucket after ddos"
    assert pps["latest"] is not None
    anom = [a for a in alerts(client) if a["rule_id"].startswith("ANOM-")]
    assert anom, f"no ANOM-* alert, got {rule_ids(client)}"
    for a in anom:
        check_alert(a)
        assert a["source"] == "anomaly"
    assert any(a["rule_id"] == "ANOM-PPS" for a in anom) or anom


def test_anomaly_sources(client):
    client.post("/anomaly/baseline", json={"minutes": 5})
    scenario(client, "ddos")
    r = client.get("/anomaly/sources")
    assert r.status_code == 200
    ss = r.json()
    assert isinstance(ss, list) and ss
    for s in ss:
        assert_keys(s, ["ip", "mean_pps", "std_pps", "last_pps", "z", "anomalous", "samples"])
        assert isinstance(s["anomalous"], bool)


# ---- stats ----
def test_stats_summary(client):
    scenario(client, "normal")
    scenario(client, "telnet_probe")
    s = client.get("/stats/summary").json()
    assert_keys(s, ["packets_total", "allowed", "blocked", "alerts_total", "alerts_unacked", "rules_total",
                    "hosts_total", "bastion", "by_protocol", "by_type", "top_sources", "throughput"])
    assert s["packets_total"] == s["allowed"] + s["blocked"] > 0
    assert s["alerts_total"] == len(alerts(client))
    assert s["alerts_unacked"] <= s["alerts_total"]
    assert s["rules_total"] == len(client.get("/firewall/rules").json())
    assert s["hosts_total"] == len(client.get("/hosts").json())
    assert s["bastion"] is None or "ip" in s["bastion"]
    assert set(s["by_protocol"]) >= {"TCP", "UDP", "ICMP"}
    assert sum(s["by_protocol"].values()) == s["packets_total"]
    assert sum(s["by_type"].values()) == s["packets_total"]
    assert len(s["throughput"]) <= 60
    for t in s["throughput"]:
        assert_keys(t, ["ts", "allowed", "blocked"])
    for t in s["top_sources"]:
        assert_keys(t, ["ip", "count"])
