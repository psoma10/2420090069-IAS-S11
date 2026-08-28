"""User persistence.

``password_hash`` never leaves this module in an API-facing dictionary: every
public method returns rows through :func:`serialize` with the hash dropped.
The one exception is :meth:`find_by_email_with_hash`, which the auth service
uses to verify a password and whose name says so out loud.
"""

from __future__ import annotations

from psycopg import errors

from core.errors import EmailTakenError
from database.connection import get_cursor
from repositories.base import serialize

PUBLIC_FIELDS = "id, name, email, created_at"
_SENSITIVE = ("password_hash",)


class UserRepository:
    """Reads and writes the ``users`` table."""

    @staticmethod
    def create(name: str, email: str, password_hash: str) -> dict:
        """Insert a user and return the public row.

        Uniqueness is enforced by the ``idx_users_email_lower`` index rather
        than by a pre-flight SELECT, so two concurrent registrations of the
        same address cannot both succeed.
        """
        try:
            with get_cursor() as cur:
                cur.execute(
                    f"INSERT INTO users (name, email, password_hash) "
                    f"VALUES (%s, %s, %s) RETURNING {PUBLIC_FIELDS}",
                    (name, email, password_hash),
                )
                return serialize(cur.fetchone())
        except errors.UniqueViolation as exc:
            raise EmailTakenError() from exc

    @staticmethod
    def find_by_id(user_id: int) -> dict | None:
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {PUBLIC_FIELDS} FROM users WHERE id = %s", (user_id,)
            )
            return serialize(cur.fetchone())

    @staticmethod
    def find_by_email(email: str) -> dict | None:
        """Public lookup — the password hash is not included."""
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {PUBLIC_FIELDS} FROM users WHERE lower(email) = lower(%s)",
                (email,),
            )
            return serialize(cur.fetchone())

    @staticmethod
    def find_by_email_with_hash(email: str) -> dict | None:
        """Login-only lookup that includes ``password_hash``.

        The caller must verify the password and then discard the hash; it must
        never be placed in a response.
        """
        with get_cursor() as cur:
            cur.execute(
                f"SELECT {PUBLIC_FIELDS}, password_hash FROM users "
                f"WHERE lower(email) = lower(%s)",
                (email,),
            )
            row = cur.fetchone()
            return dict(row) if row else None

    @staticmethod
    def email_exists(email: str) -> bool:
        with get_cursor() as cur:
            cur.execute(
                "SELECT 1 FROM users WHERE lower(email) = lower(%s)", (email,)
            )
            return cur.fetchone() is not None

    @staticmethod
    def count() -> int:
        with get_cursor() as cur:
            cur.execute("SELECT count(*) AS n FROM users")
            return cur.fetchone()["n"]


__all__ = ["UserRepository", "PUBLIC_FIELDS"]
