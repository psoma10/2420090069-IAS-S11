"""Dashboard and server-monitor aggregation.

Exists so the dashboard is one request rather than eight. API_CONTRACT.md
section 3.6 promises the frontend a single call that returns everything the
screen renders, and this is where that promise is kept.

Note the deliberate difference in scope between the two views:

* :meth:`dashboard` is **per user** — your documents, your transfers.
* :meth:`server_status` is **global** — it represents the server itself, which
  is what a monitoring screen is for.
"""

from __future__ import annotations

import time

from crypto import registry
from repositories.activity_repository import ActivityRepository
from repositories.document_repository import DocumentRepository
from repositories.transfer_repository import TransferRepository
from services.transfer_service import TransferService

# Set once at import, so uptime measures this process rather than pretending to
# know when the machine started.
_STARTED_AT = time.time()


class StatsService:
    """Read-only aggregation over the repositories."""

    @staticmethod
    def dashboard(user_id: int) -> dict:
        """Everything the dashboard screen needs, in one payload."""
        documents = DocumentRepository.count_for_user(user_id)
        encrypted = DocumentRepository.count_for_user(user_id, status="ENCRYPTED")
        transferred = DocumentRepository.count_for_user(user_id, status="TRANSFERRED")
        transfers = TransferRepository.count_for_user(user_id)
        completed = TransferRepository.count_for_user(user_id, status="COMPLETED")
        failed = TransferRepository.count_for_user(user_id, status="FAILED")

        recent_transfers, _ = TransferService.list(user_id, limit=5)

        # A user with no transfers has not failed at anything, so 100 is the
        # honest starting value rather than 0.
        finished = completed + failed
        success_rate = round((completed / finished) * 100, 1) if finished else 100.0

        return {
            "documents": documents,
            "transfers": transfers,
            # A document counts as encrypted once it has been through a cipher,
            # whether or not it has since moved on to TRANSFERRED.
            "encrypted_documents": encrypted + transferred,
            "algorithms": len(registry.ALGORITHM_ORDER),
            "successful_transfers": completed,
            "failed_transfers": failed,
            "success_rate": success_rate,
            "server_status": "online",
            "recent_transfers": recent_transfers,
            "recent_activity": ActivityRepository.recent_for_user(user_id, limit=10),
        }

    @staticmethod
    def server_status() -> dict:
        """Global server metrics for the monitor screen.

        Reachability is implicit: if this endpoint answers, the server is up.
        A backend cannot report its own downtime, so the frontend treats a
        failed request as offline.
        """
        counts = TransferRepository.global_counts()
        return {
            "status": "online",
            "connected_clients": TransferRepository.active_client_count(15),
            "documents_received": counts["documents_received"],
            "documents_sent": counts["documents_sent"],
            "successful_transfers": counts["successful_transfers"],
            "failed_transfers": counts["failed_transfers"],
            "total_transfers": counts["total_transfers"],
            "uptime_seconds": int(time.time() - _STARTED_AT),
            "algorithms": len(registry.ALGORITHM_ORDER),
            "recent_transfers": [
                TransferService._present(row) for row in TransferRepository.recent(5)
            ],
        }

    @staticmethod
    def activity(user_id: int, *, limit: int = 50, offset: int = 0) -> dict:
        rows, total = ActivityRepository.list_for_user(user_id, limit=limit, offset=offset)
        return {
            "activity": [
                {
                    "id": row["id"],
                    "action": row["action"],
                    "message": row["message"],
                    "document_id": row.get("document_id"),
                    "transfer_id": row.get("transfer_id"),
                    "at": row["created_at"],
                }
                for row in rows
            ],
            "total": total,
        }


__all__ = ["StatsService"]
