from fastapi import APIRouter, Depends, Query

from ..anomaly import AnomalyConfig
from ..context import AppContext
from ..models import AnomalyConfigBody, BaselineBody
from . import get_ctx

router = APIRouter(prefix="/api/anomaly", tags=["anomaly"])


@router.get("/metrics")
def metrics(window: int = Query(60, ge=5, le=3600), ctx: AppContext = Depends(get_ctx)):
    with ctx.db.lock:
        return ctx.anomaly.metrics(window)


@router.get("/sources")
def sources(ctx: AppContext = Depends(get_ctx)):
    with ctx.db.lock:
        return ctx.anomaly.sources()


@router.get("/config")
def get_config(ctx: AppContext = Depends(get_ctx)):
    return ctx.anomaly.config.as_dict()


@router.put("/config")
def put_config(body: AnomalyConfigBody, ctx: AppContext = Depends(get_ctx)):
    ctx.set_anomaly_config(AnomalyConfig(**body.model_dump()))
    return ctx.anomaly.config.as_dict()


@router.post("/baseline")
def baseline(body: BaselineBody | None = None, ctx: AppContext = Depends(get_ctx)):
    return {"ok": True, "buckets": ctx.sim.baseline((body or BaselineBody()).minutes)}
