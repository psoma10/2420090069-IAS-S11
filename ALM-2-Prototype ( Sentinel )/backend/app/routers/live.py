from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..context import AppContext
from . import get_ctx

router = APIRouter(prefix="/api/live", tags=["live"])


class LiveConfig(BaseModel):
    enabled: Optional[bool] = None
    rate: Optional[float] = Field(None, ge=0.2, le=20, description="Average benign packets per second")
    attack_interval: Optional[int] = Field(None, ge=0, le=3600, description="Mean seconds between attacks; 0 = never")


@router.get("")
def get_live(ctx: AppContext = Depends(get_ctx)):
    return ctx.live.status()


@router.put("")
def put_live(body: LiveConfig, ctx: AppContext = Depends(get_ctx)):
    out = ctx.live.configure(body.model_dump(exclude_none=True))
    ctx.notify("live")
    return out
