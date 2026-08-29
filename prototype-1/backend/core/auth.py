"""Session authentication.

CyberVault authenticates with a Flask signed session cookie (ARCHITECTURE.md
section 8). The session holds exactly one thing — the user's row id under
``SESSION_USER_KEY``. No name, email or role is cached in the cookie, so a
change to the user row takes effect on the next request and nothing
security-relevant lives client-side where it could be replayed after a change.

The cookie is signed with ``SECRET_KEY``, which proves integrity but not
confidentiality: a client can read the id it contains. That is fine, because
the id alone grants nothing — every protected route re-reads the user from the
database and every resource is filtered by ``user_id``.
"""

from __future__ import annotations

from functools import wraps

from flask import session

from core.errors import UnauthorizedError
from repositories.user_repository import UserRepository

SESSION_USER_KEY = "user_id"


def set_session(user_id: int) -> None:
    """Start an authenticated session for ``user_id``.

    ``session.clear()`` comes first, and that ordering is the point. Flask's
    cookie session has no server-side id to rotate, so the defense against
    session fixation is to guarantee that nothing an unauthenticated visitor
    put in the session survives into the authenticated one. Without the clear,
    a value planted before login — by an earlier flow, or by an attacker who
    got the victim to carry a prepared cookie — would still be trusted
    afterwards, now under the victim's identity.
    """
    session.clear()
    session[SESSION_USER_KEY] = int(user_id)
    session.permanent = True


def clear_session() -> None:
    """End the session. Idempotent: clearing an empty session is a no-op."""
    session.clear()


def current_user_id() -> int | None:
    """Return the session's user id, or ``None`` when unauthenticated."""
    user_id = session.get(SESSION_USER_KEY)
    if user_id is None:
        return None
    try:
        return int(user_id)
    except (TypeError, ValueError):
        # A signed cookie should never carry a non-integer here. If one
        # arrives, treat the session as absent rather than propagating a
        # TypeError into a repository call.
        return None


def current_user() -> dict | None:
    """Return the authenticated user's public row, or ``None``.

    Always a fresh read. A user deleted after their cookie was issued resolves
    to ``None``, so a stale cookie cannot outlive the account.
    """
    user_id = current_user_id()
    if user_id is None:
        return None
    return UserRepository.find_by_id(user_id)


def login_required(fn):
    """Reject unauthenticated requests with ``401 UNAUTHORIZED``.

    Raises rather than returning a response so the app-level ``AppError``
    handler builds the failure envelope — routes and decorators never format
    errors by hand (ARCHITECTURE.md section 7).
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user_id() is None:
            raise UnauthorizedError()
        return fn(*args, **kwargs)

    return wrapper


__all__ = [
    "SESSION_USER_KEY",
    "login_required",
    "current_user_id",
    "current_user",
    "set_session",
    "clear_session",
]
