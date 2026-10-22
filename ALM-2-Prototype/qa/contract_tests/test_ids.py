import threading
import time

import httpx
import pytest
from conftest import *

EXT = ATTACKER
INT = "10.0.1.11"


def of_rule(client, rid, **kw):
    return [a for a in alerts(client, **kw) if a["rule_id"] == rid]


# ---- IDS rules catalog ----
def test_ids_rules_catalog(client):
    rules = client.get("/ids/rules").json()
    byid = {r["id"]: r for r in rules}
    for i in range(1, 10):
        assert f"IDS-00{i}" in byid, f"IDS-00{i} missing"
    for r in rules:
        assert_keys(r, IDS_KEYS)
        assert r["severity"] in SEVERITIES
        assert isinstance(r["enabled"], bool)
        assert r["threshold"] is None or isinstance(r["threshold"], int)
    expected_sev = {"IDS-001": "high", "IDS-002": "medium", "IDS-003": "high", "IDS-004": "critical",
                    "IDS-005": "high", "IDS-006": "medium", "IDS-007": "medium", "IDS-008": "high", "IDS-009": "medium"}
    for k, v in expected_sev.items():
        assert byid[k]["severity"] == v, k
    assert byid["IDS-001"]["threshold"] == 5 and byid["IDS-001"]["window_seconds"] == 60
    assert byid["IDS-003"]["threshold"] == 10 and byid["IDS-003"]["window_seconds"] == 30
    assert byid["IDS-004"]["threshold"] == 100 and byid["IDS-004"]["window_seconds"] == 10
    assert byid["IDS-006"]["threshold"] == 20
    assert byid["IDS-007"]["threshold"] == 50


def test_ids_rule_update(client):
    r = client.put("/ids/rules/IDS-001", json={"enabled": False})
    assert r.status_code == 200, r.text
    assert r.json()["enabled"] is False
    r = client.put("/ids/rules/IDS-001", json={"enabled": True, "threshold": 3, "window_seconds": 30, "severity": "critical"})
    assert r.status_code == 200
    j = r.json()
    assert j["threshold"] == 3 and j["window_seconds"] == 30 and j["severity"] == "critical" and j["enabled"] is True
    persisted = {x["id"]: x for x in client.get("/ids/rules").json()}["IDS-001"]
    assert persisted["threshold"] == 3
    # restore
    client.put("/ids/rules/IDS-001", json={"enabled": True, "threshold": 5, "window_seconds": 60, "severity": "high"})
    assert client.put("/ids/rules/IDS-NOPE", json={"enabled": True}).status_code == 404
    assert client.put("/ids/rules/IDS-001", json={"enabled": True, "severity": "extreme"}).status_code == 422


def test_disabled_rule_does_not_fire(client):
    client.put("/ids/rules/IDS-002", json={"enabled": False})
    try:
        send(client, type="telnet", src_ip=EXT, dst_ip=WEB)
        assert not of_rule(client, "IDS-002")
    finally:
        client.put("/ids/rules/IDS-002", json={"enabled": True})


def test_threshold_change_takes_effect(client):
    client.put("/ids/rules/IDS-001", json={"enabled": True, "threshold": 2})
    try:
        send(client, type="ssh_login", src_ip=EXT, dst_ip=BASTION, count=2)
        assert of_rule(client, "IDS-001")
    finally:
        client.put("/ids/rules/IDS-001", json={"enabled": True, "threshold": 5})


# ---- each rule via /traffic/send ----
def test_ids_001_ssh_brute_force(client):
    send(client, type="ssh_login", src_ip=EXT, dst_ip=BASTION, count=4)
    assert not of_rule(client, "IDS-001"), "fired below threshold"
    send(client, type="ssh_login", src_ip=EXT, dst_ip=BASTION, count=1)
    a = of_rule(client, "IDS-001")
    assert len(a) == 1
    assert a[0]["severity"] == "high" and a[0]["source"] == "rule" and a[0]["src_ip"] == EXT
    check_alert(a[0])


def test_ids_001_successful_logins_dont_count(client):
    send(client, type="ssh_login", src_ip=EXT, dst_ip=BASTION, count=10, success=True)
    assert not of_rule(client, "IDS-001")


def test_ids_002_telnet(client):
    j = send(client, type="telnet", src_ip=EXT, dst_ip=WEB)
    a = of_rule(client, "IDS-002")
    assert len(a) == 1 and a[0]["severity"] == "medium"
    assert [x["rule_id"] for p in j["packets"] for x in p["alerts"]].count("IDS-002") == 1


