from fastapi import HTTPException, Request

from ..context import AppContext


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx


def rate_limit(request: Request) -> None:
    """Per-client-IP token bucket for the traffic generator (20 req/s, burst 40)."""
    ctx: AppContext = request.app.state.ctx
    client = request.client.host if request.client else "unknown"
    if not ctx.rate_limiter.allow(client):
        raise HTTPException(429, "Too many requests: traffic generator is limited to 20 requests/second per client",
                            headers={"Retry-After": "1"})
