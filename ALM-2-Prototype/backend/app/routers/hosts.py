import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..context import AppContext
from ..models import HostIn
from . import get_ctx

router = APIRouter(prefix="/api/hosts", tags=["hosts"])


def _need(ctx: AppContext, host_id: int) -> dict[str, Any]:
    h = ctx.db.get_host(host_id)
    if not h:
        raise HTTPException(404, f"Host {host_id} not found")
    return h


def _clear_bastion(ctx: AppContext, except_id: int = -1) -> None:
    # Demoted bastions fall back to the "ssh" role (the closest non-bastion gateway role).
    ctx.db.execute("UPDATE hosts SET is_bastion=0, role='ssh' WHERE is_bastion=1 AND id<>?", (except_id,))


@router.get("")
def list_hosts(ctx: AppContext = Depends(get_ctx)):
    return ctx.db.list_hosts()


@router.post("", status_code=201)
def create_host(body: HostIn, ctx: AppContext = Depends(get_ctx)):
    with ctx.db.transaction():
        try:
            cur = ctx.db.execute("INSERT INTO hosts(name,ip,role,is_bastion,description) VALUES(?,?,?,?,?)",
                                 (body.name, body.ip, body.role, int(body.is_bastion), body.description))
        except sqlite3.IntegrityError:
            raise HTTPException(409, f"A host with IP {body.ip} already exists") from None
        hid = int(cur.lastrowid or 0)
        if body.is_bastion:
            _clear_bastion(ctx, hid)
    ctx.notify("hosts")
    return ctx.db.get_host(hid)


# Literal path must be declared before "/{host_id}" routes.
@router.delete("/bastion")
def remove_bastion(ctx: AppContext = Depends(get_ctx)):
    _clear_bastion(ctx)
    ctx.notify("hosts")
    return {"ok": True}


@router.put("/{host_id}")
def update_host(host_id: int, body: HostIn, ctx: AppContext = Depends(get_ctx)):
    _need(ctx, host_id)
    with ctx.db.transaction():
        try:
            ctx.db.execute("UPDATE hosts SET name=?,ip=?,role=?,is_bastion=?,description=? WHERE id=?",
                           (body.name, body.ip, body.role, int(body.is_bastion), body.description, host_id))
        except sqlite3.IntegrityError:
            raise HTTPException(409, f"A host with IP {body.ip} already exists") from None
        if body.is_bastion:
            _clear_bastion(ctx, host_id)
    ctx.notify("hosts")
    return ctx.db.get_host(host_id)


@router.delete("/{host_id}")
def delete_host(host_id: int, ctx: AppContext = Depends(get_ctx)):
    _need(ctx, host_id)
    ctx.db.execute("DELETE FROM hosts WHERE id=?", (host_id,))
    ctx.notify("hosts")
    return {"ok": True}


@router.post("/{host_id}/bastion")
def make_bastion(host_id: int, ctx: AppContext = Depends(get_ctx)):
    _need(ctx, host_id)
    with ctx.db.transaction():
        _clear_bastion(ctx, host_id)
        ctx.db.execute("UPDATE hosts SET is_bastion=1, role='bastion' WHERE id=?", (host_id,))
    ctx.notify("hosts")
    return ctx.db.get_host(host_id)
