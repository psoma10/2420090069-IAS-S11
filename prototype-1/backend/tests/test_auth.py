"""Integration tests for the auth slice.

These run against a real Flask test client and the real Neon database. Nothing
is mocked — not the repositories, not the connection, not the password hasher —
so a passing run is evidence the whole path works: HTTP -> route -> validation
-> service -> repository -> Postgres -> response envelope.

Isolation comes from unique emails (a fresh uuid4 per test), not from wiping
tables. ``truncate_all()`` is never called here: other agents are working
against the same database concurrently and truncating would destroy their data.
Every row these tests create is namespaced under the ``@authtest.example.com``
domain, so they collide with nothing.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from flask import Flask, request

# The backend is a plain directory tree, not an installed package — the same
# path shim the crypto tests use.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from config import Config  # noqa: E402
from core.auth import login_required  # noqa: E402
from core.errors import AppError  # noqa: E402
from core.validation import require_json  # noqa: E402
from database.connection import apply_schema, init_pool, pool_is_open  # noqa: E402
from routes.auth import auth_bp  # noqa: E402

# Every response body seen in this module, appended by `post_json`/`get_json`
# and swept at the end of the session by `test_no_password_hash_anywhere`.
ALL_RESPONSE_BODIES: list[str] = []


# --------------------------------------------------------------------------
# Fixtures — a minimal app carrying only the auth blueprint.
# --------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app() -> Flask:
    """A minimal Flask app with only auth_bp and the AppError handler.

    Deliberately not `app.py`'s `create_app`: this slice must stand up on its
    own, which proves the blueprint carries no hidden dependency on routes or
    services owned elsewhere.
    """
    flask_app = Flask(__name__)
    flask_app.config.from_object(Config)
    flask_app.config["TESTING"] = True
    flask_app.config["SECRET_KEY"] = "auth-slice-test-secret"

    flask_app.register_blueprint(auth_bp)

    @flask_app.errorhandler(AppError)
    def handle_app_error(exc: AppError):
        return exc.to_dict(), exc.status_code

    if not pool_is_open():
        init_pool(Config.DATABASE_URL)
    apply_schema()

    return flask_app


@pytest.fixture
def client(app: Flask):
    """A fresh test client — and so a fresh cookie jar — per test."""
    return app.test_client()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def unique_email(prefix: str = "user") -> str:
    """An address no other test or existing row can be using."""
    return f"{prefix}-{uuid4().hex}@authtest.example.com"


def _record(response) -> None:
    ALL_RESPONSE_BODIES.append(response.get_data(as_text=True))


def post_json(client, path: str, payload: dict | None = None):
    response = client.post(
        path,
        data=json.dumps(payload if payload is not None else {}),
        content_type="application/json",
    )
    _record(response)
    return response


def get(client, path: str):
    response = client.get(path)
    _record(response)
    return response


def register(client, *, name="Ada Lovelace", email=None, password="hunter2hunter2"):
    return post_json(
        client,
        "/api/auth/register",
        {"name": name, "email": email or unique_email(), "password": password},
    )


def body(response) -> dict:
    return response.get_json()


def has_session_cookie(client) -> bool:
    """True when the client's jar holds a non-empty Flask session cookie."""
    cookie = client.get_cookie("session")
    return cookie is not None and bool(cookie.value)


# --------------------------------------------------------------------------
# Register — success
# --------------------------------------------------------------------------

def test_register_returns_201_with_envelope_and_user(client):
    email = unique_email()
    response = register(client, name="Ada Lovelace", email=email)

    assert response.status_code == 201
    payload = body(response)
    assert payload["success"] is True
    assert payload["message"] == "Account created successfully"

    user = payload["data"]["user"]
    assert user["name"] == "Ada Lovelace"
    assert user["email"] == email
    assert isinstance(user["id"], int)
    # API_CONTRACT.md section 6: ISO-8601 UTC with a trailing Z.
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", user["created_at"])


def test_register_response_contains_no_password_material(client):
    response = register(client, password="supersecret123")
    raw = response.get_data(as_text=True)

    assert "password_hash" not in raw
    assert "supersecret123" not in raw
    assert "pbkdf2" not in raw.lower()
    assert set(body(response)["data"]["user"]) == {"id", "name", "email", "created_at"}


