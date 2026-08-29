"""Authentication business rules.

Owns registration, login and logout: password hashing, credential
verification, session establishment and the activity trail. Routes call this
service and do nothing else; repositories below it do nothing but SQL.

Passwords are hashed with Werkzeug's ``generate_password_hash``, which defaults
to PBKDF2-SHA256 with a per-password salt (ARCHITECTURE.md section 8). The raw
password and the stored hash never appear in a return value, a log line or an
exception message.
"""

from __future__ import annotations

import logging

from werkzeug.security import check_password_hash, generate_password_hash

from core.auth import clear_session, current_user_id, set_session
from core.errors import InvalidCredentialsError
from repositories.activity_repository import ActivityRepository
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

# Both login failure modes raise with this one message. See _fail_login.
INVALID_CREDENTIALS_MESSAGE = "Invalid email or password"

# A real PBKDF2 hash of a throwaway password, computed once at import. When an
# email is unknown there is no stored hash to check, so the login path checks
# this one instead: the work factor is identical, so the response time does not
# reveal whether the account exists. Computing it at import rather than per
# request keeps that cost off the request path's variance. It is not a secret
# and it is not a credential -- no password verifies against it in practice,
# because _DUMMY_PASSWORD is never accepted as input anywhere.
_DUMMY_PASSWORD = "cybervault-timing-equalizer"
_DUMMY_HASH = generate_password_hash(_DUMMY_PASSWORD)


class AuthService:
    """Registration, login and logout."""

    @staticmethod
    def register(name: str, email: str, password: str) -> dict:
        """Create an account, log it in, and return the public user row.

        Uniqueness is left to the database: ``UserRepository.create`` turns the
        unique-index violation into ``EmailTakenError``, which propagates. A
        pre-flight "does this email exist" SELECT would both race and hand an
        unauthenticated caller an account-existence oracle.
        """
        password_hash = generate_password_hash(password)
        user = UserRepository.create(name, email, password_hash)

        # Registration logs the user in (API_CONTRACT.md section 3.1).
        set_session(user["id"])
        ActivityRepository.record(
            user["id"], "USER_REGISTERED", f"Account created for {user['email']}"
        )
        logger.info("User registered: id=%s", user["id"])
        return user

    @staticmethod
    def login(email: str, password: str) -> dict:
        """Verify credentials, start a session, and return the public user row.

        Unknown email and wrong password are indistinguishable to the caller:
        same error code, same message, and comparable timing (see
        ``_fail_login``). Together those close the account-enumeration hole —
        an identical message with a measurably faster "no such user" path
        would still leak which addresses are registered.
        """
        record = UserRepository.find_by_email_with_hash(email)

        if record is None:
            AuthService._fail_login(password)

        stored_hash = record.pop("password_hash", None)
        if not stored_hash or not check_password_hash(stored_hash, password):
            AuthService._fail_login(password)

        # `record` no longer holds the hash: it was popped above, so the dict
        # returned to the route carries only the PUBLIC_FIELDS columns.
        user = record
        set_session(user["id"])
        ActivityRepository.record(
            user["id"], "USER_LOGIN", f"Signed in as {user['email']}"
        )
        logger.info("User logged in: id=%s", user["id"])
        return user

    @staticmethod
    def logout() -> None:
        """End the session.

        Idempotent by contract (API_CONTRACT.md section 3.1): calling it
        without a session succeeds and does nothing. The activity row is
        recorded before the session is cleared, while the user id is still
        known.
        """
        user_id = current_user_id()
        if user_id is not None:
            ActivityRepository.record(user_id, "USER_LOGOUT", "Signed out")
            logger.info("User logged out: id=%s", user_id)
        clear_session()

    @staticmethod
    def _fail_login(password: str) -> None:
        """Raise ``InvalidCredentialsError`` after equalizing response timing.

        Called on both failure paths. On the unknown-email path there is no
        stored hash to verify, so this burns an equivalent PBKDF2 verification
        against ``_DUMMY_HASH``; on the wrong-password path the real check has
        already run and this one is a small, constant extra. Either way the
        caller cannot time the difference between "no such account" and "wrong
        password".

        The password is passed in only so the dummy check does real work over a
        real input length. It is never logged and never stored.
        """
        check_password_hash(_DUMMY_HASH, password)
        raise InvalidCredentialsError(INVALID_CREDENTIALS_MESSAGE)


__all__ = ["AuthService", "INVALID_CREDENTIALS_MESSAGE"]
