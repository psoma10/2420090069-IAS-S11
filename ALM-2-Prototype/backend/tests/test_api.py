import json
import threading
import time

import pytest

RULE = dict(name="t", action="allow", protocol="TCP", src_ip="ANY", dst_ip="10.0.1.0/24", src_port="ANY",
            dst_port="8080-8090", priority=5, enabled=True, description="")


def test_health_and_seed(client):
    assert client.get("/api/health").json()["status"] == "ok"
    rules = client.get("/api/firewall/rules").json()
    assert [r["priority"] for r in rules] == sorted(r["priority"] for r in rules)
    assert len(client.get("/api/hosts").json()) == 8
    assert client.get("/api/firewall/policy").json() == {"default_action": "deny", "bastion_mode": False}
    s = client.get("/api/stats/summary").json()
    assert s["packets_total"] > 0 and s["bastion"]["ip"] == "10.0.0.5" and len(s["throughput"]) == 60
    assert len(client.get("/api/ids/rules").json()) == 9
    assert client.get("/api/anomaly/metrics").json()["metrics"][0]["points"]


def test_rule_crud(client):
    r = client.post("/api/firewall/rules", json=RULE)
    assert r.status_code == 201
    rid = r.json()["id"]
    assert r.json()["hit_count"] == 0 and r.json()["created_at"].endswith("Z")
    upd = client.put(f"/api/firewall/rules/{rid}", json={**RULE, "name": "renamed", "dst_port": "ANY"})
    assert upd.json()["name"] == "renamed"
    assert client.patch(f"/api/firewall/rules/{rid}/toggle").json()["enabled"] is False
    assert client.delete(f"/api/firewall/rules/{rid}").json() == {"ok": True}
    assert client.delete(f"/api/firewall/rules/{rid}").status_code == 404


@pytest.mark.parametrize("patch", [
    {"src_ip": "999.1.1.1"}, {"dst_ip": "10.0.0.0/40"}, {"dst_port": "70000"}, {"src_port": "9-3"},
    {"dst_port": "http"}, {"action": "maybe"}, {"protocol": "GRE"}, {"name": ""}, {"priority": -1},
])
def test_rule_validation_422(client, patch):
    r = client.post("/api/firewall/rules", json={**RULE, **patch})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str) and r.json()["detail"]


def test_policy_and_firewall_test(client):
    assert client.put("/api/firewall/policy", json={"default_action": "bogus", "bastion_mode": False}).status_code == 422
    body = dict(src_ip="203.0.113.50", dst_ip="10.0.1.10", dst_port=443, protocol="TCP")
    assert client.post("/api/firewall/test", json=body).json()["verdict"] == "allowed"
    client.put("/api/firewall/policy", json={"default_action": "deny", "bastion_mode": True})
    t = client.post("/api/firewall/test", json=body).json()
    assert t["verdict"] == "blocked" and t["reason"] == "Bastion policy"
    assert client.post("/api/firewall/test", json={**body, "dst_ip": "nope"}).status_code == 422
    assert client.get("/api/firewall/stats").json()["total_rules"] == 9


def test_hit_counts_increase(client):
    client.post("/api/traffic/send", json=dict(type="https", src_ip="198.51.100.7", dst_ip="10.0.1.10", count=3))
    hits = {h["name"]: h["hits"] for h in client.get("/api/firewall/stats").json()["hits_by_rule"]}
    assert hits["Allow HTTPS to web tier"] >= 3


def test_hosts_and_bastion(client):
    hosts = client.get("/api/hosts").json()
    web = next(h for h in hosts if h["name"] == "web-01")
    assert client.post("/api/hosts", json={"name": "x", "ip": "300.0.0.1", "role": "web"}).status_code == 422
    assert client.post("/api/hosts", json={"name": "x", "ip": "1.1.1.1", "role": "alien"}).status_code == 422
    assert client.post("/api/hosts", json={"name": "x", "ip": web["ip"], "role": "web"}).status_code == 409
    new = client.post("/api/hosts", json={"name": "new", "ip": "10.9.9.9", "role": "workstation"})
    assert new.status_code == 201
    b = client.post(f"/api/hosts/{web['id']}/bastion").json()
    assert b["is_bastion"] and b["role"] == "bastion"
    assert sum(h["is_bastion"] for h in client.get("/api/hosts").json()) == 1
    assert client.delete("/api/hosts/bastion").json() == {"ok": True}
    assert not any(h["is_bastion"] for h in client.get("/api/hosts").json())
    assert client.put(f"/api/hosts/{new.json()['id']}", json={"name": "n2", "ip": "10.9.9.9", "role": "web"}).json()["name"] == "n2"
    assert client.delete(f"/api/hosts/{new.json()['id']}").json() == {"ok": True}
    assert client.delete("/api/hosts/9999").status_code == 404


