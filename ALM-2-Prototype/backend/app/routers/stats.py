from fastapi import APIRouter, Depends

from ..context import AppContext
from . import get_ctx

router = APIRouter(prefix="/api/stats", tags=["stats"])

TYPES = ["http", "https", "ssh_login", "telnet", "port_scan", "ping", "dns", "data_transfer", "syn_flood"]


def build_summary(ctx: AppContext) -> dict:
    db = ctx.db
    by_verdict = {r["verdict"]: r["c"] for r in db.query("SELECT verdict, COUNT(*) c FROM packets GROUP BY verdict")}
    by_proto = {"TCP": 0, "UDP": 0, "ICMP": 0}
    for r in db.query("SELECT protocol, COUNT(*) c FROM packets GROUP BY protocol"):
        by_proto[r["protocol"]] = r["c"]
    by_type = {t: 0 for t in TYPES}
    for r in db.query("SELECT type, COUNT(*) c FROM packets GROUP BY type"):
        by_type[r["type"]] = r["c"]
    top = db.query("SELECT src_ip ip, COUNT(*) c FROM packets GROUP BY src_ip ORDER BY c DESC, ip LIMIT 5")
    with db.lock:
        throughput = ctx.anomaly.throughput(60)
    return {
        "packets_total": sum(by_verdict.values()),
        "allowed": by_verdict.get("allowed", 0),
        "blocked": by_verdict.get("blocked", 0),
        "alerts_total": db.scalar("SELECT COUNT(*) FROM alerts"),
        "alerts_unacked": db.scalar("SELECT COUNT(*) FROM alerts WHERE acknowledged=0"),
        "rules_total": db.scalar("SELECT COUNT(*) FROM firewall_rules"),
        "hosts_total": db.scalar("SELECT COUNT(*) FROM hosts"),
        "bastion": db.get_bastion(),
        "by_protocol": by_proto,
        "by_type": by_type,
        "top_sources": [{"ip": r["ip"], "count": r["c"]} for r in top],
        "throughput": throughput,
    }


@router.get("/summary")
def summary(ctx: AppContext = Depends(get_ctx)):
    return build_summary(ctx)
