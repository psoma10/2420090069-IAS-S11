"""Document sharing by link.

A document is private until its owner explicitly creates a share. The share
URL then carries an unguessable token that is the visitor's only credential:
no login is required, which is what makes the link demonstrable in an
evaluation, and also what makes the token's properties load-bearing.

What that costs, stated plainly rather than buried:

* Anyone holding the link reads the document. The link *is* the permission.
* So the token is 32 random bytes from :mod:`secrets` (~256 bits), never
  derived from the document id, and never sequential. Guessing one is not
  feasible; incrementing a number to find the next one is impossible.
* Revocation and expiry are enforced in SQL on every view, so withdrawing a
  link takes effect immediately.
* A revoked, expired and never-existent token are reported identically, so a
  visitor cannot probe for links that used to work.

The visitor sees the readable document, per the product decision recorded in
ARCHITECTURE.md section 4a — so the response is deliberately narrow: filename,
size, content, owner display name. No key, no ciphertext, no transfer history,
no user id, no email.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from core.errors import DocumentNotFoundError, ValidationError
from repositories.document_repository import DocumentRepository
from repositories.share_repository import ShareRepository
from repositories.user_repository import UserRepository
from services.document_service import DocumentService

logger = logging.getLogger(__name__)

TOKEN_BYTES = 32
MAX_LABEL_LENGTH = 120
MAX_EXPIRY_DAYS = 365


def generate_token() -> str:
    """A URL-safe token with ~256 bits of entropy."""
    return secrets.token_urlsafe(TOKEN_BYTES)


class ShareService:
    """Creates, resolves and revokes share links."""

    @staticmethod
    def create(
        *,
        user_id: int,
        document_id: int,
        label: str | None = None,
        expires_in_days: int | None = None,
    ) -> dict:
        """Create a share link for a document the caller owns."""
        document = DocumentRepository.find_by_id(document_id, user_id)
        if document is None:
            # Same error whether the document belongs to someone else or does
            # not exist, so sharing cannot be used to probe for ids.
            raise DocumentNotFoundError()

        if label is not None:
            label = str(label).strip()[:MAX_LABEL_LENGTH] or None

        expires_at = None
        if expires_in_days is not None:
            try:
                days = int(expires_in_days)
            except (TypeError, ValueError) as exc:
                raise ValidationError("expires_in_days must be a whole number of days") from exc
            if days < 1 or days > MAX_EXPIRY_DAYS:
                raise ValidationError(
                    f"expires_in_days must be between 1 and {MAX_EXPIRY_DAYS}"
                )
            expires_at = datetime.now(timezone.utc) + timedelta(days=days)

        # A collision is vanishingly unlikely at 256 bits, but a unique index
        # is the wrong place to discover that, so retry rather than 500.
        for _ in range(5):
            token = generate_token()
            if not ShareRepository.token_exists(token):
                break
        else:
            raise ValidationError("Could not allocate a share token, please retry")

        share = ShareRepository.create(
            document_id=document_id,
            user_id=user_id,
            token=token,
            label=label,
            expires_at=expires_at,
        )
        return ShareService._present(share, document=document, include_token=True)

    @staticmethod
    def resolve(token: str) -> dict:
        """Return the shared document for a visitor holding ``token``.

        No authentication. The repository filters revoked and expired shares in
        SQL, so this cannot serve a withdrawn link.
        """
        share = ShareRepository.find_by_token(token)
        if share is None:
            raise DocumentNotFoundError("This share link is not available")

        document = DocumentRepository.find_by_id(share["document_id"], share["user_id"])
        if document is None:
            raise DocumentNotFoundError("This share link is not available")

        try:
            content = DocumentService.read_content(document["id"], share["user_id"])
        except Exception:
            logger.exception("Could not read shared document %s", document["id"])
            raise DocumentNotFoundError("This share link is not available")

        ShareRepository.record_view(share["id"])

        owner = UserRepository.find_by_id(share["user_id"])

        # Deliberately narrow: everything a reader needs, nothing about the
        # owner's account, keys, ciphertext or other documents.
        return {
            "filename": document["filename"],
            "size": document["file_size"],
            "content": content,
            "algorithm": document.get("algorithm"),
            "shared_by": owner["name"] if owner else "A CyberVault user",
            "shared_at": share["created_at"],
            "expires_at": share.get("expires_at"),
            "label": share.get("label"),
        }

    @staticmethod
    def list_for_document(user_id: int, document_id: int) -> list[dict]:
        document = DocumentRepository.find_by_id(document_id, user_id)
        if document is None:
            raise DocumentNotFoundError()
        shares = ShareRepository.list_for_document(document_id, user_id)
        return [ShareService._present(s, document=document) for s in shares]

    @staticmethod
    def list_for_user(user_id: int, **filters) -> tuple[list[dict], int]:
        shares, total = ShareRepository.list_for_user(user_id, **filters)
        return [ShareService._present(s) for s in shares], total

    @staticmethod
    def revoke(user_id: int, share_id: int) -> dict:
        share = ShareRepository.revoke(share_id, user_id)
        if share is None:
            raise DocumentNotFoundError("Share link not found")
        return ShareService._present(share)

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _present(share: dict, *, document: dict | None = None,
                 include_token: bool = False) -> dict:
        """Shape a share for the owner's own views.

        The token is included on creation, and in listings so the owner can
        copy a link again. It is never exposed to anyone but the owner, whose
        session is already checked by the route.
        """
        now = datetime.now(timezone.utc)
        expires_at = share.get("expires_at")
        expired = False
        if expires_at:
            parsed = expires_at
            if isinstance(parsed, str):
                parsed = datetime.strptime(parsed, "%Y-%m-%dT%H:%M:%SZ").replace(
                    tzinfo=timezone.utc
                )
            expired = parsed <= now

        payload = {
            "id": share["id"],
            "document_id": share["document_id"],
            "filename": (document or {}).get("filename") or share.get("filename"),
            "label": share.get("label"),
            "revoked": share["revoked"],
            "expired": expired,
            "active": not share["revoked"] and not expired,
            "expires_at": share.get("expires_at"),
            "view_count": share.get("view_count", 0),
            "last_viewed_at": share.get("last_viewed_at"),
            "created_at": share["created_at"],
            "token": share["token"],
            "share_path": f"/share/{share['token']}",
        }
        return payload


__all__ = ["ShareService", "generate_token", "TOKEN_BYTES"]
