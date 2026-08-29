"""Auth endpoints — ``/api/auth/*`` (API_CONTRACT.md section 3.1).

These handlers are deliberately thin: parse, validate, call the service, wrap
the result in the success envelope. No SQL, no crypto, no hand-built error
bodies — failures are raised as ``AppError`` subclasses and the app-level
handler formats them (ARCHITECTURE.md sections 1 and 7).
"""

from __future__ import annotations

from flask import Blueprint, request

from core import responses
from core.auth import current_user, login_required
from core.errors import UnauthorizedError
from core.validation import (
    require_fields,
    require_json,
    validate_email,
    validate_name,
    validate_password,
)
from services.auth_service import AuthService

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
    """Create an account and log it in. ``201`` with the new user."""
    data = require_json(request)
    require_fields(data, "name", "email", "password")

    name = validate_name(data["name"])
    email = validate_email(data["email"])
    password = validate_password(data["password"])

    user = AuthService.register(name, email, password)
    return responses.success(
        data={"user": user},
        message="Account created successfully",
        status=201,
    )


@auth_bp.post("/login")
def login():
    """Verify credentials and start a session. ``200`` with the user."""
    data = require_json(request)
    require_fields(data, "email", "password")

    # Login normalizes the email the same way registration does so a
    # differently-cased address still matches, but it does not apply the
    # format or length rules: a malformed address is a failed login
    # (INVALID_CREDENTIALS), not a validation error. Reporting the difference
    # would tell an attacker which addresses are even worth trying.
    email = str(data["email"]).strip().lower()
    password = data["password"]
    if not isinstance(password, str):
        password = str(password)

    user = AuthService.login(email, password)
    return responses.success(data={"user": user}, message="Login successful")


@auth_bp.post("/logout")
def logout():
    """End the session. Safe to call when already logged out."""
    AuthService.logout()
    return responses.success(message="Logged out successfully")


@auth_bp.get("/me")
@login_required
def me():
    """Return the authenticated user. ``401`` without a session."""
    user = current_user()
    if user is None:
        # The session carried an id whose row no longer exists — a deleted
        # account holding a still-valid cookie. Treated as unauthenticated.
        raise UnauthorizedError()
    return responses.success(data={"user": user}, message="OK")


__all__ = ["auth_bp"]
