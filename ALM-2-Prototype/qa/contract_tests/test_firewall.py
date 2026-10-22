import pytest
from conftest import *

U_SRC = "172.31.9.9"
U_DST = "172.31.9.10"

BASE = {"name": "bad", "action": "allow", "protocol": "TCP", "src_ip": "ANY", "dst_ip": "ANY",
        "src_port": "ANY", "dst_port": "80", "priority": 10, "enabled": True, "description": ""}


def fw_test(client, **kw):
    body = {"src_ip": U_SRC, "dst_ip": U_DST, "src_port": 40000, "dst_port": 9999, "protocol": "TCP"}
    body.update(kw)
    r = client.post("/firewall/test", json=body)
    assert r.status_code == 200, r.text
    j = r.json()
    assert_keys(j, ["verdict", "matched_rule_id", "matched_rule_name", "reason"])
    assert j["verdict"] in ("allowed", "blocked")
    return j


def test_list_sorted_and_shape(client):
    rules = client.get("/firewall/rules").json()
    assert rules
    for r in rules:
        check_rule(r)
    prios = [r["priority"] for r in rules]
    assert prios == sorted(prios)


def test_crud_lifecycle(client):
    body = {"name": "qa-crud", "action": "deny", "protocol": "UDP", "src_ip": "10.1.0.0/16", "dst_ip": "ANY",
            "src_port": "ANY", "dst_port": "1000-2000", "priority": 77, "enabled": True, "description": "d"}
    r = client.post("/firewall/rules", json=body)
    assert r.status_code == 201, r.text
    created = r.json()
    check_rule(created)
    assert created["hit_count"] == 0
    for k, v in body.items():
        assert created[k] == v
    rid = created["id"]
    assert any(x["id"] == rid for x in client.get("/firewall/rules").json())

    upd = dict(body, name="qa-crud2", action="allow", dst_port="443", protocol="TCP")
    r = client.put(f"/firewall/rules/{rid}", json=upd)
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "qa-crud2" and r.json()["action"] == "allow" and r.json()["id"] == rid

    r = client.patch(f"/firewall/rules/{rid}/toggle")
    assert r.status_code == 200 and r.json()["enabled"] is False
    r = client.patch(f"/firewall/rules/{rid}/toggle")
    assert r.json()["enabled"] is True

    r = client.delete(f"/firewall/rules/{rid}")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert not any(x["id"] == rid for x in client.get("/firewall/rules").json())


def test_missing_rule_404(client):
    assert client.delete("/firewall/rules/999999").status_code == 404
    assert client.patch("/firewall/rules/999999/toggle").status_code == 404
    assert client.put("/firewall/rules/999999", json=BASE).status_code == 404


@pytest.mark.parametrize("field,value", [
    ("src_ip", "999.1.1.1"), ("dst_ip", "not-an-ip"), ("src_ip", "10.0.0.0/33"), ("dst_ip", "10.0.0.0/abc"),
    ("dst_port", "70000"), ("dst_port", "abc"), ("dst_port", "2000-1000"), ("src_port", "0-99999"),
    ("action", "maybe"), ("protocol", "SCTP"), ("dst_port", "-5"),
])
def test_create_validation_422(client, field, value):
    r = client.post("/firewall/rules", json=dict(BASE, **{field: value}))
    if r.status_code == 201:
        client.delete(f"/firewall/rules/{r.json()['id']}")
    assert r.status_code == 422, f"{field}={value!r} -> {r.status_code} {r.text}"


def test_update_validation_422(client, new_rule):
    rule = new_rule()
    body = {k: rule[k] for k in BASE}
    body["dst_ip"] = "300.0.0.1"
    assert client.put(f"/firewall/rules/{rule['id']}", json=body).status_code == 422


@pytest.mark.parametrize("ip", ["ANY", "10.0.0.1", "10.0.0.0/8", "192.168.1.0/24"])
def test_valid_ip_forms(client, new_rule, ip):
    assert new_rule(src_ip=ip)["src_ip"] == ip


@pytest.mark.parametrize("port", ["ANY", "80", "1000-2000", "65535"])
def test_valid_port_forms(client, new_rule, port):
    assert new_rule(dst_port=port)["dst_port"] == port


def test_test_endpoint_validation(client):
    for bad in ({"src_ip": "1.2.3.999"}, {"dst_ip": "x"}, {"dst_port": 70000}, {"protocol": "FOO"}):
        body = {"src_ip": U_SRC, "dst_ip": U_DST, "src_port": 1, "dst_port": 80, "protocol": "TCP"}
        body.update(bad)
        assert client.post("/firewall/test", json=body).status_code == 422, bad


def test_test_endpoint_src_port_optional(client):
    r = client.post("/firewall/test", json={"src_ip": U_SRC, "dst_ip": U_DST, "dst_port": 80, "protocol": "TCP"})
    assert r.status_code == 200


def test_default_policy_applies(client):
    j = fw_test(client)
    assert j["verdict"] == "blocked" and j["matched_rule_id"] is None
    client.put("/firewall/policy", json={"default_action": "allow", "bastion_mode": False})
    j = fw_test(client)
    assert j["verdict"] == "allowed" and j["matched_rule_id"] is None


def test_priority_first_match_wins(client, new_rule):
    allow = new_rule(name="qa-allow", action="allow", dst_ip=U_DST, priority=2)
    deny = new_rule(name="qa-deny", action="deny", dst_ip=U_DST, priority=1)
    j = fw_test(client)
    assert j["verdict"] == "blocked" and j["matched_rule_id"] == deny["id"]
    assert j["matched_rule_name"] == "qa-deny"
    body = {k: deny[k] for k in BASE}
    body["priority"] = 3
    assert client.put(f"/firewall/rules/{deny['id']}", json=body).status_code == 200
    j = fw_test(client)
    assert j["verdict"] == "allowed" and j["matched_rule_id"] == allow["id"]


