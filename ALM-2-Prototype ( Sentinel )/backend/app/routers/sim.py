from fastapi import APIRouter, Depends

from ..context import VERSION, AppContext
from ..models import ResetBody
from . import get_ctx

router = APIRouter(prefix="/api", tags=["simulation"])


@router.get("/health")
def health(ctx: AppContext = Depends(get_ctx)):
    return {"status": "ok", "version": VERSION, "uptime_seconds": round(ctx.clock() - ctx.started_at, 1)}


@router.post("/simulation/reset")
def reset(body: ResetBody | None = None, ctx: AppContext = Depends(get_ctx)):
    ctx.sim.reset((body or ResetBody()).keep_rules)
    ctx.notify("reset")
    return {"ok": True}


@router.post("/simulation/seed")
def seed(ctx: AppContext = Depends(get_ctx)):
    ctx.sim.seed()
    ctx.notify("reset")
    return {"ok": True}
