"""Encryption/decryption timing records.

Feeds the encryption-details panel (PRD FR-12) and gives the algorithm
comparison page real measured numbers instead of invented ones.
"""

from __future__ import annotations

from database.connection import get_cursor
from repositories.base import clamp_limit, serialize, serialize_many

FIELDS = (
    "id, document_id, transfer_id, algorithm, key_size, operation, "
    "encryption_time, decryption_time, input_size, output_size, created_at"
)

VALID_OPERATIONS = ("ENCRYPT", "DECRYPT")


class EncryptionLogRepository:
    """Reads and writes the ``encryption_logs`` table."""

    @staticmethod
    def create(
        *,
        algorithm: str,
        operation: str,
        document_id: int | None = None,
        transfer_id: int | None = None,
        key_size: int | None = None,
        encryption_time: float | None = None,
        decryption_time: float | None = None,
        input_size: int | None = None,
        output_size: int | None = None,
    ) -> dict:
        if operation not in VALID_OPERATIONS:
            raise ValueError(f"Invalid operation: {operation!r}")
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO encryption_logs (document_id, transfer_id, algorithm, "
                f"key_size, operation, encryption_time, decryption_time, "
                f"input_size, output_size) "
                f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {FIELDS}",
                (document_id, transfer_id, algorithm, key_size, operation,
                 encryption_time, decryption_time, input_size, output_size),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def list_for_document(document_id: int, limit: int = 50) -> list[dict]:
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {FIELDS} FROM encryption_logs WHERE document_id = %s "
                f"ORDER BY created_at DESC LIMIT %s",
                (document_id, clamp_limit(limit)),
            )
            return serialize_many(cur.fetchall())

    @staticmethod
    def list_for_transfer(transfer_id: int) -> list[dict]:
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {FIELDS} FROM encryption_logs WHERE transfer_id = %s "
                f"ORDER BY created_at ASC",
                (transfer_id,),
            )
            return serialize_many(cur.fetchall())

    @staticmethod
    def algorithm_averages() -> list[dict]:
        """Mean encrypt/decrypt time per algorithm, for the comparison page."""
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT algorithm,
                       count(*) AS samples,
                       round(avg(encryption_time)::numeric, 3) AS avg_encryption_time,
                       round(avg(decryption_time)::numeric, 3) AS avg_decryption_time
                FROM encryption_logs
                GROUP BY algorithm
                ORDER BY algorithm
                """
            )
            rows = cur.fetchall()
        return [
            {
                "algorithm": r["algorithm"],
                "samples": r["samples"],
                "avg_encryption_time": float(r["avg_encryption_time"])
                if r["avg_encryption_time"] is not None else None,
                "avg_decryption_time": float(r["avg_decryption_time"])
                if r["avg_decryption_time"] is not None else None,
            }
            for r in rows
        ]


__all__ = ["EncryptionLogRepository", "VALID_OPERATIONS"]
