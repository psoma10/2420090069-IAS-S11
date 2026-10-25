"""Tests for /api/events, /api/investigate, /api/settings, pagination and rate limiting."""
import json
import threading
import time

import pytest

from app.alert_bus import RateLimiter

SEND = dict(type="http", src_ip="198.51.100.7", dst_ip="10.0.1.10")


def parse_sse(text):
    """-> list of (event, data) for typed frames; comments are ignored."""
    out, ev = [], None
    for ln in text.splitlines():
        if ln.startswith("event:"):
            ev = ln[6:].strip()
        elif ln.startswith("data:") and ev:
            out.append((ev, json.loads(ln[5:])))
            ev = None
    return out


def stream_while(client, mutate, limit, **params):
    """Open /api/events?limit=N in a thread, run ``mutate`` once subscribed, return parsed frames."""
    box = {}
    ev = client.app_ctx.events

    def reader():
        box["r"] = client.get("/api/events", params={"limit": limit, **params})

    t = threading.Thread(target=reader)
    t.start()
    deadline = time.time() + 10
    while ev.subscriber_count < 1 and time.time() < deadline:
        time.sleep(0.02)
    time.sleep(0.1)
    mutate()
    t.join(15)
    assert not t.is_alive()
    return box["r"]


# ---------------------------------------------------------------- events
def test_events_initial_summary_matches_stats(client):
    r = client.get("/api/events", params={"limit": 1})
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.text.count("event: summary\ndata: ") == 1
    frames = parse_sse(r.text)
    assert frames[0][0] == "summary"
    s = client.get("/api/stats/summary").json()
    assert set(frames[0][1]) == set(s)
    assert frames[0][1]["hosts_total"] == s["hosts_total"]
    assert client.app_ctx.events.subscriber_count == 0


def test_events_change_on_mutation(client):
    r = stream_while(client, lambda: client.post(
        "/api/hosts", json={"name": "n", "ip": "10.9.9.9", "role": "workstation"}), limit=2)
    frames = parse_sse(r.text)
    assert frames[0][0] == "summary"
    assert ("change", {"entity": "hosts"}) in frames
    assert client.app_ctx.events.subscriber_count == 0


@pytest.mark.parametrize("call,entity", [
    (lambda c: c.put("/api/firewall/policy", json={"default_action": "allow", "bastion_mode": False}), "policy"),
    (lambda c: c.post("/api/firewall/rules", json=dict(name="x", action="deny")), "rules"),
    (lambda c: c.post("/api/simulation/reset"), "reset"),
    (lambda c: c.put("/api/settings", json={"packet_retention": 200}), "settings"),
    (lambda c: c.delete("/api/alerts"), "alerts"),
    (lambda c: c.post("/api/traffic/send", json=SEND), "packets"),
])
def test_change_entities(client, call, entity):
    q = client.app_ctx.events.subscribe()
    call(client)
    got = []
    while not q.empty():
        got.append(q.get_nowait())
    assert ("change", {"entity": entity}) in got


def test_events_alert_event(client):
    q = client.app_ctx.events.subscribe()
    client.post("/api/traffic/send", json=dict(type="telnet", src_ip="203.0.113.77", dst_ip="10.0.1.10"))
    alerts = []
    while not q.empty():
        e, d = q.get_nowait()
        if e == "alert":
            alerts.append(d)
    assert alerts and set(alerts[0]) >= {"id", "ts", "severity", "rule_id", "acknowledged"}


def test_events_summary_resent_when_changed(client):
    """With a tiny summary interval, a change in totals produces a second summary frame."""
    import asyncio

    from app.routers.events import events_stream

    async def go():
        gen = events_stream(client.app_ctx, keepalive=60, poll=0.01, summary_interval=0.05, limit=2)
        out = [await gen.__anext__(), await gen.__anext__()]  # ": connected", summary
        client.app_ctx.sim.process([dict(src_ip="198.51.100.7", dst_ip="10.0.1.10", src_port=1, dst_port=80,
                                         protocol="TCP", type="http", bytes=10, success=True)])
        out.append(await asyncio.wait_for(gen.__anext__(), 5))
        await gen.aclose()
        return out

    out = asyncio.run(go())
    assert out[0].startswith(": connected") and out[1].startswith("event: summary")
    assert out[2].startswith("event: summary") or out[2].startswith("event: alert")