def test_register_logs_the_user_in(client):
    """Section 3.1: the session cookie is set on the 201."""
    register(client)
    assert has_session_cookie(client)

    me = get(client, "/api/auth/me")
    assert me.status_code == 200


def test_register_normalizes_email_to_lowercase(client):
    email = unique_email()
    response = register(client, email=email.upper())

    assert response.status_code == 201
    assert body(response)["data"]["user"]["email"] == email.lower()


def test_register_strips_surrounding_whitespace_from_name(client):
    response = register(client, name="  Grace Hopper  ")
    assert body(response)["data"]["user"]["name"] == "Grace Hopper"


# --------------------------------------------------------------------------
# Register — duplicate email
# --------------------------------------------------------------------------

def test_register_duplicate_email_returns_409(client):
    email = unique_email()
    assert register(client, email=email).status_code == 201

    response = register(client, email=email)
    assert response.status_code == 409
    payload = body(response)
    assert payload["success"] is False
    assert payload["error"]["code"] == "EMAIL_TAKEN"
    assert "data" not in payload


def test_register_duplicate_email_differing_case_returns_409(client):
    """The unique index is on lower(email), so case must not create a second row."""
    email = unique_email()
    assert register(client, email=email).status_code == 201

    response = register(client, email=email.upper())
    assert response.status_code == 409
    assert body(response)["error"]["code"] == "EMAIL_TAKEN"


# --------------------------------------------------------------------------
# Register — validation
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "payload, reason",
    [
        ({"email": "x@example.com", "password": "hunter2hunter2"}, "missing name"),
        ({"name": "Ada", "password": "hunter2hunter2"}, "missing email"),
        ({"name": "Ada", "email": "x@example.com"}, "missing password"),
        ({}, "empty body"),
    ],
)
def test_register_missing_fields_returns_400(client, payload, reason):
    response = post_json(client, "/api/auth/register", payload)
    assert response.status_code == 400, reason
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "email",
    ["not-an-email", "@example.com", "ada@", "ada@@example.com", "ada example@x.com", ""],
)
def test_register_bad_email_returns_400(client, email):
    response = post_json(
        client,
        "/api/auth/register",
        {"name": "Ada", "email": email, "password": "hunter2hunter2"},
    )
    assert response.status_code == 400
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("password", ["", "short", "1234567"])
def test_register_short_password_returns_400(client, password):
    response = post_json(
        client,
        "/api/auth/register",
        {"name": "Ada", "email": unique_email(), "password": password},
    )
    assert response.status_code == 400
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("name", ["", "   ", "\t\n"])
def test_register_blank_name_returns_400(client, name):
    response = post_json(
        client,
        "/api/auth/register",
        {"name": name, "email": unique_email(), "password": "hunter2hunter2"},
    )
    assert response.status_code == 400
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"


def test_register_overlong_name_returns_400(client):
    response = post_json(
        client,
        "/api/auth/register",
        {"name": "A" * 81, "email": unique_email(), "password": "hunter2hunter2"},
    )
    assert response.status_code == 400
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"


def test_register_rejects_non_json_content_type(client):
    """Section 2: form-encoded bodies are rejected on state-changing routes."""
    response = client.post(
        "/api/auth/register",
        data={"name": "Ada", "email": unique_email(), "password": "hunter2hunter2"},
        content_type="application/x-www-form-urlencoded",
    )
    _record(response)
    assert response.status_code == 400
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"


def test_register_rejects_malformed_json(client):
    response = client.post(
        "/api/auth/register", data="{not json", content_type="application/json"
    )
    _record(response)
    assert response.status_code == 400
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"


# --------------------------------------------------------------------------
# Login
# --------------------------------------------------------------------------

