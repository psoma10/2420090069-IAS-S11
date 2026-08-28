"""Shared input validators.

Every validator raises :class:`core.errors.ValidationError` with a message that
is safe to show a user and specific enough to act on. Validation happens at the
system boundary — a route parses the request, hands the raw values here, and
everything below the route layer can assume clean input.

Validators return the *normalized* value rather than mutating in place, so a
caller always works with the canonical form (lowercased email, stripped name).
"""

from __future__ import annotations

from typing import Any

from core.errors import ValidationError

# An address longer than this is not a real address; the cap also keeps a
# pathological body from reaching the database or the password hasher.
MAX_EMAIL_LENGTH = 254
MIN_PASSWORD_LENGTH = 8
# Werkzeug hashes the full password, so an unbounded one is a cheap DoS.
MAX_PASSWORD_LENGTH = 1024
MAX_NAME_LENGTH = 80


def require_json(request, *, allow_empty: bool = False) -> dict:
    """Return the JSON body of a request, or raise ``VALIDATION_ERROR``.

    API_CONTRACT.md section 2 makes JSON-only bodies part of the CSRF story:
    the API accepts ``application/json`` and rejects
    ``application/x-www-form-urlencoded`` on state-changing routes, so an
    HTML form on another origin cannot drive this API. That rejection is
    enforced here rather than route by route.

    ``silent=True`` is deliberate — Flask's own 400 for malformed JSON would
    bypass the failure envelope, so the parse failure is converted into an
    ``AppError`` the app-level handler knows how to format.
    """
    if not request.is_json:
        # Some routes take an optional body (POST .../decrypt with no key).
        # A completely absent body is fine there; a form-encoded one is not,
        # since that would reopen the CSRF hole this function exists to close.
        if allow_empty and not request.get_data():
            return {}
        raise ValidationError(
            "Request body must be application/json"
        )
    data = request.get_json(silent=True)
    if data is None:
        if allow_empty:
            return {}
        raise ValidationError("Request body must be valid JSON")
    if not isinstance(data, dict):
        raise ValidationError("Request body must be a JSON object")
    return data


def require_fields(data: dict, *names: str) -> None:
    """Assert that every named field is present and not empty.

    Reports *all* missing fields at once so a client fixing a form does not
    have to round-trip once per field.
    """
    missing = [
        name for name in names
        if data.get(name) is None
        or (isinstance(data.get(name), str) and not data[name].strip())
    ]
    if missing:
        raise ValidationError(
            f"Missing required field{'s' if len(missing) > 1 else ''}: "
            + ", ".join(missing)
        )


def clean_str(value: Any, max_len: int, *, field: str = "value") -> str:
    """Coerce a value to a stripped string and enforce a length ceiling."""
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be text")
    cleaned = value.strip()
    if len(cleaned) > max_len:
        raise ValidationError(
            f"{field} must be at most {max_len} characters"
        )
    return cleaned


def validate_email(value: Any) -> str:
    """Normalize and check an email address.

    Deliberately permissive: a single ``@`` with something either side, plus a
    length ceiling. Aggressive regexes reject valid addresses, and the real
    proof of an address is delivery, not a pattern. Lowercasing matches the
    ``idx_users_email_lower`` unique index so Ada@x.com and ada@x.com are one
    account.
    """
    email = clean_str(value, MAX_EMAIL_LENGTH, field="Email").lower()
    if not email:
        raise ValidationError("Email is required")
    local, sep, domain = email.partition("@")
    if not sep or not local or not domain or "@" in domain:
        raise ValidationError("Email must be a valid address containing @")
    if any(ch.isspace() for ch in email):
        raise ValidationError("Email must not contain spaces")
    return email


def validate_password(value: Any) -> str:
    """Check password length. The raw value is never logged or returned."""
    if not isinstance(value, str):
        raise ValidationError("Password must be text")
    # Not stripped: leading and trailing spaces are legitimate password
    # characters, and silently trimming them would break the user's login.
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )
    if len(value) > MAX_PASSWORD_LENGTH:
        raise ValidationError(
            f"Password must be at most {MAX_PASSWORD_LENGTH} characters"
        )
    return value


def validate_name(value: Any) -> str:
    """Check a display name: 1–80 characters once stripped, not blank."""
    name = clean_str(value, MAX_NAME_LENGTH, field="Name")
    if not name:
        raise ValidationError("Name must not be blank")
    return name


__all__ = [
    "require_json",
    "require_fields",
    "clean_str",
    "validate_email",
    "validate_password",
    "validate_name",
    "MIN_PASSWORD_LENGTH",
    "MAX_NAME_LENGTH",
    "MAX_EMAIL_LENGTH",
]
