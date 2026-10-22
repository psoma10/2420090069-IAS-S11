from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from ..context import AppContext
from ..models import TrafficSend
from ..simulator import SCENARIOS
from . import get_ctx, rate_limit

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


def _response(packets: list[dict[str, Any]]) -> dict[str, Any]:
    blocked = sum(1 for p in packets if p["verdict"] == "blocked")
    return {"packets": packets, "summary": {"total": len(packets), "allowed": len(packets) - blocked,
                                            "blocked": blocked, "alerts": sum(len(p["alerts"]) for p in packets)}}


def _published(ctx: AppContext, packets: list[dict[str, Any]]) -> dict[str, Any]:
    ctx.notify("packets")
    ctx.notify("rules")  # hit_count changed
    if any(p["alerts"] for p in packets):
        ctx.notify("alerts")
    return _response(packets)


@router.post("/send", dependencies=[Depends(rate_limit)])
def send(body: TrafficSend, ctx: AppContext = Depends(get_ctx)):
    specs = ctx.sim.build_send(body.type, body.src_ip, body.dst_ip, body.count, body.dst_port, body.protocol,
                               body.success, body.bytes)
    return _published(ctx, ctx.sim.process(specs))


@router.get("/scenarios")
def scenarios():
    return SCENARIOS


@router.post("/scenario/{name}", dependencies=[Depends(rate_limit)])
def run_scenario(name: str, ctx: AppContext = Depends(get_ctx)):
    if name not in {s["name"] for s in SCENARIOS}:
        raise HTTPException(404, f"Unknown scenario '{name}'. Valid: {', '.join(s['name'] for s in SCENARIOS)}")
    return _published(ctx, ctx.sim.process(ctx.sim.build_scenario(name)))


@router.get("/packets")
def packets(limit: int = Query(100, ge=1, le=1000), verdict: str = Query("", pattern="^(allowed|blocked)?$"),
            src_ip: str = "", offset: int = Query(0, ge=0), response: Response = None,
            ctx: AppContext = Depends(get_ctx)):
    response.headers["X-Total-Count"] = str(ctx.db.count_packets(verdict, src_ip))
    return ctx.db.list_packets(limit, verdict, src_ip, offset)