def test_traffic_send_validation(client):
    base = dict(type="http", src_ip="1.2.3.4", dst_ip="10.0.1.10")
    assert client.post("/api/traffic/send", json={**base, "count": 501}).status_code == 422
    assert client.post("/api/traffic/send", json={**base, "count": 0}).status_code == 422
    assert client.post("/api/traffic/send", json={**base, "type": "carrier_pigeon"}).status_code == 422
    assert client.post("/api/traffic/send", json={**base, "dst_port": 99999}).status_code == 422
    assert client.post("/api/traffic/send", json={**base, "src_ip": "x"}).status_code == 422
    r = client.post("/api/traffic/send", json={**base, "count": 4}).json()
    assert r["summary"] == {"total": 4, "allowed": 4, "blocked": 0, "alerts": 0}
    p = r["packets"][0]
    assert p["verdict"] == "allowed" and p["dst_port"] == 80 and p["matched_rule_name"]
    ping = client.post("/api/traffic/send", json=dict(type="ping", src_ip="10.0.0.5", dst_ip="10.0.1.10")).json()
    assert ping["packets"][0]["protocol"] == "ICMP" and ping["packets"][0]["dst_port"] is None


def test_port_scan_send_counts_distinct_ports(client):
    r = client.post("/api/traffic/send", json=dict(type="port_scan", src_ip="203.0.113.50", dst_ip="10.0.1.10", count=15)).json()
    assert len({p["dst_port"] for p in r["packets"]}) == 15


def test_scenarios(client):
    assert {s["name"] for s in client.get("/api/traffic/scenarios").json()} == {
        "normal", "brute_force", "port_scan", "ddos", "exfiltration", "telnet_probe", "bastion_bypass"}
    assert client.post("/api/traffic/scenario/nope").status_code == 404


def alerts_for(client, name, clock):
    clock.advance(120)  # clear IDS / anomaly cooldowns between scenarios
    r = client.post(f"/api/traffic/scenario/{name}").json()
    return {a["rule_id"] for p in r["packets"] for a in p["alerts"]}, r


@pytest.mark.parametrize("name,expected", [
    ("brute_force", {"IDS-001", "ANOM-LOGIN"}),
    ("port_scan", {"IDS-003", "IDS-006", "IDS-008", "IDS-009"}),
    ("ddos", {"IDS-004", "IDS-007", "ANOM-PPS"}),
    ("exfiltration", {"IDS-005", "ANOM-BYTES"}),
    ("telnet_probe", {"IDS-002", "IDS-008", "FW-BLOCK"}),
    ("bastion_bypass", {"IDS-008", "IDS-009"}),
])
def test_scenario_alerts(client, clock, name, expected):
    got, r = alerts_for(client, name, clock)
    assert expected <= got, f"missing {expected - got}; got {got}"
    assert r["summary"]["alerts"] >= len(expected)


def test_normal_scenario_is_quiet_after_baseline(client, clock):
    clock.advance(120)
    client.post("/api/anomaly/baseline", json={"minutes": 5})
    got, r = alerts_for(client, "normal", clock)
    assert got == set(), got
    assert r["summary"]["total"] > 5


def test_demo_flow_reset_baseline_ddos(client, clock):
    assert client.post("/api/simulation/reset", json={"keep_rules": True}).json() == {"ok": True}
    assert client.get("/api/alerts").json() == []
    assert client.get("/api/traffic/packets").json() == []
    assert client.get("/api/firewall/rules").json()  # kept
    # without baseline, no anomaly
    r = client.post("/api/anomaly/baseline", json={"minutes": 5}).json()
    assert r["ok"] and r["buckets"] == 60
    client.post("/api/traffic/scenario/ddos")
    anomalies = client.get("/api/alerts", params={"source": "anomaly"}).json()
    assert any(a["rule_id"] == "ANOM-PPS" for a in anomalies)
    m = {x["key"]: x for x in client.get("/api/anomaly/metrics", params={"window": 120}).json()["metrics"]}
    assert m["packets_per_sec"]["points"][-1]["anomaly"]
    assert client.get("/api/anomaly/sources").json()[0]["anomalous"]
    s = client.get("/api/ids/summary").json()
    assert s["total"] == sum(s["by_severity"].values()) and len(s["last_hour_series"]) == 60
    assert s["by_source"]["anomaly"] >= 1


