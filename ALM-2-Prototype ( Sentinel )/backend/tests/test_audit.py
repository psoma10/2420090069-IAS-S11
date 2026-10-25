import json

from app.audit import ZERO_HASH, AuditLog, describe, digest, summarize_body

RULE = dict(name="Audit test", action="deny", protocol="TCP", src_ip="ANY", dst_ip="ANY", src_port="ANY",
            dst_port="8080", priority=5, enabled=True, description="x" * 500)


def lines(log_dir, name="audit.log"):
    return [json.loads(ln) for ln in (log_dir / name).read_text(encoding="utf-8").splitlines() if ln.strip()]


def test_mutating_request_is_audited_and_body_reaches_route(client, log_dir):
    r = client.post("/api/firewall/rules", json=RULE)
    assert r.status_code == 201 and r.json()["name"] == "Audit test"  # body was replayed to the route
    e = lines(log_dir)[-1]
    assert e["kind"] == "audit" and e["action"] == "firewall.rule.create"
    assert e["method"] == "POST" and e["path"] == "/api/firewall/rules"
    assert e["status"] == 201 and e["outcome"] == "success" and e["duration_ms"] >= 0
    assert e["actor"] and e["detail"]["name"] == "Audit test"
    assert len(e["detail"]["description"]) < 500  # long strings truncated
    assert len(json.dumps(e["detail"])) <= 2048
    assert e["prev"] and e["hash"] == digest(e)


def test_update_and_delete_actions_and_targets(client, log_dir):
    rid = client.post("/api/firewall/rules", json=RULE).json()["id"]
    assert client.put(f"/api/firewall/rules/{rid}", json={**RULE, "name": "Renamed"}).status_code == 200
    assert client.delete(f"/api/firewall/rules/{rid}").status_code == 200
    assert client.delete("/api/alerts").status_code == 200
    assert client.post("/api/simulation/reset", json={"keep_rules": True}).status_code == 200
    got = [(e["action"], e["target"]) for e in lines(log_dir)]
    assert got[-5:] == [("firewall.rule.create", None), ("firewall.rule.update", str(rid)),
                        ("firewall.rule.delete", str(rid)), ("alerts.clear", None), ("simulation.reset", None)]


def test_get_requests_and_audit_endpoints_are_not_logged(client, log_dir):
    client.get("/api/firewall/rules")
    client.get("/api/health")
    client.get("/api/audit")
    client.get("/api/audit/verify")
    assert lines(log_dir) == []
    assert client.get("/api/audit").json() == []


def test_validation_failure_is_logged_as_failure(client, log_dir):
    r = client.post("/api/firewall/rules", json={"name": "bad"})
    assert r.status_code == 422
    e = lines(log_dir)[-1]
    assert e["status"] == 422 and e["outcome"] == "failure" and e["action"] == "firewall.rule.create"
    assert e["detail"] == {"name": "bad"}


def test_not_found_is_logged_as_failure(client, log_dir):
    assert client.delete("/api/firewall/rules/99999").status_code == 404
    assert lines(log_dir)[-1]["outcome"] == "failure"


def test_live_configure_action(client, log_dir):
    assert client.put("/api/live", json={"rate": 3}).status_code == 200
    e = lines(log_dir)[-1]
    assert e["action"] == "live.configure" and e["detail"] == {"rate": 3}


def test_unknown_route_falls_back_to_method_path():
    assert describe("POST", "/api/nope/thing") == ("post:/api/nope/thing", None)
    assert describe("POST", "/api/traffic/scenario/ddos") == ("traffic.scenario.run", "ddos")


def test_summarize_body_edge_cases():
    assert summarize_body(b"") is None
    assert summarize_body(b"not json") == {"_unparsed": True, "bytes": 8}
    assert summarize_body(b"[1,2]") == {"body": [1, 2]}
    assert summarize_body(b'{"password":"hunter2"}') == {"password": "***"}
    big = json.dumps({f"k{i}": "v" * 150 for i in range(40)}).encode()
    out = summarize_body(big)
    assert out["_truncated"] is True and len(json.dumps(out)) < 2200


def test_security_entry_written_when_scenario_raises_alerts(client, log_dir):
    assert client.post("/api/traffic/scenario/brute_force").status_code == 200
    sec = lines(log_dir, "security.log")
    assert sec and all(e["kind"] == "security" for e in sec)
    alerts = {a["id"]: a for a in client.get("/api/alerts?limit=1000").json()}
    e = next(x for x in sec if x["rule_id"] == "IDS-001")
    assert e["alert_id"] in alerts and e["severity"] == alerts[e["alert_id"]]["severity"]
    assert e["source"] == "rule" and e["src_ip"] == "203.0.113.50" and e["title"]
    assert [x["seq"] for x in sec] == list(range(1, len(sec) + 1))
    aud = lines(log_dir)[-1]
    assert aud["action"] == "traffic.scenario.run" and aud["target"] == "brute_force"


