from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..clock import iso
from ..context import AppContext
from ..models import FirewallRuleIn, FirewallTestBody, PolicyBody
from . import get_ctx

router = APIRouter(prefix="/api/firewall", tags=["firewall"])

COLS = "name,action,protocol,src_ip,dst_ip,src_port,dst_port,priority,enabled,description"


def _vals(b: FirewallRuleIn) -> list[Any]:
    return [b.name, b.action, b.protocol, b.src_ip, b.dst_ip, b.src_port, b.dst_port, b.priority, int(b.enabled),
            b.description]


def _need(ctx: AppContext, rule_id: int) -> dict[str, Any]:
    r = ctx.db.get_rule(rule_id)
    if not r:
        raise HTTPException(404, f"Firewall rule {rule_id} not found")
    return r


@router.get("/rules")
def list_rules(ctx: AppContext = Depends(get_ctx)):
    return ctx.db.list_rules()


@router.post("/rules", status_code=201)
def create_rule(body: FirewallRuleIn, ctx: AppContext = Depends(get_ctx)):
    cur = ctx.db.execute(
        f"INSERT INTO firewall_rules({COLS},hit_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?)",
        _vals(body) + [iso(ctx.clock())])
    ctx.notify("rules")
    return ctx.db.get_rule(int(cur.lastrowid or 0))


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: FirewallRuleIn, ctx: AppContext = Depends(get_ctx)):
    _need(ctx, rule_id)
    sets = ",".join(f"{c}=?" for c in COLS.split(","))
    ctx.db.execute(f"UPDATE firewall_rules SET {sets} WHERE id=?", _vals(body) + [rule_id])
    ctx.notify("rules")
    return ctx.db.get_rule(rule_id)


@router.patch("/rules/{rule_id}/toggle")
def toggle_rule(rule_id: int, ctx: AppContext = Depends(get_ctx)):
    r = _need(ctx, rule_id)
    ctx.db.execute("UPDATE firewall_rules SET enabled=? WHERE id=?", (int(not r["enabled"]), rule_id))
    ctx.notify("rules")
    return ctx.db.get_rule(rule_id)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, ctx: AppContext = Depends(get_ctx)):
    _need(ctx, rule_id)
    ctx.db.execute("DELETE FROM firewall_rules WHERE id=?", (rule_id,))
    ctx.notify("rules")
    return {"ok": True}


@router.get("/policy")
def get_policy(ctx: AppContext = Depends(get_ctx)):
    return ctx.db.get_policy()


@router.put("/policy")
def put_policy(body: PolicyBody, ctx: AppContext = Depends(get_ctx)):
    ctx.db.set_setting("policy", body.model_dump())
    ctx.notify("policy")
    return ctx.db.get_policy()


@router.post("/test")
def test_packet(body: FirewallTestBody, ctx: AppContext = Depends(get_ctx)):
    return ctx.firewall.dry_run(body.model_dump()).as_dict()


@router.get("/stats")
def stats(ctx: AppContext = Depends(get_ctx)):
    rules = ctx.db.list_rules()
    return {
        "total_rules": len(rules),
        "enabled_rules": sum(1 for r in rules if r["enabled"]),
        "hits_by_rule": [{"id": r["id"], "name": r["name"], "hits": r["hit_count"]} for r in rules],
        "allowed": ctx.db.scalar("SELECT COUNT(*) FROM packets WHERE verdict='allowed'"),
        "blocked": ctx.db.scalar("SELECT COUNT(*) FROM packets WHERE verdict='blocked'"),
    }
