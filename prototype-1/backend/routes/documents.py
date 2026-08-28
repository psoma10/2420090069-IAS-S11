"""Document endpoints (API_CONTRACT.md section 3.4).

These handlers parse the request, call :class:`DocumentService`, and shape the
result. They contain no validation, no SQL, and no filesystem access — a
rejected upload reaches the client because the service raised an ``AppError``
and the application's error handler rendered it, not because a route built an
envelope by hand.

Ownership is not checked here either. Every service call takes the session
user id and the repository filters on it, so a route physically cannot forget
the check.
"""

from __future__ import annotations

from flask import Blueprint, Response, request

from core.auth import current_user_id, login_required
from core.errors import ValidationError
from core.responses import success
from services.document_service import DocumentService

documents_bp = Blueprint("documents", __name__, url_prefix="/api/documents")


@documents_bp.post("")
@login_required
def upload_document():
    """Accept a ``multipart/form-data`` upload and record it."""
    if "file" not in request.files:
        raise ValidationError("A file is required")

    document = DocumentService.upload(
        current_user_id(),
        request.files["file"],
        direction=request.form.get("direction"),
        algorithm=request.form.get("algorithm"),
    )
    return success(data=document, message="Document uploaded successfully", status=201)


@documents_bp.get("")
@login_required
def list_documents():
    """List this user's documents, newest first."""
    documents, total = DocumentService.list(
        current_user_id(),
        direction=request.args.get("direction"),
        status=request.args.get("status"),
        limit=request.args.get("limit", 50),
        offset=request.args.get("offset", 0),
    )
    return success(data={"documents": documents, "total": total})


@documents_bp.get("/<int:document_id>")
@login_required
def get_document(document_id: int):
    """Return one document with its plaintext and a preview."""
    return success(data=DocumentService.get(document_id, current_user_id()))


@documents_bp.get("/<int:document_id>/download")
@login_required
def download_document(document_id: int):
    """Stream the plaintext back as a ``text/plain`` attachment.

    This is the one route that does not use the JSON envelope: the browser is
    being handed a file, not a payload to parse.

    The response is built from the stored text rather than by handing a path to
    ``send_file``, and the ``filename`` used in the disposition header is the
    original name with quotes and newlines stripped, so a crafted upload name
    cannot inject additional header fields.
    """
    document = DocumentService.get(document_id, current_user_id())

    safe_name = _header_safe_filename(document["filename"])
    return Response(
        document["content"],
        mimetype="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


def _header_safe_filename(filename: str) -> str:
    """Strip characters that would break out of the header value.

    Quotes end the quoted-string early and CR/LF would split the header, so
    both are removed rather than escaped. Anything left is display-only.
    """
    cleaned = "".join(
        ch for ch in (filename or "") if ch not in '"\\\r\n'
    ).strip()
    return cleaned or "document.txt"


__all__ = ["documents_bp"]
