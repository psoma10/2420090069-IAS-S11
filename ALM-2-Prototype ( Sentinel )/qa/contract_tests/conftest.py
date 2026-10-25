import os
import httpx
import pytest

BASE_URL = os.environ.get("BASE_URL", "http://localhost:48731").rstrip("/")

SEVERITIES = {"low", "medium", "high", "critical"}
SOURCES = {"rule", "anomaly", "firewall"}
PROTOCOLS = {"TCP", "UDP", "ICMP", "ANY"}
TRAFFIC_TYPES = ["http", "https", "ssh_login", "telnet", "port_scan", "ping", "dns", "data_transfer", "syn_flood"]
ROLES = {"bastion", "web", "database", "ssh", "workstation", "external"}

# well known seed hosts
BASTION = "10.0.0.5"
WEB = "10.0.1.10"
DB = "10.0.2.20"
WS = "192.168.1.100"
ATTACKER = "203.0.113.50"
PARTNER = "198.51.100.7"


@pytest.fixture(scope="session")
def client():
    with httpx.Client(base_url=BASE_URL + "/api", timeout=30.0) as c:
        try:
            c.get("/health")
        except httpx.HTTPError as e:
            pytest.exit(f"Backend not reachable at {BASE_URL}: {e}", returncode=2)
        yield c


@pytest.fixture(autouse=True)
def clean(client):
    """Reset sim state (keep rules) and restore default policy before each test."""
    client.post("/simulation/reset", json={"keep_rules": True})
    client.put("/firewall/policy", json={"default_action": "deny", "bastion_mode": False})
    for a in IDS_DEFAULTS_RESTORE(client):
        pass
    yield


def IDS_DEFAULTS_RESTORE(client):
    # make sure all ids rules enabled (tests may toggle)
    r = client.get("/ids/rules")
    if r.status_code == 200:
        for rule in r.json():
            if not rule.get("enabled"):
                client.put(f"/ids/rules/{rule['id']}", json={"enabled": True})
    return []


# ---------- helpers ----------
def assert_keys(obj, keys, exact=False):
    missing = set(keys) - set(obj)
    assert not missing, f"missing keys {missing} in {obj}"
    if exact:
        extra = set(obj) - set(keys)
        assert not extra, f"unexpected keys {extra}"


def is_iso(ts):
    from datetime import datetime
    assert isinstance(ts, str), ts
    datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return True


RULE_KEYS = ["id", "name", "action", "protocol", "src_ip", "dst_ip", "src_port", "dst_port",
             "priority", "enabled", "description", "hit_count", "created_at"]
HOST_KEYS = ["id", "name", "ip", "role", "is_bastion", "description"]
PACKET_KEYS = ["id", "ts", "src_ip", "dst_ip", "src_port", "dst_port", "protocol", "type", "bytes",
               "success", "verdict", "matched_rule_id", "matched_rule_name", "reason", "alerts"]
ALERT_KEYS = ["id", "ts", "source", "severity", "rule_id", "title", "description", "src_ip", "dst_ip",
              "metric", "value", "threshold", "acknowledged"]
IDS_KEYS = ["id", "name", "description", "severity", "enabled", "window_seconds", "threshold", "category"]


def check_rule(r):
    assert_keys(r, RULE_KEYS)
    assert r["action"] in ("allow", "deny")
    assert r["protocol"] in PROTOCOLS
    assert isinstance(r["priority"], int)
    assert isinstance(r["enabled"], bool)
    assert isinstance(r["hit_count"], int)
    assert isinstance(r["name"], str)
    assert isinstance(r["src_port"], str) and isinstance(r["dst_port"], str)
    assert isinstance(r["src_ip"], str) and isinstance(r["dst_ip"], str)
    is_iso(r["created_at"])


def check_host(h):
    assert_keys(h, HOST_KEYS)
    assert h["role"] in ROLES
    assert isinstance(h["is_bastion"], bool)


def check_alert(a):
    assert_keys(a, ALERT_KEYS)
    assert a["source"] in SOURCES
    assert a["severity"] in SEVERITIES
    assert isinstance(a["rule_id"], str)
    assert isinstance(a["acknowledged"], bool)
    assert a["metric"] is None or isinstance(a["metric"], str)
    for k in ("value", "threshold"):
        assert a[k] is None or isinstance(a[k], (int, float))
    is_iso(a["ts"])


def check_packet(p):
    assert_keys(p, PACKET_KEYS)
    assert p["verdict"] in ("allowed", "blocked")
    assert p["protocol"] in ("TCP", "UDP", "ICMP")
    assert p["type"] in TRAFFIC_TYPES
    assert isinstance(p["bytes"], int)
    assert isinstance(p["success"], bool)
    assert p["matched_rule_id"] is None or isinstance(p["matched_rule_id"], int)
    assert p["matched_rule_name"] is None or isinstance(p["matched_rule_name"], str)
    assert isinstance(p["reason"], str)
    assert isinstance(p["alerts"], list)
    for a in p["alerts"]:
        check_alert(a)
    is_iso(p["ts"])


def check_send_response(j):
    assert_keys(j, ["packets", "summary"])
    assert_keys(j["summary"], ["total", "allowed", "blocked", "alerts"])
    assert j["summary"]["total"] == len(j["packets"])
    assert j["summary"]["allowed"] + j["summary"]["blocked"] == j["summary"]["total"]
    for p in j["packets"]:
        check_packet(p)


def send(client, **body):
    r = client.post("/traffic/send", json=body)
    assert r.status_code in (200, 201), r.text
    j = r.json()
    check_send_response(j)
    return j


def scenario(client, name):
    r = client.post(f"/traffic/scenario/{name}")
    assert r.status_code in (200, 201), r.text
    j = r.json()
    check_send_response(j)
    return j


def alerts(client, **params):
    params.setdefault("limit", 500)
    r = client.get("/alerts", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def rule_ids(client):
    return {a["rule_id"] for a in alerts(client)}


@pytest.fixture
def new_rule(client):
    created = []

    def make(**over):
        body = {"name": "qa-rule", "action": "allow", "protocol": "TCP", "src_ip": "ANY", "dst_ip": "ANY",
                "src_port": "ANY", "dst_port": "ANY", "priority": 500, "enabled": True, "description": "qa"}
        body.update(over)
        r = client.post("/firewall/rules", json=body)
        assert r.status_code == 201, r.text
        created.append(r.json()["id"])
        return r.json()

    yield make
    for i in created:
        client.delete(f"/firewall/rules/{i}")
