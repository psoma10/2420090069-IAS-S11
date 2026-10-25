from app.live import DEFAULTS, normalize


def test_normalize_clamps_and_defaults():
    assert normalize({}) == DEFAULTS
    out = normalize({"rate": 999, "attack_interval": -5, "enabled": 0})
    assert out == {"enabled": False, "rate": 20.0, "attack_interval": 0}


def test_tick_feeds_pipeline(ctx):
    ctx.live.configure({"rate": 20, "attack_interval": 0})
    before = ctx.db.scalar("SELECT COUNT(*) FROM packets")
    total = sum(ctx.live.tick(now=float(i)) for i in range(5))
    assert total > 0
    assert ctx.db.scalar("SELECT COUNT(*) FROM packets") == before + total
    assert ctx.live.stats["packets"] == total


def test_disabled_generates_nothing(ctx):
    ctx.live.configure({"enabled": False})
    assert ctx.live.tick(now=1.0) == 0
    assert ctx.live.status()["running"] is False


def test_attack_is_dripped_and_raises_alerts(ctx):
    ctx.live.configure({"rate": 0.2, "attack_interval": 10})
    ctx.live.tick(now=0.0)  # schedules the first attack
    ctx.live._next_attack = 0.0
    ctx.live.tick(now=1.0)
    assert ctx.live.stats["attacks"] == 1 and ctx.live.stats["last_attack"]
    for i in range(2, 12):
        ctx.live.tick(now=float(i))
    assert not ctx.live._queue  # fully drained
    attacker = ctx.db.scalar("SELECT COUNT(*) FROM packets WHERE src_ip LIKE '203.0.113.%' OR dst_ip LIKE '203.0.113.%'")
    assert attacker > 0


def test_live_api_roundtrip(client):
    got = client.get("/api/live").json()
    assert got["enabled"] is True and got["running"] is False  # thread only starts when create_app(live=True)
    r = client.put("/api/live", json={"rate": 5, "attack_interval": 30, "enabled": False})
    assert r.status_code == 200
    assert r.json()["rate"] == 5.0 and r.json()["enabled"] is False
    assert client.put("/api/live", json={"rate": 500}).status_code == 422
    assert client.app_ctx.db.get_setting("live", {})["attack_interval"] == 30
