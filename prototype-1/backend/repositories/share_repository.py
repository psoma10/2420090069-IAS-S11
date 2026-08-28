"""Share-link persistence.

The token in a share URL is the only credential a visitor presents, so this
module is careful about two things:

* :meth:`find_by_token` filters out revoked and expired shares **in SQL**, so a
  caller cannot forget to check and accidentally serve a withdrawn document.
* Token lookup is by exact match on a unique index. There is no prefix search,
  no listing by token, and no endpoint that enumerates tokens.
"""

from __future__ import annotations

from database.connection import get_cursor
from repositories.base import clamp_limit, clamp_offset, serialize, serialize_many

FIELDS = (
    "id, document_id, user_id, token, label, revoked, expires_at, "
    "view_count, last_viewed_at, created_at"
)


class ShareRepository:
    """Reads and writes the ``document_shares`` table."""

    @staticmethod
    def create(
        *,
        document_id: int,
        user_id: int,
        token: str,
        label: str | None = None,
        expires_at=None,
    ) -> dict:
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO document_shares (document_id, user_id, token, label, expires_at) "
                f"VALUES (%s, %s, %s, %s, %s) RETURNING {FIELDS}",
                (document_id, user_id, token, label, expires_at),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def find_by_token(token: str) -> dict | None:
        """Look up a *usable* share.

        Revoked and expired shares return ``None``, exactly as a token that
        never existed does — a visitor cannot tell a withdrawn link from a
        fabricated one.
        """
        if not token or not isinstance(token, str):
            return None
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {FIELDS} FROM document_shares "
                f"WHERE token = %s AND revoked = false "
                f"AND (expires_at IS NULL OR expires_at > now())",
                (token,),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def find_by_id(share_id: int, user_id: int) -> dict | None:
        """Owner-scoped lookup, used for revoking."""
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {FIELDS} FROM document_shares WHERE id = %s AND user_id = %s",
                (share_id, user_id),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def list_for_document(document_id: int, user_id: int) -> list[dict]:
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {FIELDS} FROM document_shares "
                f"WHERE document_id = %s AND user_id = %s ORDER BY created_at DESC",
                (document_id, user_id),
            )
            return serialize_many(cur.fetchall())

    @staticmethod
    def list_for_user(user_id: int, *, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        limit = clamp_limit(limit)
        offset = clamp_offset(offset)
        with get_cursor() as cur:
            cur.execute(
                "SELECT count(*) AS n FROM document_shares WHERE user_id = %s", (user_id,)
            )
            total = cur.fetchone()["n"]
            cur.execute(
                f"SELECT s.{', s.'.join(c.strip() for c in FIELDS.split(','))}, "
                f"d.filename, d.file_size "
                f"FROM document_shares s JOIN documents d ON d.id = s.document_id "
                f"WHERE s.user_id = %s ORDER BY s.created_at DESC LIMIT %s OFFSET %s",
                (user_id, limit, offset),
            )
            return serialize_many(cur.fetchall()), total

    @staticmethod
    def revoke(share_id: int, user_id: int) -> dict | None:
        """Withdraw a link. Takes effect on the next request, with no cache to
        wait out, because access is checked in SQL on every view."""
        with get_cursor() as cur:
            cur.execute(
                f"UPDATE document_shares SET revoked = true "
                f"WHERE id = %s AND user_id = %s RETURNING {FIELDS}",
                (share_id, user_id),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def record_view(share_id: int) -> None:
        """Count one view.

        Incremented in SQL rather than read-modify-write so concurrent visits
        cannot lose a count.
        """
        with get_cursor() as cur:
            cur.execute(
                "UPDATE document_shares SET view_count = view_count + 1, "
                "last_viewed_at = now() WHERE id = %s",
                (share_id,),
            )

    @staticmethod
    def token_exists(token: str) -> bool:
        with get_cursor() as cur:
            cur.execute("SELECT 1 FROM document_shares WHERE token = %s", (token,))
            return cur.fetchone() is not None


__all__ = ["ShareRepository", "FIELDS"]