def test_login_success_returns_200_and_sets_session(client, app):
    email = unique_email()
    password = "correct horse battery"
    register(client, email=email, password=password)

    # A fresh client, so the session must come from the login itself and not
    # from the cookie registration left behind.
    fresh = app.test_client()
    response = post_json(fresh, "/api/auth/login", {"email": email, "password": password})

    assert response.status_code == 200
    payload = body(response)
    assert payload["success"] is True
    assert payload["message"] == "Login successful"
    assert payload["data"]["user"]["email"] == email
    assert has_session_cookie(fresh)

    assert get(fresh, "/api/auth/me").status_code == 200


def test_login_is_case_insensitive_on_email(client, app):
    email = unique_email()
    register(client, email=email, password="hunter2hunter2")

    fresh = app.test_client()
    response = post_json(
        fresh, "/api/auth/login", {"email": email.upper(), "password": "hunter2hunter2"}
    )
    assert response.status_code == 200
    assert body(response)["data"]["user"]["email"] == email


def test_login_wrong_password_returns_401(client, app):
    email = unique_email()
    register(client, email=email, password="hunter2hunter2")

    fresh = app.test_client()
    response = post_json(fresh, "/api/auth/login", {"email": email, "password": "wrongwrong"})

    assert response.status_code == 401
    assert body(response)["error"]["code"] == "INVALID_CREDENTIALS"
    assert not has_session_cookie(fresh)


