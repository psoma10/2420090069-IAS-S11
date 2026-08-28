"""Transfer persistence.

The ``encryption_key`` column exists so the receiving side can decrypt (see
ARCHITECTURE.md section 4), but it is stripped from every dictionary this
module hands back. Only :meth:`stored_key` returns it, and only the transfer
service calls that.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from database.connection import get_cursor
from repositories.base import clamp_limit, clamp_offset, serialize, serialize_many

# The key is deliberately absent from this list so it cannot reach a response
# by accident.
FIELDS = (
    'id, document_id, user_id, sender, receiver, direction, algorithm, '
    'plaintext_size, encrypted_size, status, error_message, stages, '
    'decrypted_at, "timestamp"'
)
FIELDS_WITH_CIPHERTEXT = FIELDS + ", ciphertext"

_SENSITIVE = ("encryption_key",)

VALID_STATUSES = (
    "PENDING", "ENCRYPTING", "TRANSMITTING", "RECEIVED",
    "DECRYPTING", "COMPLETED", "FAILED",
)
VALID_DIRECTIONS = ("CLIENT_TO_SERVER", "SERVER_TO_CLIENT")
TERMINAL_STATUSES = ("COMPLETED", "FAILED")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class TransferRepository:
    """Reads and writes the ``transfers`` table."""

    @staticmethod
    def create(
        *,
        document_id: int,
        user_id: int,
        sender: str,
        receiver: str,
        direction: str,
        algorithm: str,
        encryption_key: str | None = None,
        status: str = "PENDING",
        plaintext_size: int | None = None,
    ) -> dict:
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO transfers (document_id, user_id, sender, receiver, "
                f"direction, algorithm, encryption_key, status, plaintext_size) "
                f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {FIELDS}",
                (document_id, user_id, sender, receiver, direction, algorithm,
                 encryption_key, status, plaintext_size),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def find_by_id(transfer_id: int, user_id: int, *, with_ciphertext: bool = False) -> dict | None:
        """Fetch one transfer owned by ``user_id``. Never returns the key."""
        columns = FIELDS_WITH_CIPHERTEXT if with_ciphertext else FIELDS
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {columns} FROM transfers WHERE id = %s AND user_id = %s",
                (transfer_id, user_id),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def stored_key(transfer_id: int, user_id: int) -> str | None:
        """Return the stored encryption key for a transfer.

        Demo-mode only, called by the transfer service when the receiver
        decrypts without supplying a key. The value must never be placed in a
        response or a log line.
        """
        with get_cursor() as cur:
            cur.execute(
                "SELECT encryption_key FROM transfers WHERE id = %s AND user_id = %s",
                (transfer_id, user_id),
            )
            row = cur.fetchone()
            return row["encryption_key"] if row else None

    @staticmethod
    def list_for_user(
        user_id: int,
        *,
        direction: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        """Return ``(rows, total)``, newest first, without ciphertext or key."""
        clauses = ["t.user_id = %s"]
        params: list = [user_id]

        if direction in VALID_DIRECTIONS:
            clauses.append("t.direction = %s")
            params.append(direction)
        if status in VALID_STATUSES:
            clauses.append("t.status = %s")
            params.append(status)

        where = " AND ".join(clauses)
        limit = clamp_limit(limit)
        offset = clamp_offset(offset)

        prefixed = ", ".join(f"t.{c.strip()}" for c in FIELDS.split(","))

        with get_cursor() as cur:
            cur.execute(f"SELECT count(*) AS n FROM transfers t WHERE {where}", params)
            total = cur.fetchone()["n"]

            # The filename is joined in because every history view shows it,
            # and a per-row lookup from the service would be N+1 queries.
            cur.execute(
                f"SELECT {prefixed}, d.filename "
                f"FROM transfers t JOIN documents d ON d.id = t.document_id "
                f'WHERE {where} ORDER BY t."timestamp" DESC, t.id DESC '
                f"LIMIT %s OFFSET %s",
                (*params, limit, offset),
            )
            return serialize_many(cur.fetchall()), total

    @staticmethod
    def update(transfer_id: int, **fields) -> dict | None:
        """Update an allow-listed set of columns.

        Column names are checked against a fixed set before being placed in
        the statement, so a caller cannot inject a column name.
        """
        allowed = {
            "status", "ciphertext", "encrypted_size", "plaintext_size",
            "error_message", "decrypted_at", "stages",
        }
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return None
        if "status" in updates and updates["status"] not in VALID_STATUSES:
            raise ValueError(f"Invalid transfer status: {updates['status']!r}")

        if "stages" in updates and not isinstance(updates["stages"], str):
            updates["stages"] = json.dumps(updates["stages"])

        assignments = ", ".join(f"{col} = %s" for col in updates)
        with get_cursor() as cur:
            cur.execute(
                f"UPDATE transfers SET {assignments} WHERE id = %s RETURNING {FIELDS}",
                (*updates.values(), transfer_id),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def append_stage(transfer_id: int, stage: str, status: str = "done") -> None:
        """Append one entry to the JSONB stage trace.

        Done in SQL rather than read-modify-write so two concurrent updates
        cannot lose a stage.
        """
        entry = json.dumps([{"stage": stage, "status": status, "at": _now_iso()}])
        with get_cursor() as cur:
            cur.execute(
                "UPDATE transfers SET stages = stages || %s::jsonb WHERE id = %s",
                (entry, transfer_id),
            )

    @staticmethod
    def mark_failed(transfer_id: int, reason: str) -> None:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE transfers SET status = 'FAILED', error_message = %s, "
                "stages = stages || %s::jsonb WHERE id = %s",
                (reason,
                 json.dumps([{"stage": "FAILED", "status": "failed", "at": _now_iso()}]),
                 transfer_id),
            )

    @staticmethod
    def count_for_user(user_id: int, *, status: str | None = None) -> int:
        with get_cursor() as cur:
            if status in VALID_STATUSES:
                cur.execute(
                    "SELECT count(*) AS n FROM transfers WHERE user_id = %s AND status = %s",
                    (user_id, status),
                )
            else:
                cur.execute(
                    "SELECT count(*) AS n FROM transfers WHERE user_id = %s", (user_id,)
                )
            return cur.fetchone()["n"]

    @staticmethod
    def global_counts() -> dict:
        """Server-wide totals for the server monitor screen.

        These are global by design — the monitor represents the server, not
        one user's slice of it.
        """
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT
                    count(*) FILTER (
                        WHERE direction = 'CLIENT_TO_SERVER'
                          AND status IN ('RECEIVED', 'DECRYPTING', 'COMPLETED')
                    ) AS documents_received,
                    count(*) FILTER (
                        WHERE direction = 'SERVER_TO_CLIENT'
                          AND status IN ('RECEIVED', 'DECRYPTING', 'COMPLETED')
                    ) AS documents_sent,
                    count(*) FILTER (WHERE status = 'COMPLETED') AS successful_transfers,
                    count(*) FILTER (WHERE status = 'FAILED')    AS failed_transfers,
                    count(*) AS total_transfers
                FROM transfers
                """
            )
            return dict(cur.fetchone())

    @staticmethod
    def active_client_count(window_minutes: int = 15) -> int:
        """Distinct users with transfer activity in the recent window."""
        with get_cursor() as cur:
            cur.execute(
                'SELECT count(DISTINCT user_id) AS n FROM transfers '
                'WHERE "timestamp" > now() - make_interval(mins => %s)',
                (window_minutes,),
            )
            return cur.fetchone()["n"]

    @staticmethod
    def recent(limit: int = 5) -> list[dict]:
        """Most recent transfers across all users, for the server monitor."""
        limit = clamp_limit(limit, default=5, maximum=50)
        prefixed = ", ".join(f"t.{c.strip()}" for c in FIELDS.split(","))
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {prefixed}, d.filename "
                f"FROM transfers t JOIN documents d ON d.id = t.document_id "
                f'ORDER BY t."timestamp" DESC, t.id DESC LIMIT %s',
                (limit,),
            )
            return serialize_many(cur.fetchall())


__all__ = ["TransferRepository", "FIELDS", "VALID_STATUSES", "VALID_DIRECTIONS"]