def test_events_keepalive():
    import asyncio

    from app.context import AppContext
    from app.routers.events import events_stream

    async def go():
        ctx = AppContext(":memory:", auto_seed=False)
        gen = events_stream(ctx, keepalive=0.05, poll=0.01, summary_interval=999, limit=5)
        got = [await gen.__anext__() for _ in range(3)]
        await gen.aclose()
        return got, ctx.events.subscriber_count

    got, subs = asyncio.run(go())
    assert got[0].startswith(": connected") and got[1].startswith("event: summary")
    assert got[2].startswith(": keepalive")
    assert subs == 0


def test_alert_stream_unchanged(client):
    assert client.app_ctx.bus.subscriber_count == 0
    assert client.app_ctx.events.subscriber_count == 0


# ---------------------------------------------------------------- investigate
def test_investigate_known_ip(client, clock):
    clock.advance(120)
    client.post("/api/traffic/send", json=dict(type="http", src_ip="198.51.100.7", dst_ip="10.0.1.10", count=3))
    client.post("/api/traffic/send", json=dict(type="telnet", src_ip="203.0.113.77", dst_ip="10.0.1.10", count=2))
    d = client.get("/api/investigate/10.0.1.10").json()
    assert d["ip"] == "10.0.1.10" and d["host"]["name"] == "web-01"
    t = d["totals"]
    assert t["allowed"] + t["denied"] == t["packets"] and t["packets"] >= 5 and t["denied"] >= 2
    assert t["alerts"] >= 1 and d["alerts"] and len(d["alerts"]) <= 50
    ids = [p["id"] for p in d["packets"]]
    assert ids == sorted(ids, reverse=True) and len(ids) <= 100
    assert all("10.0.1.10" in (p["src_ip"], p["dst_ip"]) for p in d["packets"])
    assert d["first_seen"] <= d["last_seen"] and d["last_seen"].endswith("Z")
    assert d["rules_hit"] and {"rule", "hits"} == set(d["rules_hit"][0]) and "hit_count" in d["rules_hit"][0]["rule"]
    assert d["rules_hit"] == sorted(d["rules_hit"], key=lambda r: -r["hits"])
    peers = d["top_peers"]
    assert 0 < len(peers) <= 5 and all(p["ip"] != "10.0.1.10" for p in peers)
    assert peers == sorted(peers, key=lambda p: -p["packets"])


def test_investigate_unknown_and_invalid(client):
    d = client.get("/api/investigate/9.9.9.9").json()
    assert d["host"] is None and d["first_seen"] is None and d["last_seen"] is None
    assert d["totals"] == {"packets": 0, "allowed": 0, "denied": 0, "alerts": 0}
    assert d["packets"] == [] and d["alerts"] == [] and d["rules_hit"] == [] and d["top_peers"] == []
    r = client.get("/api/investigate/not-an-ip")
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    assert client.get("/api/investigate/999.1.1.1").status_code == 422


# ---------------------------------------------------------------- settings
def test_settings_defaults_and_update(client):
    assert client.get("/api/settings").json() == {"packet_retention": 5000, "alert_retention": 1000}
    r = client.put("/api/settings", json={"packet_retention": 300, "alert_retention": 60})
    assert r.json() == {"packet_retention": 300, "alert_retention": 60}
    assert client.get("/api/settings").json() == {"packet_retention": 300, "alert_retention": 60}
    # partial update keeps the other value
    assert client.put("/api/settings", json={"alert_retention": 70}).json() == {
        "packet_retention": 300, "alert_retention": 70}


@pytest.mark.parametrize("body", [
    {"packet_retention": 99}, {"packet_retention": 100001}, {"alert_retention": 49}, {"alert_retention": 50001},
    {"packet_retention": "lots"}, {"alert_retention": 1.5},
])
def test_settings_validation_422(client, body):
    r = client.put("/api/settings", json=body)
    assert r.status_code == 422 and isinstance(r.json()["detail"], str) and r.json()["detail"]


