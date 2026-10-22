from fastapi import APIRouter, Depends, HTTPException

from ..clock import iso
from ..context import AppContext
from ..models import IdsRuleUpdate
from . import get_ctx

router = APIRouter(prefix="/api/ids", tags=["ids"])


@router.get("/rules")
def list_rules(ctx: AppContext = Depends(get_ctx)):
    return ctx.db.list_ids_rules()


@router.put("/rules/{rule_id}")
def update_rule(rule_id: str, body: IdsRuleUpdate, ctx: AppContext = Depends(get_ctx)):
    rule = ctx.ids.rules.get(rule_id)
    if not rule:
        raise HTTPException(404, f"IDS rule {rule_id} not found")
    thr = body.threshold if (body.threshold is not None and rule["threshold"] is not None) else rule["threshold"]
    ctx.db.execute(
        "UPDATE ids_rules SET enabled=?, threshold=?, window_seconds=?, severity=? WHERE id=?",
        (int(body.enabled), thr, body.window_seconds or rule["window_seconds"], body.severity or rule["severity"],
         rule_id))
    ctx.ids.reload()
    return ctx.ids.rules[rule_id]


@router.get("/summary")
def summary(ctx: AppContext = Depends(get_ctx)):
    db = ctx.db
    now = ctx.clock()
    by_sev = {s: 0 for s in ("low", "medium", "high", "critical")}
    by_src = {s: 0 for s in ("rule", "anomaly", "firewall")}
    for r in db.query("SELECT severity, COUNT(*) c FROM alerts GROUP BY severity"):
        by_sev[r["severity"]] = r["c"]
    for r in db.query("SELECT source, COUNT(*) c FROM alerts GROUP BY source"):
        by_src[r["source"]] = r["c"]
    top = db.query("SELECT src_ip ip, COUNT(*) c FROM alerts WHERE src_ip IS NOT NULL GROUP BY src_ip "
                   "ORDER BY c DESC, ip LIMIT 5")
    minute = int(now // 60)
    counts = {r["m"]: r["c"] for r in db.query(
        "SELECT CAST(ts/60 AS INTEGER) m, COUNT(*) c FROM alerts WHERE ts >= ? GROUP BY m", ((minute - 59) * 60,))}
    series = [{"ts": iso((m) * 60), "count": counts.get(m, 0)} for m in range(minute - 59, minute + 1)]
    return {"total": sum(by_sev.values()), "by_severity": by_sev, "by_source": by_src,
            "top_sources": [{"ip": r["ip"], "count": r["c"]} for r in top], "last_hour_series": series}
