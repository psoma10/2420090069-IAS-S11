"""Share-link endpoints.

Two audiences, two access rules, in one small file:

* ``/api/documents/<id>/shares`` and ``/api/shares/...`` belong to the owner
  and require a session.
* ``/api/share/<token>`` is public by design — the token is the credential.
  It is the only unauthenticated route in the application that returns
  document content, so it returns a deliberately narrow payload and nothing
  about the owner's account.
"""

from __future__ import annotations

from flask import Blueprint, request

from core.auth import current_user_id, login_required
from core.responses import success
from core.validation import require_json
from services.share_service import ShareService

shares_bp = Blueprint("shares", __name__, url_prefix="/api")


# ----------------------------------------------------------------- owner side

@shares_bp.post("/documents/<int:document_id>/shares")
@login_required
def create_share(document_id: int):
    """Create a link for a document the caller owns."""
    data = require_json(request, allow_empty=True) or {}
    share = ShareService.create(
        user_id=current_user_id(),
        document_id=document_id,
        label=data.get("label"),
        expires_in_days=data.get("expires_in_days"),
    )
    return success(share, "Share link created", 201)


@shares_bp.get("/documents/<int:document_id>/shares")
@login_required
def list_document_shares(document_id: int):
    shares = ShareService.list_for_document(current_user_id(), document_id)
    return success({"shares": shares, "total": len(shares)}, "Share links retrieved")


@shares_bp.get("/shares")
@login_required
def list_shares():
    shares, total = ShareService.list_for_user(
        current_user_id(),
        limit=request.args.get("limit", 50),
        offset=request.args.get("offset", 0),
    )
    return success({"shares": shares, "total": total}, "Share links retrieved")


@shares_bp.delete("/shares/<int:share_id>")
@login_required
def revoke_share(share_id: int):
    """Withdraw a link. Effective immediately — access is re-checked in SQL on
    every view, so there is no window where a revoked link still works."""
    share = ShareService.revoke(current_user_id(), share_id)
    return success(share, "Share link revoked")


# ---------------------------------------------------------------- public side

@shares_bp.get("/share/<token>")
def view_shared_document(token: str):
    """Open a shared document. No authentication — the token is the credential.

    A revoked link, an expired link and a token that never existed all produce
    the same 404, so a visitor cannot probe for links that used to work.
    """
    document = ShareService.resolve(token)
    return success(document, "Shared document retrieved")