def test_reset_without_keep_rules_then_seed(client):
    client.post("/api/simulation/reset", json={"keep_rules": False})
    assert client.get("/api/firewall/rules").json() == [] and client.get("/api/hosts").json() == []
    client.post("/api/simulation/seed")
    assert len(client.get("/api/firewall/rules").json()) == 9


def test_alerts_ack_filter_clear(client):
    client.post("/api/traffic/scenario/telnet_probe")
    al = client.get("/api/alerts", params={"limit": 5}).json()
    assert al and al == sorted(al, key=lambda a: -a["id"])
    a = client.post(f"/api/alerts/{al[0]['id']}/ack").json()
    assert a["acknowledged"] is True
    assert all(x["acknowledged"] for x in client.get("/api/alerts", params={"acknowledged": "true"}).json())
    assert client.get("/api/alerts", params={"severity": "bogus"}).status_code == 422
    assert client.post("/api/alerts/99999/ack").status_code == 404
    assert client.delete("/api/alerts").json() == {"ok": True}
    assert client.get("/api/alerts").json() == []


def test_packets_filters_and_embedded_alerts(client, clock):
    clock.advance(120)
    client.post("/api/traffic/scenario/telnet_probe")
    blocked = client.get("/api/traffic/packets", params={"verdict": "blocked", "limit": 10}).json()
    assert blocked and all(p["verdict"] == "blocked" for p in blocked)
    assert any(p["alerts"] for p in client.get("/api/traffic/packets", params={"limit": 20}).json())
    only = client.get("/api/traffic/packets", params={"src_ip": "203.0.113.52"}).json()
    assert only and all(p["src_ip"] == "203.0.113.52" for p in only)


def test_anomaly_config(client):
    assert client.get("/api/anomaly/config").json() == {"sigma": 3.0, "bucket_seconds": 5, "min_samples": 10}
    assert client.put("/api/anomaly/config", json={"sigma": 9, "bucket_seconds": 5, "min_samples": 10}).status_code == 422
    assert client.put("/api/anomaly/config", json={"sigma": 2.5, "bucket_seconds": 0, "min_samples": 10}).status_code == 422
    r = client.put("/api/anomaly/config", json={"sigma": 2.0, "bucket_seconds": 10, "min_samples": 8}).json()
    assert r["sigma"] == 2.0 and r["bucket_seconds"] == 10
    assert client.get("/api/anomaly/metrics").json()["bucket_seconds"] == 10


def test_ids_rule_update_validation(client):
    assert client.put("/api/ids/rules/IDS-999", json={"enabled": True}).status_code == 404
    assert client.put("/api/ids/rules/IDS-003", json={"enabled": True, "threshold": 0}).status_code == 422
    assert client.put("/api/ids/rules/IDS-003", json={"enabled": True, "severity": "nuclear"}).status_code == 422
    r = client.put("/api/ids/rules/IDS-003", json={"enabled": True, "threshold": 5, "severity": "critical"}).json()
    assert r["threshold"] == 5 and r["severity"] == "critical"


def test_cors_header(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:48732"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:48732"


# ---------------------------------------------------------------- SSE
def test_sse_stream_delivers_to_multiple_clients(client):
    """TestClient buffers whole responses, so each stream uses ?limit=1 and ends after one event."""
    responses: list = [None, None]

    def reader(i):
        responses[i] = client.get("/api/alerts/stream", params={"limit": 1})

    bus = client.app_ctx.bus
    threads = [threading.Thread(target=reader, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    deadline = time.time() + 10
    while bus.subscriber_count < 2 and time.time() < deadline:
        time.sleep(0.05)
    assert bus.subscriber_count == 2
    client.post("/api/traffic/send", json=dict(type="telnet", src_ip="203.0.113.77", dst_ip="10.0.1.10"))
    for t in threads:
        t.join(10)
    for r in responses:
        assert r is not None and r.headers["content-type"].startswith("text/event-stream")
        frames = [ln[5:] for ln in r.text.splitlines() if ln.startswith("data:")]
        assert frames and json.loads(frames[0])["rule_id"] in ("IDS-002", "IDS-008")
    assert bus.subscriber_count == 0


def test_event_stream_keepalive():
    import asyncio

    from app.alert_bus import AlertBus
    from app.routers.alerts import event_stream

    async def go():
        gen = event_stream(AlertBus(), keepalive=0.05, poll=0.01, limit=1)
        got = [await gen.__anext__() for _ in range(2)]
        await gen.aclose()
        return got

    got = asyncio.run(go())
    assert got[0].startswith(": connected") and got[1].startswith(": keepalive")
