import asyncio
import json
import queue
import time
from typing import Any, AsyncIterator, Optional

from fastapi import APIRouter, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from ..alert_bus import EventBus
from ..context import AppContext
from .stats import build_summary

router = APIRouter(prefix="/api", tags=["events"])


def frame(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def events_stream(ctx: AppContext, request: Optional[Request] = None, keepalive: float = 15.0,
                        poll: float = 0.2, summary_interval: float = 1.0,
                        limit: Optional[int] = None) -> AsyncIterator[str]:
    """Typed SSE: ``summary`` (immediately, then when changed, at most once per ``summary_interval``),
    ``alert`` and ``change`` events from the bus, ``: keepalive`` comments while idle."""
    bus: EventBus = ctx.events
    q = bus.subscribe()
    try:
        yield ": connected\n\n"
        sent = 0
        last_json = json.dumps(await run_in_threadpool(build_summary, ctx))
        yield f"event: summary\ndata: {last_json}\n\n"
        sent += 1
        if limit is not None and sent >= limit:
            return
        last_summary = last_out = time.monotonic()
        while True:
            if request is not None and await request.is_disconnected():
                break
            drained = False
            while True:
                try:
                    etype, data = q.get_nowait()
                except queue.Empty:
                    break
                drained = True
                yield frame(etype, data)
                sent += 1
                last_out = time.monotonic()
                if limit is not None and sent >= limit:
                    return
            now = time.monotonic()
            if now - last_summary >= summary_interval:
                last_summary = now
                cur = json.dumps(await run_in_threadpool(build_summary, ctx))
                if cur != last_json:
                    last_json = cur
                    yield f"event: summary\ndata: {cur}\n\n"
                    sent += 1
                    last_out = time.monotonic()
                    if limit is not None and sent >= limit:
                        return
            if not drained and time.monotonic() - last_out >= keepalive:
                last_out = time.monotonic()
                yield ": keepalive\n\n"
                yield "event: ping\ndata: {}\n\n"  # a real event, so browsers can detect a dead stream
            await asyncio.sleep(poll)
    finally:
        bus.unsubscribe(q)


@router.get("/events")
async def events(request: Request, limit: Optional[int] = Query(None, ge=1, description="Close after N events (testing)")):
    ctx: AppContext = request.app.state.ctx
    return StreamingResponse(
        events_stream(ctx, request, limit=limit), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})
