from conftest import pkt


def run(ctx, specs, ts=None):
    return [a for p in ctx.sim.process(specs, ts=ts, evaluate_anomaly=False) for a in p["alerts"]]


def ids(alerts):
    return [a["rule_id"] for a in alerts]


def login(**kw):
    return pkt(dst="10.0.0.5", dport=22, type_="ssh_login", success=False, **kw)


def test_ids001_ssh_bruteforce(ctx):
    assert "IDS-001" not in ids(run(ctx, [login()] * 4))
    a = run(ctx, [login()])
    assert ids(a).count("IDS-001") == 1
    assert [x for x in a if x["rule_id"] == "IDS-001"][0]["severity"] == "high"


def test_ids001_successful_logins_ignored(ctx):
    a = run(ctx, [pkt(dst="10.0.0.5", dport=22, type_="ssh_login", success=True)] * 10)
    assert "IDS-001" not in ids(a)


def test_ids002_telnet(ctx):
    assert "IDS-002" in ids(run(ctx, [pkt(dport=23, type_="telnet")]))


def test_ids003_portscan(ctx):
    a = run(ctx, [pkt(dport=p, type_="port_scan", success=False) for p in range(1000, 1010)])
    assert ids(a).count("IDS-003") == 1


def test_ids003_below_threshold(ctx):
    a = run(ctx, [pkt(dport=p, type_="port_scan") for p in range(1000, 1009)])
    assert "IDS-003" not in ids(a)


def test_ids004_syn_flood_single_alert(ctx):
    a = run(ctx, [pkt(type_="syn_flood", nbytes=60)] * 120)
    assert ids(a).count("IDS-004") == 1
    assert [x for x in a if x["rule_id"] == "IDS-004"][0]["severity"] == "critical"


def test_ids005_exfil(ctx):
    big = 11 * 1024 * 1024
    a = run(ctx, [pkt(src="10.0.2.20", dst="203.0.113.50", dport=443, type_="data_transfer", nbytes=big)])
    assert "IDS-005" in ids(a)
    assert "IDS-005" not in ids(run(ctx, [pkt(src="10.0.2.21", dst="8.8.8.8", dport=443, nbytes=1000)]))
    assert "IDS-005" not in ids(run(ctx, [pkt(src="10.0.2.22", dst="10.0.1.10", dport=443, nbytes=big * 5)]))


def test_ids006_blocked_storm(ctx):
    a = run(ctx, [pkt(dport=9000 + i) for i in range(20)])  # default deny
    assert "IDS-006" in ids(a)


def test_ids007_icmp_flood(ctx):
    a = run(ctx, [pkt(proto="ICMP", dport=None, type_="ping")] * 50)
    assert "IDS-007" in ids(a)


def test_ids008_bastion_bypass_and_web_exempt(ctx):
    assert "IDS-008" in ids(run(ctx, [pkt(dst="10.0.3.30", dport=22, type_="ssh_login", success=False)]))
    assert "IDS-008" not in ids(run(ctx, [pkt(src="198.51.100.7", dst="10.0.1.10", dport=443)]))
    assert "IDS-008" not in ids(run(ctx, [pkt(src="198.51.100.8", dst="10.0.0.5", dport=22)]))  # the bastion


def test_ids009_sensitive_ports(ctx):
    for i, port in enumerate((3389, 445, 3306, 5432)):
        assert "IDS-009" in ids(run(ctx, [pkt(src=f"203.0.113.{60 + i}", dst="10.0.2.20", dport=port)]))
    assert "IDS-009" not in ids(run(ctx, [pkt(src="10.0.1.10", dst="10.0.2.20", dport=3306)]))


def test_cooldown_then_refire(ctx, clock):
    t = clock()
    assert "IDS-002" in ids(run(ctx, [pkt(dport=23, type_="telnet")], ts=t))
    assert "IDS-002" not in ids(run(ctx, [pkt(dport=23, type_="telnet")], ts=t + 30))
    assert "IDS-002" in ids(run(ctx, [pkt(dport=23, type_="telnet")], ts=t + 61))
    # another source is independent
    assert "IDS-002" in ids(run(ctx, [pkt(src="203.0.113.99", dport=23, type_="telnet")], ts=t + 62))


def test_window_expiry(ctx, clock):
    t = clock()
    run(ctx, [pkt(dport=p, type_="port_scan") for p in range(1000, 1009)], ts=t)
    assert "IDS-003" not in ids(run(ctx, [pkt(dport=2000, type_="port_scan")], ts=t + 31))


def test_disabled_rule_does_not_fire(client):
    r = client.put("/api/ids/rules/IDS-002", json={"enabled": False})
    assert r.status_code == 200 and r.json()["enabled"] is False
    assert "IDS-002" not in ids(run(client.app_ctx, [pkt(dport=23, type_="telnet")]))


def test_threshold_update_changes_behaviour(client):
    client.put("/api/ids/rules/IDS-001", json={"enabled": True, "threshold": 2})
    a = run(client.app_ctx, [login()] * 2)
    assert "IDS-001" in ids(a)


def test_fw_block_alert_only_for_notable(ctx):
    a = run(ctx, [pkt(src="192.168.1.100", dport=80)])
    assert ids(a) == ["FW-BLOCK"] and a[0]["source"] == "firewall" and a[0]["severity"] == "low"
    assert "FW-BLOCK" not in ids(run(ctx, [pkt(dport=8081)]))  # plain default deny: no alert
