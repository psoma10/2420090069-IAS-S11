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

# Dev origins the browser may call the API from with credentials. Wildcards are
# not permitted with credentialed requests, so the origin is echoed back only
# when it matches this pattern.
_DEV_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")


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
        if origin and _DEV_ORIGIN.match(origin):
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


app = create_app() if os.environ.get("CYBERVAULT_EAGER_APP") else None


if __name__ == "__main__":
    application = create_app()
    application.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", 5000)),
        debug=os.environ.get("FLASK_ENV") == "development",
    )
