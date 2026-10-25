import pytest
from conftest import *

SCENARIOS = ["normal", "brute_force", "port_scan", "ddos", "exfiltration", "telnet_probe", "bastion_bypass"]


@pytest.mark.parametrize("t,proto,port", [
    ("http", "TCP", 80), ("https", "TCP", 443), ("ssh_login", "TCP", 22), ("telnet", "TCP", 23),
    ("ping", "ICMP", None), ("dns", "UDP", 53), ("data_transfer", "TCP", 443), ("syn_flood", "TCP", 80),
])
def test_type_defaults(client, t, proto, port):
    j = send(client, type=t, src_ip="10.0.1.11", dst_ip=WEB)
    assert j["summary"]["total"] == 1
    p = j["packets"][0]
    assert p["type"] == t and p["protocol"] == proto
    if port is not None:
        assert p["dst_port"] == port
    assert p["src_ip"] == "10.0.1.11" and p["dst_ip"] == WEB


def test_ssh_success_default_false(client):
    p = send(client, type="ssh_login", src_ip="10.0.1.11", dst_ip=BASTION)["packets"][0]
    assert p["success"] is False
    p = send(client, type="ssh_login", src_ip="10.0.1.11", dst_ip=BASTION, success=True)["packets"][0]
    assert p["success"] is True


def test_port_scan_distinct_ports(client):
    j = send(client, type="port_scan", src_ip=ATTACKER, dst_ip=WEB, count=15)
    assert j["summary"]["total"] == 15
    ports = {p["dst_port"] for p in j["packets"]}
    assert len(ports) == 15


def test_data_transfer_bytes(client):
    p = send(client, type="data_transfer", src_ip="10.0.1.11", dst_ip=PARTNER, bytes=12345)["packets"][0]
    assert p["bytes"] == 12345


def test_count_bounds(client):
    assert send(client, type="http", src_ip="10.0.1.11", dst_ip=WEB, count=500)["summary"]["total"] == 500
    for c in (0, 501, -1):
        r = client.post("/traffic/send", json={"type": "http", "src_ip": "10.0.1.11", "dst_ip": WEB, "count": c})
        assert r.status_code == 422, c


def test_send_validation(client):
    ok = {"type": "http", "src_ip": "10.0.1.11", "dst_ip": WEB}
    for bad in ({"type": "bogus"}, {"src_ip": "999.0.0.1"}, {"dst_ip": "abc"}, {"dst_port": 70000},
                {"protocol": "XYZ"}, {"bytes": -5}):
        r = client.post("/traffic/send", json=dict(ok, **bad))
        assert r.status_code == 422, (bad, r.status_code, r.text)
    assert client.post("/traffic/send", json={"type": "http"}).status_code == 422


def test_verdict_and_matched_rule(client):
    p = send(client, type="http", src_ip=ATTACKER, dst_ip=WEB)["packets"][0]
    assert p["verdict"] == "allowed" and isinstance(p["matched_rule_id"], int) and p["matched_rule_name"]
    p = send(client, type="http", src_ip=ATTACKER, dst_ip=DB)["packets"][0]
    assert p["verdict"] == "blocked" and p["matched_rule_id"] is None  # default deny
    assert p["reason"]


def test_bastion_mode_blocks_traffic(client):
    client.put("/firewall/policy", json={"default_action": "allow", "bastion_mode": True})
    p = send(client, type="http", src_ip=ATTACKER, dst_ip=WEB)["packets"][0]
    assert p["verdict"] == "blocked" and "bastion" in p["reason"].lower()


def test_packets_listing(client):
    for i in range(5):
        send(client, type="http", src_ip=f"10.0.1.{20 + i}", dst_ip=WEB)
    send(client, type="http", src_ip=ATTACKER, dst_ip=DB)
    ps = client.get("/traffic/packets").json()
    assert len(ps) == 6
    for p in ps:
        check_packet(p)
    assert ps[0]["src_ip"] == ATTACKER  # newest first
    assert [p["ts"] for p in ps] == sorted((p["ts"] for p in ps), reverse=True)
    assert len(client.get("/traffic/packets", params={"limit": 2}).json()) == 2
    bl = client.get("/traffic/packets", params={"verdict": "blocked"}).json()
    assert bl and all(p["verdict"] == "blocked" for p in bl)
    al = client.get("/traffic/packets", params={"verdict": "allowed"}).json()
    assert al and all(p["verdict"] == "allowed" for p in al)
    bs = client.get("/traffic/packets", params={"src_ip": ATTACKER}).json()
    assert len(bs) == 1 and bs[0]["src_ip"] == ATTACKER


def test_scenarios_list(client):
    j = client.get("/traffic/scenarios").json()
    assert {s["name"] for s in j} >= set(SCENARIOS)
    for s in j:
        assert_keys(s, ["name", "title", "description", "type_hint"])


@pytest.mark.parametrize("name", SCENARIOS)
def test_each_scenario(client, name):
    j = scenario(client, name)
    assert j["summary"]["total"] > 0
    assert len(client.get("/traffic/packets", params={"limit": 1000}).json()) >= j["summary"]["total"]


def test_unknown_scenario(client):
    assert client.post("/traffic/scenario/nope").status_code in (404, 422)


def test_normal_scenario_is_benign(client):
    scenario(client, "normal")
    bad = [a for a in alerts(client) if a["severity"] in ("high", "critical")]
    assert not bad, bad


def test_summary_alert_count_matches(client):
    j = send(client, type="telnet", src_ip=ATTACKER, dst_ip=WEB)
    assert j["summary"]["alerts"] == sum(len(p["alerts"]) for p in j["packets"]) >= 1
