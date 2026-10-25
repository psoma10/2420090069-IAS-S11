import asyncio
import json
import queue
import time
from typing import Any, AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

from ..alert_bus import AlertBus
from ..context import AppContext
from . import get_ctx

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


async def event_stream(bus: AlertBus, request: Optional[Request] = None, keepalive: float = 15.0,
                       poll: float = 0.2, limit: Optional[int] = None) -> AsyncIterator[str]:
    """SSE generator: one ``data:`` frame per alert, ``: keepalive`` comments while idle."""
    q = bus.subscribe()
    try:
        yield ": connected\n\n"
        last, sent = time.monotonic(), 0
        while True:
            if request is not None and await request.is_disconnected():
                break
            try:
                alert: dict[str, Any] = q.get_nowait()
            except queue.Empty:
                if time.monotonic() - last >= keepalive:
                    last = time.monotonic()
                    yield ": keepalive\n\n"
                await asyncio.sleep(poll)
                continue
            yield f"data: {json.dumps(alert)}\n\n"
            sent += 1
            if limit is not None and sent >= limit:
                break
    finally:
        bus.unsubscribe(q)


@router.get("/stream")
async def stream(request: Request, limit: Optional[int] = Query(None, ge=1, description="Close after N events (testing)")):
    ctx: AppContext = request.app.state.ctx
    return StreamingResponse(
        event_stream(ctx.bus, request, limit=limit), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.get("")
def list_alerts(limit: int = Query(100, ge=1, le=1000), severity: str = Query("", pattern="^(low|medium|high|critical)?$"),
                source: str = Query("", pattern="^(rule|anomaly|firewall)?$"), acknowledged: Optional[bool] = None,
                offset: int = Query(0, ge=0), response: Response = None, ctx: AppContext = Depends(get_ctx)):
    response.headers["X-Total-Count"] = str(ctx.db.count_alerts(severity, source, acknowledged))
    return ctx.db.list_alerts(limit, severity, source, acknowledged, offset)


@router.post("/{alert_id}/ack")
def ack(alert_id: int, ctx: AppContext = Depends(get_ctx)):
    if not ctx.db.get_alert(alert_id):
        raise HTTPException(404, f"Alert {alert_id} not found")
    ctx.db.execute("UPDATE alerts SET acknowledged=1 WHERE id=?", (alert_id,))
    ctx.notify("alerts")
    return ctx.db.get_alert(alert_id)


@router.delete("")
def clear(ctx: AppContext = Depends(get_ctx)):
    ctx.db.execute("DELETE FROM alerts")
    ctx.notify("alerts")
    return {"ok": True}