def test_chain_verifies_then_detects_tampering(client, log_dir):
    for i in range(4):
        client.post("/api/firewall/rules", json={**RULE, "name": f"r{i}", "priority": 100 + i})
    ok = client.get("/api/audit/verify").json()
    assert ok == {"kind": "audit", "ok": True, "entries": 4, "first_bad_seq": None}
    assert lines(log_dir)[0]["prev"] == ZERO_HASH

    path = log_dir / "audit.log"
    rows = path.read_text(encoding="utf-8").splitlines()
    row = json.loads(rows[1])
    row["outcome"] = "failure"  # attacker rewrites history
    rows[1] = json.dumps(row)
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    bad = client.get("/api/audit/verify").json()
    assert bad["ok"] is False and bad["first_bad_seq"] == 2 and bad["entries"] == 4


def test_deleted_line_breaks_chain(client, log_dir):
    for i in range(3):
        client.post("/api/firewall/rules", json={**RULE, "name": f"r{i}", "priority": 100 + i})
    path = log_dir / "audit.log"
    rows = path.read_text(encoding="utf-8").splitlines()
    path.write_text("\n".join([rows[0], rows[2]]) + "\n", encoding="utf-8")
    bad = client.get("/api/audit/verify").json()
    assert bad["ok"] is False and bad["first_bad_seq"] == 3


def test_verify_accepts_file_starting_mid_chain(client, log_dir):
    for i in range(3):
        client.post("/api/firewall/rules", json={**RULE, "name": f"r{i}", "priority": 100 + i})
    path = log_dir / "audit.log"
    rows = path.read_text(encoding="utf-8").splitlines()
    path.write_text("\n".join(rows[1:]) + "\n", encoding="utf-8")  # as after rotation
    res = client.get("/api/audit/verify").json()
    assert res["ok"] is True and res["entries"] == 2


def test_seed_alerts_are_in_security_log_and_verify(client):
    total = int(client.get("/api/audit?kind=security").headers["x-total-count"])
    assert total > 0  # the seeded Telnet-probe incident
    assert client.get("/api/audit/verify?kind=security").json() == {
        "kind": "security", "ok": True, "entries": total, "first_bad_seq": None}


def test_seq_and_chain_resume_after_restart(tmp_path):
    a = AuditLog(tmp_path)
    a.record_request(actor="1.1.1.1", method="POST", path="/api/x", status=200, duration_ms=1)
    last = a.record_request(actor="1.1.1.1", method="POST", path="/api/x", status=200, duration_ms=1)
    a.close()
    b = AuditLog(tmp_path)
    nxt = b.record_request(actor="1.1.1.1", method="PUT", path="/api/live", status=200, duration_ms=1)
    assert nxt["seq"] == last["seq"] + 1 == 3 and nxt["prev"] == last["hash"]
    assert b.verify("audit") == {"kind": "audit", "ok": True, "entries": 3, "first_bad_seq": None}
    b.close()


def test_audit_write_failure_never_breaks_request(client, monkeypatch):
    def boom(*a, **k):
        raise OSError("disk full")
    monkeypatch.setattr(client.app_ctx.audit._chains["audit"], "append", boom)
    assert client.post("/api/firewall/rules", json=RULE).status_code == 201


def test_list_pagination_total_and_filter(client):
    for i in range(5):
        client.post("/api/firewall/rules", json={**RULE, "name": f"rule-{i}", "priority": 100 + i})
    client.delete("/api/alerts")
    r = client.get("/api/audit?limit=2")
    body = r.json()
    assert r.headers["x-total-count"] == "6" and len(body) == 2
    assert body[0]["seq"] == 6 and body[1]["seq"] == 5  # newest first
    assert [e["seq"] for e in client.get("/api/audit?limit=2&offset=2").json()] == [4, 3]
    r = client.get("/api/audit?q=RULE-3")
    assert r.headers["x-total-count"] == "1" and r.json()[0]["detail"]["name"] == "rule-3"
    r = client.get("/api/audit?q=alerts.clear")
    assert r.headers["x-total-count"] == "1"
    assert client.get("/api/audit?q=zzz-nothing").json() == []
    assert client.get("/api/audit?limit=0").status_code == 422
    assert client.get("/api/audit?limit=1001").status_code == 422
    assert client.get("/api/audit?offset=-1").status_code == 422


def test_security_listing(client):
    client.post("/api/traffic/scenario/telnet_probe")
    r = client.get("/api/audit?kind=security&limit=1000")
    assert int(r.headers["x-total-count"]) == len(r.json()) > 0
    assert all(e["kind"] == "security" for e in r.json())
    assert client.get("/api/audit?kind=security&q=IDS-002").json()


def test_invalid_kind_is_422(client):
    r = client.get("/api/audit?kind=bogus")
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    assert client.get("/api/audit/verify?kind=bogus").status_code == 422


def test_app_log_created_by_lifespan(client, log_dir):
    assert (log_dir / "app.log").exists()
    assert (log_dir / "audit.log").exists() and (log_dir / "security.log").exists()
