from fastapi import APIRouter, Depends

from ..context import AppContext
from ..models import SettingsBody
from . import get_ctx

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings(ctx: AppContext = Depends(get_ctx)):
    return ctx.db.get_retention()


@router.put("")
def put_settings(body: SettingsBody, ctx: AppContext = Depends(get_ctx)):
    cur = ctx.db.get_retention()
    out = ctx.db.set_retention(
        body.packet_retention if body.packet_retention is not None else cur["packet_retention"],
        body.alert_retention if body.alert_retention is not None else cur["alert_retention"])
    ctx.notify("settings")
    ctx.notify("packets")
    ctx.notify("alerts")
    return out
