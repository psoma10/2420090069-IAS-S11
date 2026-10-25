from typing import Literal

from fastapi import APIRouter, Depends, Query, Response

from ..context import AppContext
from . import get_ctx

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def list_audit(kind: Literal["audit", "security"] = "audit", limit: int = Query(100, ge=1, le=1000),
               offset: int = Query(0, ge=0), q: str = Query("", max_length=200), response: Response = None,
               ctx: AppContext = Depends(get_ctx)):
    entries, total = ctx.audit.read(kind, limit, offset, q)
    response.headers["X-Total-Count"] = str(total)
    return entries


@router.get("/verify")
def verify(kind: Literal["audit", "security"] = "audit", ctx: AppContext = Depends(get_ctx)):
    return ctx.audit.verify(kind)
