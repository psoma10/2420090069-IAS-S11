"""Transfer orchestration — the state machine at the centre of the product.

A transfer moves a document from one side to the other, encrypting on the way
out and decrypting on arrival::

    PENDING -> ENCRYPTING -> TRANSMITTING -> RECEIVED -> DECRYPTING -> COMPLETED
                    |             |             |            |
                    +-------------+-------------+------------+---> FAILED

``create`` drives PENDING through RECEIVED synchronously. The intermediate
states are still written down, because the transfer-monitor screen shows real
recorded stages rather than an animation invented by the frontend.

``decrypt`` drives RECEIVED to COMPLETED.

This module contains no cryptography. It asks :class:`CryptoService` to
transform bytes and concerns itself only with sequencing, persistence and
failure handling (ARCHITECTURE.md section 1).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from core.errors import (
    AppError,
    DocumentNotFoundError,
    InvalidStateError,
    TransferFailedError,
    TransferNotFoundError,
    ValidationError,
)
from repositories.activity_repository import ActivityRepository
from repositories.document_repository import DocumentRepository
from repositories.encryption_log_repository import EncryptionLogRepository
from repositories.transfer_repository import TransferRepository
from services.crypto_service import CryptoService
from services.document_service import DocumentService

logger = logging.getLogger(__name__)

DIRECTIONS = {
    "CLIENT_TO_SERVER": ("client", "server"),
    "SERVER_TO_CLIENT": ("server", "client"),
}

# Only a transfer that has arrived can be decrypted. Anything else is either
# still in flight or already finished.
DECRYPTABLE_STATUSES = ("RECEIVED", "DECRYPTING", "COMPLETED")

TRANSFER_ID_PREFIX = "TR-"


def display_id(transfer_id: int) -> str:
    """``123`` becomes ``"TR-000123"`` for the interface."""
    return f"{TRANSFER_ID_PREFIX}{int(transfer_id):06d}"


def parse_transfer_id(value: str | int) -> int:
    """Accept either the numeric id or the ``TR-000123`` display form."""
    if isinstance(value, int):
        return value
    text = str(value).strip().upper()
    if text.startswith(TRANSFER_ID_PREFIX):
        text = text[len(TRANSFER_ID_PREFIX):]
    try:
        return int(text)
    except ValueError as exc:
        raise ValidationError(f"Invalid transfer id: {value!r}") from exc


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TransferService:
    """Creates, advances and completes transfers."""

    @staticmethod
    def create(
        *,
        user_id: int,
        document_id: int,
        algorithm: str,
        key: str,
        direction: str | None = None,
    ) -> dict:
        """Encrypt a document and transmit it.

        Runs the state machine to RECEIVED. Any failure along the way leaves a
        FAILED transfer in the history rather than vanishing, because a
        transfer that went wrong is exactly what the demonstration wants to be
        able to show.
        """
        document = DocumentRepository.find_by_id(document_id, user_id)
        if document is None:
            raise DocumentNotFoundError()

        direction = (direction or document["direction"] or "CLIENT_TO_SERVER").upper()
        if direction not in DIRECTIONS:
            raise ValidationError(
                f"Invalid direction: {direction!r}. "
                f"Expected one of {', '.join(DIRECTIONS)}."
            )
        sender, receiver = DIRECTIONS[direction]

        # Fail on a bad algorithm or key before creating a row, so a typo does
        # not litter the history with a FAILED transfer.
        CryptoService.validate(algorithm, key)

        plaintext = DocumentService.read_content(document_id, user_id)

        transfer = TransferRepository.create(
            document_id=document_id,
            user_id=user_id,
            sender=sender,
            receiver=receiver,
            direction=direction,
            algorithm=algorithm,
            encryption_key=key,
            status="PENDING",
            plaintext_size=len(plaintext.encode("utf-8")),
        )
        transfer_id = transfer["id"]

        ActivityRepository.record(
            user_id, "TRANSFER_INITIATED",
            f"Transfer initiated for {document['filename']}",
            document_id=document_id, transfer_id=transfer_id,
        )

        try:
            # --- encrypt ---------------------------------------------------
            TransferRepository.update(transfer_id, status="ENCRYPTING")
            TransferRepository.append_stage(transfer_id, "ENCRYPTING")
            result = CryptoService.encrypt(algorithm, plaintext, key)

            EncryptionLogRepository.create(
                algorithm=algorithm, operation="ENCRYPT",
                document_id=document_id, transfer_id=transfer_id,
                key_size=result.key_size, encryption_time=result.elapsed_ms,
                input_size=result.input_size, output_size=result.output_size,
            )
            DocumentRepository.update_status(document_id, "ENCRYPTED")
            ActivityRepository.record(
                user_id, "DOCUMENT_ENCRYPTED",
                f"{document['filename']} encrypted with {result.algorithm_label}",
                document_id=document_id, transfer_id=transfer_id,
            )

            # --- transmit --------------------------------------------------
            TransferRepository.update(
                transfer_id,
                status="TRANSMITTING",
                ciphertext=result.output_text,
                encrypted_size=result.output_size,
            )
            TransferRepository.append_stage(transfer_id, "TRANSMITTING")

            # --- receive ---------------------------------------------------
            TransferRepository.update(transfer_id, status="RECEIVED")
            TransferRepository.append_stage(transfer_id, "RECEIVED")
            DocumentRepository.update_status(document_id, "TRANSFERRED")
            ActivityRepository.record(
                user_id, "TRANSFER_RECEIVED",
                f"{receiver.capitalize()} received ciphertext for {document['filename']}",
                document_id=document_id, transfer_id=transfer_id,
            )

        except AppError as exc:
            TransferRepository.mark_failed(transfer_id, exc.message)
            ActivityRepository.record(
                user_id, "TRANSFER_FAILED",
                f"Transfer failed for {document['filename']}: {exc.message}",
                document_id=document_id, transfer_id=transfer_id,
            )
            raise
        except Exception as exc:
            logger.exception("Unexpected failure during transfer %s", transfer_id)
            TransferRepository.mark_failed(transfer_id, "Unexpected transfer failure")
            ActivityRepository.record(
                user_id, "TRANSFER_FAILED",
                f"Transfer failed for {document['filename']}",
                document_id=document_id, transfer_id=transfer_id,
            )
            raise TransferFailedError() from exc

        final = TransferRepository.find_by_id(transfer_id, user_id)
        return TransferService._present(
            final,
            filename=document["filename"],
            encryption_time_ms=result.elapsed_ms,
        )

    @staticmethod
    def decrypt(
        *,
        user_id: int,
        transfer_id: int,
        key: str | None = None,
    ) -> dict:
        """Decrypt a received transfer and complete it.

        With no ``key`` the stored one is used (demo mode, ARCHITECTURE.md
        section 4). Supplying a key checks that specific key instead; a wrong
        one fails without advancing the transfer, so the operator can retry —
        which is precisely the wrong-key error the PRD asks to demonstrate.
        """
        transfer = TransferRepository.find_by_id(transfer_id, user_id, with_ciphertext=True)
        if transfer is None:
            raise TransferNotFoundError()

        if transfer["status"] not in DECRYPTABLE_STATUSES:
            raise InvalidStateError(
                f"Transfer {display_id(transfer_id)} is {transfer['status']} and "
                f"cannot be decrypted"
            )
        if not transfer.get("ciphertext"):
            raise InvalidStateError(
                f"Transfer {display_id(transfer_id)} carries no ciphertext"
            )

        effective_key = key or TransferRepository.stored_key(transfer_id, user_id)
        if not effective_key:
            raise ValidationError(
                "No key was supplied and this transfer has no stored key"
            )

        document = DocumentRepository.find_by_id(transfer["document_id"], user_id)
        filename = document["filename"] if document else "document"

        TransferRepository.update(transfer_id, status="DECRYPTING")
        TransferRepository.append_stage(transfer_id, "DECRYPTING")

        try:
            result = CryptoService.decrypt(
                transfer["algorithm"], transfer["ciphertext"], effective_key
            )
        except AppError as exc:
            # Return to RECEIVED rather than FAILED: the ciphertext is intact
            # and a correct key would still work, so the operator can try again.
            TransferRepository.update(transfer_id, status="RECEIVED")
            TransferRepository.append_stage(transfer_id, "DECRYPTING", status="failed")
            ActivityRepository.record(
                user_id, "TRANSFER_FAILED",
                f"Decryption failed for {filename}",
                document_id=transfer["document_id"], transfer_id=transfer_id,
            )
            raise

        EncryptionLogRepository.create(
            algorithm=transfer["algorithm"], operation="DECRYPT",
            document_id=transfer["document_id"], transfer_id=transfer_id,
            key_size=result.key_size, decryption_time=result.elapsed_ms,
            input_size=result.input_size, output_size=result.output_size,
        )

        TransferRepository.update(
            transfer_id, status="COMPLETED", decrypted_at=_now()
        )
        TransferRepository.append_stage(transfer_id, "COMPLETED")
        ActivityRepository.record(
            user_id, "TRANSFER_COMPLETED",
            f"{filename} decrypted successfully",
            document_id=transfer["document_id"], transfer_id=transfer_id,
        )

        return {
            "transfer_id": display_id(transfer_id),
            "id": transfer_id,
            "status": "COMPLETED",
            "algorithm": transfer["algorithm"],
            "algorithm_label": result.algorithm_label,
            "filename": filename,
            "plaintext": result.output_text,
            "plaintext_size": result.output_size,
            "decryption_time_ms": result.elapsed_ms,
            "integrity_verified": CryptoService.integrity_verified(transfer["algorithm"]),
            "stages": TransferService._stages(transfer_id, user_id),
        }

    @staticmethod
    def get(user_id: int, transfer_id: int) -> dict:
        """Full transfer detail, including ciphertext and recovered plaintext."""
        transfer = TransferRepository.find_by_id(transfer_id, user_id, with_ciphertext=True)
        if transfer is None:
            raise TransferNotFoundError()

        document = DocumentRepository.find_by_id(transfer["document_id"], user_id)
        payload = TransferService._present(
            transfer, filename=document["filename"] if document else None
        )

        ciphertext = transfer.get("ciphertext") or ""
        payload["ciphertext"] = ciphertext
        payload["ciphertext_preview"] = ciphertext[:2000]

        if transfer["status"] == "COMPLETED":
            # Recovered on demand from the stored ciphertext rather than kept
            # as a second plaintext copy on disk: one authoritative artifact,
            # and nothing extra to protect.
            payload["decrypted_content"] = TransferService._recover(transfer, user_id)

        logs = EncryptionLogRepository.list_for_transfer(transfer_id)
        payload["encryption_log"] = logs
        return payload

    @staticmethod
    def list(user_id: int, **filters) -> tuple[list[dict], int]:
        rows, total = TransferRepository.list_for_user(user_id, **filters)
        return [TransferService._present(row) for row in rows], total

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _recover(transfer: dict, user_id: int) -> str | None:
        """Re-derive the plaintext of a completed transfer.

        Returns ``None`` rather than raising if it cannot be recovered, since
        this only enriches a detail view and must not fail the whole request.
        """
        key = TransferRepository.stored_key(transfer["id"], user_id)
        if not key or not transfer.get("ciphertext"):
            return None
        try:
            return CryptoService.decrypt(
                transfer["algorithm"], transfer["ciphertext"], key
            ).output_text
        except AppError:
            logger.warning("Could not recover plaintext for transfer %s", transfer["id"])
            return None

    @staticmethod
    def _stages(transfer_id: int, user_id: int) -> list:
        row = TransferRepository.find_by_id(transfer_id, user_id)
        return row.get("stages", []) if row else []

    @staticmethod
    def _present(transfer: dict, *, filename: str | None = None,
                 encryption_time_ms: float | None = None) -> dict:
        """Shape a transfer row the way API_CONTRACT.md section 3.5 promises.

        The encryption key is already absent from the repository layer; this
        method never reintroduces it.
        """
        payload = {
            "transfer_id": display_id(transfer["id"]),
            "id": transfer["id"],
            "document_id": transfer["document_id"],
            "filename": filename or transfer.get("filename"),
            "status": transfer["status"],
            "algorithm": transfer["algorithm"],
            "direction": transfer["direction"],
            "sender": transfer["sender"],
            "receiver": transfer["receiver"],
            "plaintext_size": transfer.get("plaintext_size"),
            "encrypted_size": transfer.get("encrypted_size"),
            "stages": transfer.get("stages", []),
            "error_message": transfer.get("error_message"),
            "timestamp": transfer.get("timestamp"),
            "decrypted_at": transfer.get("decrypted_at"),
        }
        if encryption_time_ms is not None:
            payload["encryption_time_ms"] = encryption_time_ms
        return payload


__all__ = ["TransferService", "display_id", "parse_transfer_id", "DIRECTIONS"]
