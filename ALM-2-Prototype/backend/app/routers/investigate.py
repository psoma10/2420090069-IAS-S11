from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from .. import firewall as fw
from ..clock import iso
from ..context import AppContext
from . import get_ctx

router = APIRouter(prefix="/api/investigate", tags=["investigate"])


@router.get("/{ip}")
def investigate(ip: str, ctx: AppContext = Depends(get_ctx)) -> dict[str, Any]:
    try:
        ip = fw.validate_ip(ip)
    except ValueError as e:
        raise HTTPException(422, f"ip: {e}") from None
    db = ctx.db
    with db.lock:
        agg = db.query_one(
            "SELECT COUNT(*) n, MIN(ts) first, MAX(ts) last, "
            "COALESCE(SUM(verdict='allowed'),0) allowed, COALESCE(SUM(verdict='blocked'),0) denied "
            "FROM packets WHERE src_ip=? OR dst_ip=?", (ip, ip))
        hits = db.query(
            "SELECT matched_rule_id rid, COUNT(*) c FROM packets WHERE (src_ip=? OR dst_ip=?) "
            "AND matched_rule_id IS NOT NULL GROUP BY matched_rule_id ORDER BY c DESC, rid", (ip, ip))
        rules_hit = []
        for h in hits:
            rule = db.get_rule(h["rid"])
            if rule:
                rules_hit.append({"rule": rule, "hits": h["c"]})
        peers = db.query(
            "SELECT CASE WHEN src_ip=? THEN dst_ip ELSE src_ip END peer, COUNT(*) c FROM packets "
            "WHERE src_ip=? OR dst_ip=? GROUP BY peer ORDER BY c DESC, peer LIMIT 5", (ip, ip, ip))
        packets = db.list_packets(100, ip=ip)
        alerts = db.list_alerts(50, ip=ip)
        alerts_total = db.count_alerts(ip=ip)
    return {
        "ip": ip,
        "host": db.host_by_ip(ip),
        "first_seen": iso(agg["first"]) if agg["n"] else None,
        "last_seen": iso(agg["last"]) if agg["n"] else None,
        "totals": {"packets": agg["n"], "allowed": agg["allowed"], "denied": agg["denied"], "alerts": alerts_total},
        "packets": packets,
        "alerts": alerts,
        "rules_hit": rules_hit,
        "top_peers": [{"ip": r["peer"], "packets": r["c"]} for r in peers],
    }
