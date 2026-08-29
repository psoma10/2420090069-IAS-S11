"""Transfer endpoints (API_CONTRACT.md section 3.5).

Thin by design: parse, delegate to :class:`TransferService`, return the
envelope. No SQL, no cryptography, no hand-built error bodies.
"""

from __future__ import annotations

from flask import Blueprint, request

from core.auth import current_user_id, login_required
from core.responses import success
from core.validation import require_fields, require_json
from services.transfer_service import TransferService, parse_transfer_id

transfers_bp = Blueprint("transfers", __name__, url_prefix="/api/transfers")


@transfers_bp.post("")
@transfers_bp.post("/")
@login_required
def create_transfer():
    """Encrypt a document and transmit it."""
    data = require_json(request)
    require_fields(data, "document_id", "algorithm", "key")

    result = TransferService.create(
        user_id=current_user_id(),
        document_id=int(data["document_id"]),
        algorithm=data["algorithm"],
        key=data["key"],
        direction=data.get("direction"),
    )
    return success(result, "Transfer completed", 201)


@transfers_bp.get("")
@transfers_bp.get("/")
@login_required
def list_transfers():
    transfers, total = TransferService.list(
        current_user_id(),
        direction=request.args.get("direction"),
        status=request.args.get("status"),
        limit=request.args.get("limit", 50),
        offset=request.args.get("offset", 0),
    )
    return success({"transfers": transfers, "total": total}, "Transfers retrieved")


@transfers_bp.get("/<transfer_id>")
@login_required
def get_transfer(transfer_id: str):
    """Full detail, including ciphertext and the recorded stage trace."""
    result = TransferService.get(current_user_id(), parse_transfer_id(transfer_id))
    return success(result, "Transfer retrieved")


@transfers_bp.post("/<transfer_id>/decrypt")
@login_required
def decrypt_transfer(transfer_id: str):
    """Decrypt a received transfer.

    The body is optional. Omitting ``key`` uses the key stored with the
    transfer; supplying one checks that specific key instead.
    """
    data = require_json(request, allow_empty=True)
    result = TransferService.decrypt(
        user_id=current_user_id(),
        transfer_id=parse_transfer_id(transfer_id),
        key=(data or {}).get("key"),
    )
    return success(result, "Document decrypted successfully")
