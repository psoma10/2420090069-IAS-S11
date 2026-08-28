"""Dashboard, server-status and activity endpoints (API_CONTRACT.md 3.6–3.8)."""

from __future__ import annotations

from flask import Blueprint, request

from core.auth import current_user_id, login_required
from core.responses import success
from services.stats_service import StatsService

system_bp = Blueprint("system", __name__, url_prefix="/api")


@system_bp.get("/dashboard")
@login_required
def dashboard():
    """One request, every dashboard statistic."""
    return success(StatsService.dashboard(current_user_id()), "Dashboard data retrieved")


@system_bp.get("/server/status")
def server_status():
    """Public: the frontend polls this to show the offline banner before login."""
    return success(StatsService.server_status(), "Server status retrieved")


@system_bp.get("/activity")
@login_required
def activity():
    return success(
        StatsService.activity(
            current_user_id(),
            limit=request.args.get("limit", 50),
            offset=request.args.get("offset", 0),
        ),
        "Activity retrieved",
    )


@system_bp.get("/health")
def health():
    """Liveness probe. Deliberately trivial and free of database access."""
    return success({"status": "ok"}, "CyberVault backend is running")
