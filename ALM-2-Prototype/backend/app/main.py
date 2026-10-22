"""FastAPI application factory. Run: ``uvicorn app.main:app --port 48731`` from backend/."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .clock import Clock, system_clock
from .context import VERSION, AppContext
from .db import DEFAULT_DB_PATH
from .routers import alerts, anomaly, events, firewall, hosts, ids, investigate, settings, sim, stats, traffic

# Any localhost port: the launcher picks the next free port when the defaults are taken.
ORIGIN_REGEX = r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"


def create_app(db_path: Optional[str | Path] = None, clock: Clock = system_clock, seed: Optional[int] = None,
               auto_seed: bool = True) -> FastAPI:
    app = FastAPI(title="Sentinel IDS & Firewall Simulator", version=VERSION)
    app.add_middleware(CORSMiddleware, allow_origin_regex=ORIGIN_REGEX, allow_methods=["*"], allow_headers=["*"],
                       expose_headers=["X-Total-Count"])
    app.state.ctx = AppContext(db_path or os.environ.get("SENTINEL_DB", DEFAULT_DB_PATH), clock, seed, auto_seed)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        msgs = []
        for e in exc.errors():
            loc = ".".join(str(p) for p in e["loc"] if p not in ("body", "query"))
            msg = str(e["msg"]).removeprefix("Value error, ")
            msgs.append(f"{loc}: {msg}" if loc else msg)
        errors: list[Any] = [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": "; ".join(msgs), "errors": errors})

    for module in (sim, firewall, hosts, traffic, alerts, ids, anomaly, stats, events, investigate, settings):
        app.include_router(module.router)
    return app


_app: Optional[FastAPI] = None


def __getattr__(name: str) -> FastAPI:
    """Lazy module-level ``app`` so importing this module (tests) does not create/seed sentinel.db."""
    global _app
    if name == "app":
        if _app is None:
            _app = create_app()
        return _app
    raise AttributeError(name)