def test_login_unknown_email_returns_401(client):
    response = post_json(
        client, "/api/auth/login", {"email": unique_email(), "password": "hunter2hunter2"}
    )
    assert response.status_code == 401
    assert body(response)["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_failure_messages_are_identical(client, app):
    """The enumeration defense.

    If the two failures differed by a single character, a caller could probe
    which addresses are registered. Status, code and message must all match.
    """
    email = unique_email()
    register(client, email=email, password="hunter2hunter2")

    wrong_password = post_json(
        app.test_client(), "/api/auth/login", {"email": email, "password": "definitelywrong"}
    )
    unknown_email = post_json(
        app.test_client(),
        "/api/auth/login",
        {"email": unique_email(), "password": "definitelywrong"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert body(wrong_password)["message"] == body(unknown_email)["message"]
    assert body(wrong_password)["error"]["code"] == body(unknown_email)["error"]["code"]
    # And neither names the field that failed.
    message = body(wrong_password)["message"].lower()
    assert "no such" not in message
    assert "not found" not in message
    assert "unknown" not in message


def test_login_malformed_email_is_a_credential_failure_not_validation(client):
    """A bad address must not be distinguishable from a wrong password."""
    response = post_json(client, "/api/auth/login", {"email": "nope", "password": "hunter2hunter2"})
    assert response.status_code == 401
    assert body(response)["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_missing_fields_returns_400(client):
    assert post_json(client, "/api/auth/login", {"email": "a@b.com"}).status_code == 400
    assert post_json(client, "/api/auth/login", {"password": "x"}).status_code == 400


def test_login_rejects_form_encoded_body(client, app):
    """Section 2: `application/x-www-form-urlencoded` must not be read as JSON."""
    email = unique_email()
    register(client, email=email, password="hunter2hunter2")

    fresh = app.test_client()
    response = fresh.post(
        "/api/auth/login",
        data={"email": email, "password": "hunter2hunter2"},
        content_type="application/x-www-form-urlencoded",
    )
    _record(response)

    assert response.status_code == 400
    assert body(response)["error"]["code"] == "VALIDATION_ERROR"
    # Crucially, valid credentials in a form body must not authenticate.
    assert not has_session_cookie(fresh)
    assert get(fresh, "/api/auth/me").status_code == 401


def test_login_response_contains_no_password_hash(client, app):
    email = unique_email()
    register(client, email=email, password="hunter2hunter2")

    fresh = app.test_client()
    response = post_json(fresh, "/api/auth/login", {"email": email, "password": "hunter2hunter2"})
    raw = response.get_data(as_text=True)

    assert "password_hash" not in raw
    assert "hunter2hunter2" not in raw
    assert set(body(response)["data"]["user"]) == {"id", "name", "email", "created_at"}


# --------------------------------------------------------------------------
# /me
# --------------------------------------------------------------------------

def test_me_without_session_returns_401(client):
    response = get(client, "/api/auth/me")
    assert response.status_code == 401
    payload = body(response)
    assert payload["success"] is False
    assert payload["error"]["code"] == "UNAUTHORIZED"


def test_me_with_session_returns_the_right_user(client):
    email = unique_email()
    created = body(register(client, name="Alan Turing", email=email))["data"]["user"]

    response = get(client, "/api/auth/me")
    assert response.status_code == 200
    user = body(response)["data"]["user"]

    assert user["id"] == created["id"]
    assert user["email"] == email
    assert user["name"] == "Alan Turing"
    assert "password_hash" not in user


def test_me_returns_only_the_session_owner(client, app):
    """Two concurrent sessions must not see each other's user."""
    first = app.test_client()
    second = app.test_client()

    a = body(register(first, name="First", email=unique_email()))["data"]["user"]
    b = body(register(second, name="Second", email=unique_email()))["data"]["user"]
    assert a["id"] != b["id"]

    assert body(get(first, "/api/auth/me"))["data"]["user"]["id"] == a["id"]
    assert body(get(second, "/api/auth/me"))["data"]["user"]["id"] == b["id"]


# --------------------------------------------------------------------------
# Logout
# --------------------------------------------------------------------------

def test_logout_clears_the_session(client):
    register(client)
    assert get(client, "/api/auth/me").status_code == 200

    response = post_json(client, "/api/auth/logout")
    assert response.status_code == 200
    payload = body(response)
    assert payload["success"] is True
    assert payload["message"] == "Logged out successfully"
    assert payload["data"] == {}

    assert get(client, "/api/auth/me").status_code == 401


def test_logout_when_not_logged_in_returns_200(client):
    """Idempotent by contract (section 3.1)."""
    response = post_json(client, "/api/auth/logout")
    assert response.status_code == 200
    assert body(response)["success"] is True

    # And still idempotent when repeated.
    assert post_json(client, "/api/auth/logout").status_code == 200


def test_login_after_logout_works(client, app):
    email = unique_email()
    register(client, email=email, password="hunter2hunter2")
    post_json(client, "/api/auth/logout")

    response = post_json(client, "/api/auth/login", {"email": email, "password": "hunter2hunter2"})
    assert response.status_code == 200
    assert get(client, "/api/auth/me").status_code == 200


# --------------------------------------------------------------------------
# core.auth / core.validation — pinned directly.
#
# The tests above reach these through /api/auth/*, where a second layer of
# defense can mask a missing first one: /me raises UNAUTHORIZED from its own
# `current_user() is None` guard even without @login_required, and a form body
# fails `get_json()` even without the `is_json` check. Exercising the units
# through routes of their own is what makes each line load-bearing.
# --------------------------------------------------------------------------

@pytest.fixture(scope="session")
def probe_app() -> Flask:
    """A separate app whose routes exist only to exercise the primitives.

    Built standalone rather than by adding routes to the `app` fixture: Flask
    refuses route registration once an app has handled a request. It still
    mounts the real auth blueprint so a probe route can be reached with a
    session established through the real register/login endpoints.
    """
    flask_app = Flask(f"{__name__}.probe")
    flask_app.config.from_object(Config)
    flask_app.config["TESTING"] = True
    flask_app.config["SECRET_KEY"] = "auth-slice-probe-secret"
    flask_app.register_blueprint(auth_bp)

    @flask_app.errorhandler(AppError)
    def handle_app_error(exc: AppError):
        return exc.to_dict(), exc.status_code

    @flask_app.get("/probe/guarded")
    @login_required
    def _guarded():
        return {"reached": True}, 200

    @flask_app.post("/probe/json-only")
    def _json_only():
        require_json(request)
        return {"reached": True}, 200

    if not pool_is_open():
        init_pool(Config.DATABASE_URL)

    return flask_app


def test_login_required_blocks_an_anonymous_request(probe_app):
    """@login_required alone must reject, with no route-level fallback helping."""
    response = probe_app.test_client().get("/probe/guarded")
    _record(response)

    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "UNAUTHORIZED"
    assert "reached" not in response.get_json()


def test_login_required_admits_an_authenticated_request(probe_app):
    client = probe_app.test_client()
    register(client)

    response = client.get("/probe/guarded")
    _record(response)
    assert response.status_code == 200
    assert response.get_json()["reached"] is True


def test_require_json_rejects_form_content_type_before_parsing(probe_app):
    """The `is_json` check must reject on Content-Type, not on parse failure.

    The body here is valid JSON *text* — only the Content-Type is wrong. If the
    handler relied on `get_json()` failing instead of checking the content
    type, this would parse and succeed.
    """
    response = probe_app.test_client().post(
        "/probe/json-only",
        data=json.dumps({"a": 1}),
        content_type="application/x-www-form-urlencoded",
    )
    _record(response)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_require_json_accepts_a_proper_json_body(probe_app):
    response = probe_app.test_client().post(
        "/probe/json-only", data=json.dumps({"a": 1}), content_type="application/json"
    )
    _record(response)
    assert response.status_code == 200


def test_require_json_rejects_a_json_array_body(probe_app):
    """A top-level array is valid JSON but not an object of fields."""
    response = probe_app.test_client().post(
        "/probe/json-only", data=json.dumps([1, 2]), content_type="application/json"
    )
    _record(response)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


# --------------------------------------------------------------------------
# Session fixation
# --------------------------------------------------------------------------

def test_login_discards_pre_existing_session_contents(client, app):
    """set_session() clears the session before it sets the user id.

    This is the session-fixation defense, and it is only observable through a
    key *other* than `user_id`: overwriting `user_id` alone would happen with
    or without the clear, so asserting on identity would pass either way and
    prove nothing. Planting a foreign key and requiring it to be gone after
    login is what actually pins `session.clear()` in place — remove that call
    and this test fails.
    """
    email = unique_email()
    register(client, email=email, password="hunter2hunter2")
    post_json(client, "/api/auth/logout")

    # Something an unauthenticated visitor left in the session beforehand.
    with client.session_transaction() as sess:
        sess["planted_privilege"] = "admin"

    assert post_json(
        client, "/api/auth/login", {"email": email, "password": "hunter2hunter2"}
    ).status_code == 200

    with client.session_transaction() as sess:
        assert "planted_privilege" not in sess, (
            "a value present before login survived into the authenticated "
            "session — set_session() is not clearing first"
        )
        assert sess["user_id"] is not None


def test_login_replaces_a_previously_authenticated_user(client, app):
    """A session authenticated as one user must not linger as another."""
    first_email = unique_email()
    second_email = unique_email()
    first = body(register(client, name="First", email=first_email))["data"]["user"]

    other = app.test_client()
    second = body(register(other, name="Second", email=second_email))["data"]["user"]

    # `client` is still authenticated as `first`; log in as `second` over it.
    response = post_json(
        client, "/api/auth/login", {"email": second_email, "password": "hunter2hunter2"}
    )
    assert response.status_code == 200

    me = body(get(client, "/api/auth/me"))["data"]["user"]
    assert me["id"] == second["id"]
    assert me["id"] != first["id"]


def test_register_discards_pre_existing_session_contents(client):
    """Registration establishes a session too, so it needs the same clear."""
    with client.session_transaction() as sess:
        sess["planted_privilege"] = "admin"

    assert register(client).status_code == 201

    with client.session_transaction() as sess:
        assert "planted_privilege" not in sess
        assert sess["user_id"] is not None


# --------------------------------------------------------------------------
# Global sweep — must run last.
# --------------------------------------------------------------------------

def test_no_password_hash_anywhere_in_any_response():
    """No response captured by this module may leak password material.

    Ordered last on purpose: it asserts over every body recorded by every test
    above. `pbkdf2` catches a hash that leaked under a renamed key.
    """
    assert ALL_RESPONSE_BODIES, "no responses were recorded — helpers were bypassed"

    for raw in ALL_RESPONSE_BODIES:
        assert "password_hash" not in raw
        assert "pbkdf2" not in raw.lower()
        assert "scrypt:" not in raw.lower()
        # The passwords these tests actually send.
        assert "hunter2hunter2" not in raw
        assert "supersecret123" not in raw
        assert "correct horse battery" not in raw
