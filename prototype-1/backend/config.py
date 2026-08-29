"""Application configuration.

Secrets are read from the environment (loaded from a gitignored ``.env`` in
development). Nothing sensitive is hardcoded here, so this file is safe to
commit and safe to read in the project documentation.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")


class Config:
    """Base configuration shared by every environment."""

    # --- secrets -----------------------------------------------------------
    # A generated fallback keeps development frictionless, but it changes on
    # every restart (invalidating sessions) so it can never be mistaken for a
    # production value.
    SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
    SECRET_KEY_IS_EPHEMERAL = "SECRET_KEY" not in os.environ

    DATABASE_URL = os.environ.get("DATABASE_URL", "")

    # --- file transfer limits (PRD FR-03 / FR-10) --------------------------
    MAX_CLIENT_UPLOAD_BYTES = 10 * 1024   # 10 KB, client -> server
    MAX_SERVER_UPLOAD_BYTES = 5 * 1024    # 5 KB,  server -> client
    ALLOWED_EXTENSIONS = frozenset({".txt"})

    # Flask's own ceiling. Set above the largest per-direction limit so that
    # oversized uploads reach our handler and receive a FILE_TOO_LARGE code
    # with real sizes, rather than Flask's bare 413 HTML page.
    MAX_CONTENT_LENGTH = 1 * 1024 * 1024

    # --- storage -----------------------------------------------------------
    STORAGE_DIR = BASE_DIR / "storage"
    UPLOAD_DIR = STORAGE_DIR / "uploads"
    ENCRYPTED_DIR = STORAGE_DIR / "encrypted"
    DECRYPTED_DIR = STORAGE_DIR / "decrypted"

    # --- session -----------------------------------------------------------
    SESSION_COOKIE_HTTPONLY = True

    # Deployed, the frontend and backend sit on different sites (Vercel and
    # Render), so the session cookie travels cross-site and a browser will only
    # keep it with SameSite=None *and* Secure. Locally both sides are
    # 127.0.0.1 over plain HTTP, where Secure would stop the cookie being
    # stored at all — so this follows the environment rather than being pinned
    # to whichever case was tested last.
    #
    # SameSite=None removes the browser's own CSRF protection. What replaces it
    # is the JSON-only rule in core/validation.py: a cross-origin HTML form
    # cannot send application/json, and any origin not named in
    # FRONTEND_ORIGINS is refused by CORS before a response is readable.
    _CROSS_SITE = bool(os.environ.get("FRONTEND_ORIGINS", "").strip())

    SESSION_COOKIE_SAMESITE = "None" if _CROSS_SITE else "Lax"
    SESSION_COOKIE_SECURE = _CROSS_SITE
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 8

    # --- misc --------------------------------------------------------------
    ACTIVE_CLIENT_WINDOW_MINUTES = 15
    JSON_SORT_KEYS = False
    TESTING = False

    @classmethod
    def storage_dirs(cls) -> tuple[Path, ...]:
        return (cls.UPLOAD_DIR, cls.ENCRYPTED_DIR, cls.DECRYPTED_DIR)


class TestConfig(Config):
    """Configuration for the automated test suite."""

    TESTING = True
    SECRET_KEY = "test-secret-key"
    DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or Config.DATABASE_URL