def test_settings_persist_in_db(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app
    path = tmp_path / "s.db"
    with TestClient(create_app(path, seed=1)) as c:
        c.put("/api/settings", json={"packet_retention": 777, "alert_retention": 88})
    with TestClient(create_app(path, seed=1)) as c:
        assert c.get("/api/settings").json() == {"packet_retention": 777, "alert_retention": 88}


def test_retention_pruning_on_write_and_update(client):
    client.put("/api/settings", json={"packet_retention": 100, "alert_retention": 50})
    for _ in range(3):
        client.post("/api/traffic/send", json={**SEND, "count": 90})
    assert client.get("/api/traffic/packets", params={"limit": 1}).headers["x-total-count"] == "100"
    newest = client.get("/api/traffic/packets", params={"limit": 1}).json()[0]["id"]
    oldest = client.get("/api/traffic/packets", params={"limit": 1, "offset": 99}).json()[0]["id"]
    assert newest - oldest == 99  # newest rows were kept
    # alerts
    for _ in range(5):
        client.post("/api/traffic/send", json=dict(type="syn_flood", src_ip="203.0.113.99", dst_ip="10.0.1.10",
                                                   count=200))
    assert int(client.get("/api/alerts").headers["x-total-count"]) <= 50
    # immediate pruning on settings update
    client.put("/api/settings", json={"packet_retention": 5000, "alert_retention": 5000})
    client.post("/api/traffic/send", json={**SEND, "count": 200})
    assert int(client.get("/api/traffic/packets").headers["x-total-count"]) == 300
    client.put("/api/settings", json={"packet_retention": 100})
    assert client.get("/api/traffic/packets").headers["x-total-count"] == "100"


# ---------------------------------------------------------------- pagination
def test_packets_offset_and_total_count(client):
    client.post("/api/traffic/send", json={**SEND, "count": 30})
    total = int(client.get("/api/traffic/packets", params={"limit": 1}).headers["x-total-count"])
    assert total >= 30
    a = client.get("/api/traffic/packets", params={"limit": 10}).json()
    b = client.get("/api/traffic/packets", params={"limit": 10, "offset": 10}).json()
    assert isinstance(a, list) and len(a) == len(b) == 10
    assert {p["id"] for p in a}.isdisjoint(p["id"] for p in b) and a[-1]["id"] > b[0]["id"]
    assert client.get("/api/traffic/packets", params={"limit": 5, "offset": total + 5}).json() == []
    f = client.get("/api/traffic/packets", params={"verdict": "blocked", "limit": 2})
    assert int(f.headers["x-total-count"]) == client.app_ctx.db.count_packets("blocked")
    assert client.get("/api/traffic/packets", params={"offset": -1}).status_code == 422


def test_alerts_offset_and_total_count(client):
    client.post("/api/traffic/scenario/telnet_probe")
    r = client.get("/api/alerts", params={"limit": 2})
    total = int(r.headers["x-total-count"])
    assert total >= 3 and isinstance(r.json(), list) and len(r.json()) == 2
    nxt = client.get("/api/alerts", params={"limit": 2, "offset": 2}).json()
    assert nxt and nxt[0]["id"] < r.json()[-1]["id"]
    assert len(client.get("/api/alerts", params={"limit": 1000}).json()) == total
    assert client.get("/api/alerts", params={"offset": -3}).status_code == 422
    assert client.get("/api/alerts", params={"limit": 1001}).status_code == 422
    sev = client.get("/api/alerts", params={"severity": "low"})
    assert int(sev.headers["x-total-count"]) == client.app_ctx.db.count_alerts("low")


def test_total_count_header_exposed_via_cors(client):
    r = client.get("/api/alerts", headers={"Origin": "http://localhost:48732"})
    assert "x-total-count" in r.headers["access-control-expose-headers"].lower()


# ---------------------------------------------------------------- rate limit
def test_traffic_rate_limit_429(client):
    codes = [client.post("/api/traffic/send", json=SEND).status_code for _ in range(60)]
    assert codes[:40] == [200] * 40
    assert 429 in codes
    r = client.post("/api/traffic/send", json=SEND)
    assert r.status_code == 429 and isinstance(r.json()["detail"], str) and r.headers["retry-after"] == "1"
    assert client.post("/api/traffic/scenario/normal").status_code == 429
    assert client.get("/api/health").status_code == 200  # only the generator is limited


def test_rate_limiter_refills():
    t = [0.0]
    rl = RateLimiter(rate=10, burst=2, now=lambda: t[0])
    assert rl.allow("a") and rl.allow("a") and not rl.allow("a")
    assert rl.allow("b")  # per-key
    t[0] += 0.1
    assert rl.allow("a") and not rl.allow("a")
