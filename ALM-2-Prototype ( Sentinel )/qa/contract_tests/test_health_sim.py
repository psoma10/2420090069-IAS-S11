from conftest import *


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert "version" in j
    assert isinstance(j["uptime_seconds"], (int, float))


def test_reset_clears_packets_alerts_keeps_rules(client):
    send(client, type="telnet", src_ip=ATTACKER, dst_ip=WEB)
    assert alerts(client)
    n_rules = len(client.get("/firewall/rules").json())
    r = client.post("/simulation/reset", json={"keep_rules": True})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert alerts(client) == []
    assert client.get("/traffic/packets").json() == []
    assert len(client.get("/firewall/rules").json()) == n_rules
    s = client.get("/stats/summary").json()
    assert s["packets_total"] == 0 and s["alerts_total"] == 0


def test_reset_default_body(client):
    r = client.post("/simulation/reset", json={})
    assert r.status_code == 200 and r.json()["ok"] is True


def test_seed(client):
    r = client.post("/simulation/seed")
    assert r.status_code in (200, 201)
    assert r.json().get("ok") is True
    assert len(client.get("/hosts").json()) >= 8
    assert len(client.get("/firewall/rules").json()) >= 7
    client.post("/simulation/reset", json={"keep_rules": True})


def test_seed_data_present(client):
    hosts = {h["ip"]: h for h in client.get("/hosts").json()}
    for ip in (BASTION, WEB, "10.0.1.11", DB, WS, ATTACKER, PARTNER):
        assert ip in hosts, f"seed host {ip} missing"
    assert hosts[BASTION]["is_bastion"] is True and hosts[BASTION]["role"] == "bastion"
    assert hosts[ATTACKER]["role"] == "external"
    pol = client.get("/firewall/policy").json()
    assert pol == {"default_action": "deny", "bastion_mode": False}