def test_disabled_rule_skipped(client, new_rule):
    r = new_rule(action="allow", dst_ip=U_DST, priority=1)
    assert fw_test(client)["verdict"] == "allowed"
    client.patch(f"/firewall/rules/{r['id']}/toggle")
    assert fw_test(client)["verdict"] == "blocked"


def test_cidr_port_range_protocol_match(client, new_rule):
    r = new_rule(action="allow", protocol="UDP", src_ip="172.31.0.0/16", dst_port="9000-9999", priority=1)
    assert fw_test(client, protocol="UDP", dst_port=9999)["matched_rule_id"] == r["id"]
    assert fw_test(client, protocol="UDP", dst_port=9000)["matched_rule_id"] == r["id"]
    assert fw_test(client, protocol="UDP", dst_port=10000)["matched_rule_id"] is None
    assert fw_test(client, protocol="TCP", dst_port=9999)["matched_rule_id"] is None
    assert fw_test(client, protocol="UDP", src_ip="172.30.0.1", dst_port=9999)["matched_rule_id"] is None


def test_protocol_any_matches(client, new_rule):
    r = new_rule(action="allow", protocol="ANY", dst_ip=U_DST, priority=1)
    assert fw_test(client, protocol="ICMP", dst_port=1)["matched_rule_id"] == r["id"]
    assert fw_test(client, protocol="UDP")["matched_rule_id"] == r["id"]


def test_test_is_dry_run(client, new_rule):
    new_rule(action="allow", dst_ip=U_DST, priority=1)
    before = {x["id"]: x["hit_count"] for x in client.get("/firewall/rules").json()}
    st0 = client.get("/firewall/stats").json()
    for _ in range(3):
        fw_test(client)
    after = {x["id"]: x["hit_count"] for x in client.get("/firewall/rules").json()}
    assert before == after
    assert client.get("/traffic/packets").json() == []
    st1 = client.get("/firewall/stats").json()
    assert (st0["allowed"], st0["blocked"]) == (st1["allowed"], st1["blocked"])


def test_hit_count_increments_on_traffic(client, new_rule):
    r = new_rule(action="allow", dst_ip=U_DST, priority=1)
    send(client, type="http", src_ip=U_SRC, dst_ip=U_DST, count=3)
    rules = {x["id"]: x for x in client.get("/firewall/rules").json()}
    assert rules[r["id"]]["hit_count"] == 3


def test_stats_shape(client):
    s = client.get("/firewall/stats").json()
    assert_keys(s, ["total_rules", "enabled_rules", "hits_by_rule", "allowed", "blocked"])
    rules = client.get("/firewall/rules").json()
    assert s["total_rules"] == len(rules)
    assert s["enabled_rules"] == sum(1 for r in rules if r["enabled"])
    for h in s["hits_by_rule"]:
        assert_keys(h, ["id", "name", "hits"])


def test_policy_get_put(client):
    r = client.put("/firewall/policy", json={"default_action": "allow", "bastion_mode": True})
    assert r.status_code == 200
    assert r.json() == {"default_action": "allow", "bastion_mode": True}
    assert client.get("/firewall/policy").json() == {"default_action": "allow", "bastion_mode": True}
    assert client.put("/firewall/policy", json={"default_action": "bogus", "bastion_mode": False}).status_code == 422


def test_bastion_policy(client):
    client.put("/firewall/policy", json={"default_action": "allow", "bastion_mode": False})
    assert fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=8080)["verdict"] == "allowed"
    client.put("/firewall/policy", json={"default_action": "allow", "bastion_mode": True})
    j = fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=8080)
    assert j["verdict"] == "blocked"
    assert "bastion" in j["reason"].lower()
    assert fw_test(client, src_ip=ATTACKER, dst_ip=BASTION, dst_port=22)["verdict"] == "allowed"
    assert fw_test(client, src_ip="10.0.1.11", dst_ip=WEB, dst_port=8080)["verdict"] == "allowed"


def test_bastion_policy_precedes_rules(client, new_rule):
    new_rule(action="allow", src_ip="ANY", dst_ip=WEB, priority=1)
    client.put("/firewall/policy", json={"default_action": "allow", "bastion_mode": True})
    j = fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=8080)
    assert j["verdict"] == "blocked" and "bastion" in j["reason"].lower()


def test_seed_rules_behaviour(client):
    assert fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=80)["verdict"] == "allowed"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=443)["verdict"] == "allowed"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=BASTION, dst_port=22)["verdict"] == "allowed"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=DB, dst_port=22)["verdict"] == "blocked"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=23)["verdict"] == "blocked"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=3389)["verdict"] == "blocked"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=WEB, dst_port=445)["verdict"] == "blocked"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=DB, dst_port=53, protocol="UDP")["verdict"] == "allowed"
    assert fw_test(client, src_ip="10.0.1.11", dst_ip=DB, dst_port=1, protocol="ICMP")["verdict"] == "allowed"
    assert fw_test(client, src_ip=ATTACKER, dst_ip=DB, dst_port=1, protocol="ICMP")["verdict"] == "blocked"
    j = fw_test(client, src_ip=WS, dst_ip=WEB, dst_port=80)
    assert j["verdict"] == "blocked" and "compromised" in (j["matched_rule_name"] or "").lower()
