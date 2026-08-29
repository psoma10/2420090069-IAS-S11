"""CyberVault backend — application factory.

Creates the Flask app, opens the database pool, applies the schema, registers
every blueprint and installs the error handlers that turn exceptions into the
failure envelope from API_CONTRACT.md section 1.

Run it with::

    ./.venv/bin/python app.py

The API is JSON only. The frontend is a separate application that consumes
these endpoints (API_CONTRACT.md section 8).
"""

from __future__ import annotations

import logging
import os
import re

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

from config import Config
from core.errors import AppError
from database.connection import apply_schema, init_pool

logger = logging.getLogger(__name__)

# Origins the browser may call the API from with credentials. Wildcards are
# not permitted with credentialed requests, so the origin is echoed back only
# when it matches one of these.
_DEV_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")

# Deployed frontend origins, comma-separated, e.g.
#   FRONTEND_ORIGINS=https://frontend-rouge-six-16.vercel.app,https://cybervault.example.com
# Vercel preview deployments get a new subdomain per branch/PR, so an exact
# host list — not a hardcoded single URL — is the only thing that scales.
_ALLOWED_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.environ.get("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
}


def _origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if _DEV_ORIGIN.match(origin):
        return True
    return origin.rstrip("/") in _ALLOWED_ORIGINS


def _configure_logging(app: Flask) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    if app.config.get("SECRET_KEY_IS_EPHEMERAL"):
        logger.warning(
            "SECRET_KEY is not set, so a temporary one was generated. "
            "Sessions will not survive a restart. Set SECRET_KEY in .env."
        )


def _register_blueprints(app: Flask) -> None:
    from routes.auth import auth_bp
    from routes.documents import documents_bp
    from routes.encryption import encryption_bp
    from routes.shares import shares_bp
    from routes.system import system_bp
    from routes.transfers import transfers_bp

    for blueprint in (auth_bp, documents_bp, encryption_bp,
                      transfers_bp, shares_bp, system_bp):
        app.register_blueprint(blueprint)


def _register_error_handlers(app: Flask) -> None:
    """Every error leaves as the failure envelope, never as Flask's HTML."""

    @app.errorhandler(AppError)
    def handle_app_error(error: AppError):
        # Expected failures: the message is written to be shown to a user.
        return jsonify(error.to_dict()), error.status_code

    @app.errorhandler(RequestEntityTooLarge)
    def handle_too_large(error):
        # Flask's own ceiling, hit before the upload route can measure the file
        # and report actual against allowed size.
        return jsonify({
            "success": False,
            "message": "The uploaded file is too large",
            "error": {"code": "FILE_TOO_LARGE"},
        }), 413

    @app.errorhandler(404)
    def handle_not_found(error):
        return jsonify({
            "success": False,
            "message": "The requested endpoint does not exist",
            "error": {"code": "NOT_FOUND"},
        }), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        return jsonify({
            "success": False,
            "message": "That method is not allowed on this endpoint",
            "error": {"code": "METHOD_NOT_ALLOWED"},
        }), 405

    @app.errorhandler(HTTPException)
    def handle_http_exception(error: HTTPException):
        return jsonify({
            "success": False,
            "message": error.description or "Request failed",
            "error": {"code": "HTTP_ERROR"},
        }), error.code or 500

    @app.errorhandler(Exception)
    def handle_unexpected(error: Exception):
        # Anything reaching here is a bug. It is logged with a traceback and
        # reported generically: internal paths and stack traces never reach a
        # client (ARCHITECTURE.md section 7).
        logger.exception("Unhandled error on %s %s", request.method, request.path)
        return jsonify({
            "success": False,
            "message": "An unexpected error occurred",
            "error": {"code": "INTERNAL_ERROR"},
        }), 500


def _register_cors(app: Flask) -> None:
    """Allow the separately-served frontend to call the API with cookies.

    Credentialed CORS forbids ``*``, so the request's own origin is echoed back
    only when it is a local development origin.
    """

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "")
        if _origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, DELETE, OPTIONS"
            )
            response.headers["Vary"] = "Origin"
        return response

    @app.route("/api/<path:_any>", methods=["OPTIONS"])
    def preflight(_any):
        return ("", 204)


def create_app(config_object: type = Config, *, init_db: bool = True) -> Flask:
    """Build a configured application.

    ``init_db=False`` lets a test build an app without touching the database.
    """
    app = Flask(__name__)
    app.config.from_object(config_object)

    _configure_logging(app)

    for directory in config_object.storage_dirs():
        directory.mkdir(parents=True, exist_ok=True)

    if init_db:
        init_pool(app.config["DATABASE_URL"])
        apply_schema()

    _register_blueprints(app)
    _register_error_handlers(app)
    _register_cors(app)

    @app.get("/")
    def index():
        return jsonify({
            "success": True,
            "message": "CyberVault API",
            "data": {
                "name": "CyberVault",
                "description": "Secure client-server document exchange",
                "api_base": "/api",
                "docs": "See API_CONTRACT.md",
            },
        })

    logger.info("CyberVault backend ready with %d routes", len(list(app.url_map.iter_rules())))
    return app


def wsgi_app():
    """Entry point for a WSGI server: ``gunicorn "app:wsgi_app()"``.

    Building the app inside a function rather than at import time means each
    gunicorn worker opens its own database pool after forking, instead of
    inheriting a parent's sockets — shared connections across forked workers
    fail in ways that look random.
    """
    return create_app()


# A module-level `app`, so the conventional `gunicorn app:app` works too.
#
# Built lazily on first attribute access rather than at import: pytest imports
# this module to reach create_app(), and building an application there would
# open a second database pool the tests never use. A WSGI server looking up
# `app` gets a real application; an importer that never touches it pays nothing.
class _LazyApp:
    """Stands in for the application until something actually uses it."""

    def __init__(self):
        self._app = None

    def _resolve(self) -> Flask:
        if self._app is None:
            self._app = create_app()
        return self._app

    def __call__(self, environ, start_response):
        return self._resolve()(environ, start_response)

    def __getattr__(self, name):
        return getattr(self._resolve(), name)


app = _LazyApp()


if __name__ == "__main__":
    application = create_app()

    # The auto-reloader is genuinely useful while developing; the interactive
    # debugger is not worth its cost. It renders a traceback with source and
    # local variables on any unhandled error — bypassing the JSON error handler
    # entirely — and its console is remote code execution for anyone who can
    # reach it. So reloading is opt-in via FLASK_ENV, and `use_debugger` is
    # pinned False rather than left to follow `debug`.
    development = os.environ.get("FLASK_ENV") == "development"

    host = os.environ.get("HOST", "127.0.0.1")
    if development and host not in ("127.0.0.1", "localhost"):
        # Binding a development server to a public interface is how a local
        # convenience becomes an exposed service.
        raise SystemExit(
            f"Refusing to serve on {host} with FLASK_ENV=development. "
            "Unset FLASK_ENV or bind to 127.0.0.1."
        )

    application.run(
        host=host,
        port=int(os.environ.get("PORT", 5000)),
        debug=False,
        use_reloader=development,
        use_debugger=False,
    )