def test_ids_002_any_packet_to_port_23(client):
    send(client, type="http", src_ip=INT, dst_ip=WEB, dst_port=23)
    assert of_rule(client, "IDS-002")


def test_ids_003_port_scan(client):
    send(client, type="port_scan", src_ip=EXT, dst_ip=WEB, count=9)
    assert not of_rule(client, "IDS-003")
    client.post("/simulation/reset", json={"keep_rules": True})
    send(client, type="port_scan", src_ip=EXT, dst_ip=WEB, count=12)
    a = of_rule(client, "IDS-003")
    assert len(a) == 1 and a[0]["severity"] == "high" and a[0]["src_ip"] == EXT


def test_ids_004_syn_flood(client):
    send(client, type="syn_flood", src_ip=EXT, dst_ip=WEB, count=99)
    assert not of_rule(client, "IDS-004")
    send(client, type="syn_flood", src_ip=EXT, dst_ip=WEB, count=5)
    a = of_rule(client, "IDS-004")
    assert len(a) == 1 and a[0]["severity"] == "critical"


def test_ids_005_exfil(client):
    send(client, type="data_transfer", src_ip=INT, dst_ip=PARTNER, bytes=5 * 1024 * 1024)
    assert not of_rule(client, "IDS-005")
    send(client, type="data_transfer", src_ip=INT, dst_ip=PARTNER, bytes=11 * 1024 * 1024)
    a = of_rule(client, "IDS-005")
    assert len(a) == 1 and a[0]["severity"] == "high"


def test_ids_005_internal_dst_no_alert(client):
    send(client, type="data_transfer", src_ip=INT, dst_ip=DB, bytes=50 * 1024 * 1024)
    assert not of_rule(client, "IDS-005")


def test_ids_006_blocked_storm(client):
    send(client, type="http", src_ip="172.16.5.5", dst_ip=DB, count=19)
    assert not of_rule(client, "IDS-006")
    send(client, type="http", src_ip="172.16.5.5", dst_ip=DB, count=2)
    a = of_rule(client, "IDS-006")
    assert len(a) == 1 and a[0]["severity"] == "medium" and a[0]["src_ip"] == "172.16.5.5"


def test_ids_007_icmp_flood(client):
    send(client, type="ping", src_ip=INT, dst_ip=WEB, count=49)
    assert not of_rule(client, "IDS-007")
    send(client, type="ping", src_ip=INT, dst_ip=WEB, count=2)
    a = of_rule(client, "IDS-007")
    assert len(a) == 1 and a[0]["severity"] == "medium"


def test_ids_008_bastion_bypass(client):
    send(client, type="http", src_ip=EXT, dst_ip=DB)
    a = of_rule(client, "IDS-008")
    assert len(a) == 1 and a[0]["severity"] == "high" and a[0]["dst_ip"] == DB


def test_ids_008_not_for_bastion_target(client):
    send(client, type="ssh_login", src_ip=EXT, dst_ip=BASTION, success=True)
    assert not of_rule(client, "IDS-008")


@pytest.mark.parametrize("port", [3389, 445, 3306, 5432])
def test_ids_009_sensitive_ports(client, port):
    send(client, type="http", src_ip=EXT, dst_ip=WEB, dst_port=port)
    a = of_rule(client, "IDS-009")
    assert len(a) == 1 and a[0]["severity"] == "medium"


def test_ids_009_internal_src_no_alert(client):
    send(client, type="http", src_ip=INT, dst_ip=DB, dst_port=3306)
    assert not of_rule(client, "IDS-009")


# ---- scenarios -> rules ----
@pytest.mark.parametrize("name,rid", [
    ("brute_force", "IDS-001"), ("port_scan", "IDS-003"), ("ddos", "IDS-004"),
    ("exfiltration", "IDS-005"), ("telnet_probe", "IDS-002"), ("bastion_bypass", "IDS-008"),
])
def test_scenario_triggers_rule(client, name, rid):
    scenario(client, name)
    assert rid in rule_ids(client), f"{name} should raise {rid}, got {rule_ids(client)}"


# ---- cooldown ----
def test_cooldown_dedupe(client):
    for _ in range(4):
        send(client, type="ssh_login", src_ip=EXT, dst_ip=BASTION, count=5)
    assert len(of_rule(client, "IDS-001")) == 1


