"""Document persistence.

Every lookup takes ``user_id`` and filters on it, so ownership is enforced at
the data layer and a route cannot forget to check it. A document belonging to
someone else is indistinguishable from one that does not exist — the caller
turns both into ``DOCUMENT_NOT_FOUND``, which avoids confirming that another
user's id is real.
"""

from __future__ import annotations

from database.connection import get_cursor
from repositories.base import clamp_limit, clamp_offset, serialize, serialize_many

# `content` is deliberately absent: a listing of 200 documents should not drag
# 200 document bodies across the wire. Callers that need the text ask for it
# explicitly through find_by_id(..., with_content=True).
FIELDS = (
    "id, user_id, filename, stored_name, file_size, algorithm, "
    "status, direction, created_at"
)
FIELDS_WITH_CONTENT = FIELDS + ", content"

VALID_STATUSES = ("UPLOADED", "ENCRYPTED", "TRANSFERRED")
VALID_DIRECTIONS = ("CLIENT_TO_SERVER", "SERVER_TO_CLIENT")


class DocumentRepository:
    """Reads and writes the ``documents`` table."""

    @staticmethod
    def create(
        *,
        user_id: int,
        filename: str,
        stored_name: str,
        file_size: int,
        algorithm: str | None = None,
        direction: str = "CLIENT_TO_SERVER",
        status: str = "UPLOADED",
        content: str | None = None,
    ) -> dict:
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO documents "
                f"(user_id, filename, stored_name, file_size, algorithm, direction, "
                f"status, content) "
                f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {FIELDS}",
                (user_id, filename, stored_name, file_size, algorithm, direction,
                 status, content),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def find_by_id(document_id: int, user_id: int, *,
                   with_content: bool = False) -> dict | None:
        """Fetch one document owned by ``user_id``, or ``None``.

        ``with_content`` includes the stored text. It is off by default so a
        caller that only needs metadata does not pull the whole document.
        """
        columns = FIELDS_WITH_CONTENT if with_content else FIELDS
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {columns} FROM documents WHERE id = %s AND user_id = %s",
                (document_id, user_id),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def list_for_user(
        user_id: int,
        *,
        direction: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        """Return ``(rows, total)`` for this user, newest first.

        ``total`` counts every row matching the filters, not just the page, so
        the frontend can paginate. Filter values are validated against the
        allow-lists above and then passed as parameters.
        """
        clauses = ["user_id = %s"]
        params: list = [user_id]

        if direction in VALID_DIRECTIONS:
            clauses.append("direction = %s")
            params.append(direction)
        if status in VALID_STATUSES:
            clauses.append("status = %s")
            params.append(status)

        where = " AND ".join(clauses)
        limit = clamp_limit(limit)
        offset = clamp_offset(offset)

        with get_cursor() as cur:
            cur.execute(f"SELECT count(*) AS n FROM documents WHERE {where}", params)
            total = cur.fetchone()["n"]

            cur.execute(
                f"SELECT {FIELDS} FROM documents WHERE {where} "
                f"ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
                (*params, limit, offset),
            )
            return serialize_many(cur.fetchall()), total

    @staticmethod
    def update_status(document_id: int, status: str) -> dict | None:
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid document status: {status!r}")
        with get_cursor() as cur:
            cur.execute(
                f"UPDATE documents SET status = %s WHERE id = %s RETURNING {FIELDS}",
                (status, document_id),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def count_for_user(user_id: int, *, status: str | None = None) -> int:
        with get_cursor() as cur:
            if status in VALID_STATUSES:
                cur.execute(
                    "SELECT count(*) AS n FROM documents WHERE user_id = %s AND status = %s",
                    (user_id, status),
                )
            else:
                cur.execute(
                    "SELECT count(*) AS n FROM documents WHERE user_id = %s", (user_id,)
                )
            return cur.fetchone()["n"]

    @staticmethod
    def delete(document_id: int, user_id: int) -> bool:
        with get_cursor() as cur:
            cur.execute(
                "DELETE FROM documents WHERE id = %s AND user_id = %s",
                (document_id, user_id),
            )
            return cur.rowcount > 0


__all__ = ["DocumentRepository", "FIELDS", "FIELDS_WITH_CONTENT",
           "VALID_STATUSES", "VALID_DIRECTIONS"]
