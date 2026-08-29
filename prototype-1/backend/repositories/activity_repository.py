"""Activity feed persistence (PRD FR-18).

Recording activity must never break the operation that triggered it — a
failure to write a log line is logged and swallowed rather than propagated, so
a successful transfer is not reported as failed because its audit entry could
not be stored.
"""

from __future__ import annotations

import logging

from database.connection import get_cursor
from repositories.base import clamp_limit, clamp_offset, serialize, serialize_many

logger = logging.getLogger(__name__)

FIELDS = "id, user_id, action, message, document_id, transfer_id, created_at"

VALID_ACTIONS = (
    "USER_REGISTERED", "USER_LOGIN", "USER_LOGOUT",
    "DOCUMENT_UPLOADED", "DOCUMENT_ENCRYPTED",
    "TRANSFER_INITIATED", "TRANSFER_RECEIVED",
    "TRANSFER_COMPLETED", "TRANSFER_FAILED",
)


class ActivityRepository:
    """Reads and writes the ``activity_log`` table."""

    @staticmethod
    def record(
        user_id: int,
        action: str,
        message: str,
        *,
        document_id: int | None = None,
        transfer_id: int | None = None,
    ) -> dict | None:
        """Append an activity entry.

        Returns ``None`` and logs a warning if the write fails, because an
        audit-trail failure should not turn a successful user action into an
        error response.
        """
        if action not in VALID_ACTIONS:
            logger.warning("Unknown activity action %r, recording anyway", action)
        try:
            with get_cursor() as cur:
                cur.execute(
                    f"INSERT INTO activity_log (user_id, action, message, "
                    f"document_id, transfer_id) VALUES (%s, %s, %s, %s, %s) "
                    f"RETURNING {FIELDS}",
                    (user_id, action, message, document_id, transfer_id),
                )
                return serialize(cur.fetchone())
        except Exception:
            logger.exception("Failed to record activity %r for user %s", action, user_id)
            return None

    @staticmethod
    def list_for_user(user_id: int, *, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        limit = clamp_limit(limit)
        offset = clamp_offset(offset)
        with get_cursor() as cur:
            cur.execute(
                "SELECT count(*) AS n FROM activity_log WHERE user_id = %s", (user_id,)
            )
            total = cur.fetchone()["n"]
            cur.execute(
                f"SELECT {FIELDS} FROM activity_log WHERE user_id = %s "
                f"ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
                (user_id, limit, offset),
            )
            return serialize_many(cur.fetchall()), total

    @staticmethod
    def recent_for_user(user_id: int, limit: int = 10) -> list[dict]:
        rows, _ = ActivityRepository.list_for_user(
            user_id, limit=clamp_limit(limit, default=10, maximum=50)
        )
        return rows


__all__ = ["ActivityRepository", "VALID_ACTIONS"]