def test_cooldown_is_per_source(client):
    for src in (EXT, PARTNER, "100.64.0.9"):
        send(client, type="ssh_login", src_ip=src, dst_ip=BASTION, count=5)
    a = of_rule(client, "IDS-001")
    assert {x["src_ip"] for x in a} == {EXT, PARTNER, "100.64.0.9"}
    assert len(a) == 3


def test_cooldown_reset_clears(client):
    send(client, type="telnet", src_ip=EXT, dst_ip=WEB)
    assert len(of_rule(client, "IDS-002")) == 1
    client.post("/simulation/reset", json={"keep_rules": True})
    send(client, type="telnet", src_ip=EXT, dst_ip=WEB)
    assert len(of_rule(client, "IDS-002")) == 1


# ---- alerts API ----
def test_alerts_list_filters(client):
    scenario(client, "telnet_probe")
    send(client, type="ssh_login", src_ip=EXT, dst_ip=BASTION, count=5)
    al = alerts(client)
    assert al
    for a in al:
        check_alert(a)
    assert [a["ts"] for a in al] == sorted((a["ts"] for a in al), reverse=True)
    assert len(alerts(client, limit=1)) == 1
    hi = alerts(client, severity="high")
    assert hi and all(a["severity"] == "high" for a in hi)
    assert all(a["source"] == "rule" for a in alerts(client, source="rule"))
    assert all(a["acknowledged"] is False for a in alerts(client, acknowledged="false"))
    assert alerts(client, acknowledged="true") == []


def test_alert_ack(client):
    send(client, type="telnet", src_ip=EXT, dst_ip=WEB)
    a = alerts(client)[0]
    assert a["acknowledged"] is False
    r = client.post(f"/alerts/{a['id']}/ack")
    assert r.status_code == 200
    check_alert(r.json())
    assert r.json()["id"] == a["id"] and r.json()["acknowledged"] is True
    assert any(x["id"] == a["id"] for x in alerts(client, acknowledged="true"))
    assert not any(x["id"] == a["id"] for x in alerts(client, acknowledged="false"))
    assert client.post("/alerts/999999999/ack").status_code == 404


def test_alerts_clear(client):
    send(client, type="telnet", src_ip=EXT, dst_ip=WEB)
    assert alerts(client)
    r = client.delete("/alerts")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert alerts(client) == []


def test_ids_summary(client):
    scenario(client, "telnet_probe")
    scenario(client, "brute_force")
    s = client.get("/ids/summary").json()
    assert_keys(s, ["total", "by_severity", "by_source", "top_sources", "last_hour_series"])
    assert set(s["by_severity"]) >= SEVERITIES and set(s["by_source"]) >= SOURCES
    assert s["total"] == len(alerts(client))
    assert sum(s["by_severity"].values()) == s["total"]
    assert sum(s["by_source"].values()) == s["total"]
    for t in s["top_sources"]:
        assert_keys(t, ["ip", "count"])
    assert s["top_sources"]
    for p in s["last_hour_series"]:
        assert_keys(p, ["ts", "count"])


def test_firewall_source_alert_possible(client):
    # FW-BLOCK / source=firewall alerts are optional per contract; just validate shape if present
    send(client, type="http", src_ip="172.16.5.5", dst_ip=DB, count=3)
    for a in alerts(client, source="firewall"):
        check_alert(a)


# ---- SSE ----
def test_sse_stream_delivers_alert(client):
    from conftest import BASE_URL
    got = []
    err = []

    def trigger():
        time.sleep(1.5)
        try:
            httpx.post(BASE_URL + "/api/traffic/send", json={"type": "telnet", "src_ip": EXT, "dst_ip": WEB}, timeout=10)
        except Exception as e:  # pragma: no cover
            err.append(e)

    t = threading.Thread(target=trigger)
    t.start()
    deadline = time.time() + 15
    try:
        with httpx.stream("GET", BASE_URL + "/api/alerts/stream", timeout=httpx.Timeout(20.0, read=20.0)) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("content-type", "")
            import json
            for line in r.iter_lines():
                if line.startswith("data:"):
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    a = json.loads(payload)
                    got.append(a)
                    if a.get("rule_id") == "IDS-002":
                        break
                if time.time() > deadline:
                    break
    finally:
        t.join()
    assert not err, err
    assert any(a.get("rule_id") == "IDS-002" for a in got), f"no IDS-002 over SSE, got {got}"
    check_alert([a for a in got if a["rule_id"] == "IDS-002"][0])
