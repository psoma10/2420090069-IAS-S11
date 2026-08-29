"""Security tests.

These exist because the security section of the documentation makes claims, and
a claim that is not tested is a hope. Each test here corresponds to something
SECURITY_REVIEW.md asserts is defended.

They are adversarial by intent: every one of them tries to make the application
do something it says it will not.
"""

from __future__ import annotations

import io
import uuid

import pytest

from app import create_app
from config import Config


@pytest.fixture(scope="module")
def app():
    application = create_app(Config)
    application.config.update(TESTING=True)
    return application


def new_user(app, name: str = "Test User"):
    client = app.test_client()
    email = f"sec-{uuid.uuid4().hex[:12]}@cybervault.test"
    response = client.post("/api/auth/register", json={
        "name": name, "email": email, "password": "correct-horse-battery",
    })
    assert response.status_code == 201
    return client, response.get_json()["data"]["user"], email


def upload(client, content: str = "Sensitive contents.", filename: str = "doc.txt"):
    response = client.post("/api/documents", data={
        "file": (io.BytesIO(content.encode("utf-8")), filename),
    }, content_type="multipart/form-data")
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


# ----------------------------------------------------------- authorization

def test_every_protected_route_rejects_an_anonymous_caller(app):
    """No protected route may answer without a session."""
    anonymous = app.test_client()

    protected = [
        ("GET", "/api/auth/me"),
        ("GET", "/api/documents"),
        ("GET", "/api/documents/1"),
        ("GET", "/api/documents/1/download"),
        ("POST", "/api/documents"),
        ("GET", "/api/transfers"),
        ("GET", "/api/transfers/1"),
        ("POST", "/api/transfers"),
        ("POST", "/api/transfers/1/decrypt"),
        ("GET", "/api/dashboard"),
        ("GET", "/api/activity"),
        ("GET", "/api/shares"),
        ("POST", "/api/documents/1/shares"),
        ("GET", "/api/documents/1/shares"),
        ("DELETE", "/api/shares/1"),
        ("POST", "/api/encryption/preview"),
        ("POST", "/api/encryption/decrypt-preview"),
    ]

    for method, path in protected:
        response = anonymous.open(path, method=method, json={})
        assert response.status_code == 401, f"{method} {path} answered {response.status_code}"
        assert response.get_json()["error"]["code"] == "UNAUTHORIZED"


def test_one_user_cannot_reach_another_users_data(app):
    """The core IDOR test, across every resource-scoped route."""
    victim, victim_user, _ = new_user(app, "Victim")
    document = upload(victim, "Victim's confidential document.")

    key_response = victim.post("/api/algorithms/aes/key", json={"key_size": 256})
    key = key_response.get_json()["data"]["key"]
    transfer = victim.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    }).get_json()["data"]
    share = victim.post(f"/api/documents/{document['id']}/shares",
                        json={}).get_json()["data"]

    attacker, _, _ = new_user(app, "Attacker")

    attempts = [
        ("GET", f"/api/documents/{document['id']}", None),
        ("GET", f"/api/documents/{document['id']}/download", None),
        ("GET", f"/api/transfers/{transfer['id']}", None),
        ("POST", f"/api/transfers/{transfer['id']}/decrypt", {}),
        ("POST", f"/api/documents/{document['id']}/shares", {}),
        ("GET", f"/api/documents/{document['id']}/shares", None),
        ("DELETE", f"/api/shares/{share['id']}", None),
    ]

    for method, path, body in attempts:
        response = attacker.open(path, method=method, json=body)
        assert response.status_code == 404, (
            f"{method} {path} leaked data with status {response.status_code}"
        )
        # 404 rather than 403 on purpose: a 403 would confirm the id exists.
        assert response.get_json()["error"]["code"] in (
            "DOCUMENT_NOT_FOUND", "TRANSFER_NOT_FOUND",
        )

    # The victim's data is untouched by the failed attempts.
    assert victim.get(f"/api/documents/{document['id']}").status_code == 200
    assert victim.get(f"/api/transfers/{transfer['id']}").status_code == 200


def test_listings_never_include_another_users_rows(app):
    owner, _, _ = new_user(app)
    upload(owner, "Only mine.")

    stranger, _, _ = new_user(app)
    for path in ("/api/documents", "/api/transfers", "/api/shares"):
        body = stranger.get(path).get_json()["data"]
        assert body["total"] == 0, f"{path} leaked rows to a stranger"

    # Activity is not empty for a new account — registering is itself an
    # activity — so the assertion is that none of it belongs to the owner.
    activity = stranger.get("/api/activity").get_json()["data"]["activity"]
    assert all(entry["action"] == "USER_REGISTERED" for entry in activity)
    assert not any(entry.get("document_id") for entry in activity)


def test_hostile_resource_ids_are_rejected_cleanly(app):
    """Malformed ids must produce a clean error, never a 500 or a stack trace."""
    client, _, _ = new_user(app)

    hostile = [
        "1 OR 1=1",
        "1; DROP TABLE users",
        "-1",
        "999999999999999999999999",
        "../../etc/passwd",
        "%00",
        "null",
        "TR-000001' OR '1'='1",
    ]

    for value in hostile:
        response = client.get(f"/api/transfers/{value}")
        # 405 is fine too: a value containing slashes is normalized by the
        # routing layer into a different route, which is a safe outcome.
        assert response.status_code in (400, 404, 405), (
            f"{value!r} gave {response.status_code}"
        )
        if response.status_code == 405:
            continue
        body = response.get_json()
        assert body["success"] is False
        # No internal detail in the message.
        assert "Traceback" not in str(body)
        assert "psycopg" not in str(body).lower()
        assert "select" not in body["message"].lower()


def test_sql_injection_in_list_filters_changes_nothing(app):
    """Filter parameters are allow-listed, so injection is inert."""
    owner, _, _ = new_user(app)
    upload(owner, "Row one.")
    upload(owner, "Row two.")

    baseline = owner.get("/api/documents").get_json()["data"]["total"]
    assert baseline == 2

    payloads = [
        "CLIENT_TO_SERVER' OR '1'='1",
        "'; DROP TABLE documents; --",
        "1 UNION SELECT password_hash FROM users",
        "\\'",
    ]
    for payload in payloads:
        response = owner.get(f"/api/documents?direction={payload}&status={payload}")
        assert response.status_code == 200
        # An unrecognised filter value is ignored, not interpolated.
        assert response.get_json()["data"]["total"] == baseline

    for payload in ("999999", "-1", "abc", "1; DROP TABLE users"):
        response = owner.get(f"/api/documents?limit={payload}&offset={payload}")
        assert response.status_code == 200

    # The table still exists and still holds the rows.
    assert owner.get("/api/documents").get_json()["data"]["total"] == baseline


# -------------------------------------------------------------- secrets

def test_the_password_hash_never_appears_in_any_response(app):
    client, user, email = new_user(app)
    upload(client, "Anything.")

    bodies = [
        client.get("/api/auth/me").get_data(as_text=True),
        client.post("/api/auth/login", json={
            "email": email, "password": "correct-horse-battery",
        }).get_data(as_text=True),
        client.get("/api/dashboard").get_data(as_text=True),
        client.get("/api/documents").get_data(as_text=True),
        client.get("/api/activity").get_data(as_text=True),
    ]
    for body in bodies:
        assert "password_hash" not in body
        assert "pbkdf2" not in body.lower()


def test_the_encryption_key_never_appears_in_any_response(app):
    """Demo mode stores the key; the containment claim is that it never leaves."""
    client, _, _ = new_user(app)
    document = upload(client, "Key containment check.")
    key = client.post("/api/algorithms/aes/key",
                      json={"key_size": 256}).get_json()["data"]["key"]

    created = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    })
    transfer_id = created.get_json()["data"]["id"]

    bodies = [
        created.get_data(as_text=True),
        client.get(f"/api/transfers/{transfer_id}").get_data(as_text=True),
        client.get("/api/transfers").get_data(as_text=True),
        client.post(f"/api/transfers/{transfer_id}/decrypt", json={}).get_data(as_text=True),
        client.get("/api/dashboard").get_data(as_text=True),
        client.get("/api/activity").get_data(as_text=True),
        client.get(f"/api/documents/{document['id']}").get_data(as_text=True),
    ]
    for body in bodies:
        assert key not in body, "the stored key leaked into a response"
        assert "encryption_key" not in body


def test_login_does_not_reveal_whether_an_account_exists(app):
    """Same status and same message for unknown email and wrong password."""
    client, _, email = new_user(app)
    fresh = app.test_client()

    wrong_password = fresh.post("/api/auth/login", json={
        "email": email, "password": "definitely-not-the-password",
    })
    unknown_email = fresh.post("/api/auth/login", json={
        "email": f"nobody-{uuid.uuid4().hex}@nowhere.test", "password": "whatever-123",
    })

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.get_json()["message"] == unknown_email.get_json()["message"]
    assert wrong_password.get_json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_a_password_below_the_minimum_is_rejected(app):
    """This check was once dead code; it stays tested so it cannot die again."""
    client = app.test_client()
    response = client.post("/api/auth/register", json={
        "name": "Short", "email": f"short-{uuid.uuid4().hex[:8]}@test.test",
        "password": "1234567",
    })
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert "8" in response.get_json()["message"]


def test_logging_out_ends_the_session(app):
    client, _, _ = new_user(app)
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_a_tampered_session_cookie_is_rejected(app):
    """The cookie is signed, so editing it must invalidate it."""
    client, _, _ = new_user(app)
    assert client.get("/api/auth/me").status_code == 200

    forged = app.test_client()
    forged.set_cookie("session", "eyJ1c2VyX2lkIjoxfQ.forged.signature")
    assert forged.get("/api/auth/me").status_code == 401


# ---------------------------------------------------------- file handling

@pytest.mark.parametrize("filename", [
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32\\config.txt",
    "/etc/passwd",
    "....//....//secret.txt",
])
def test_path_traversal_filenames_stay_inside_the_upload_directory(app, filename):
    client, _, _ = new_user(app)

    response = client.post("/api/documents", data={
        "file": (io.BytesIO(b"traversal attempt"), filename),
    }, content_type="multipart/form-data")

    # Either rejected outright or stored safely — never written outside.
    if response.status_code == 201:
        from repositories.document_repository import DocumentRepository
        from services.document_service import DocumentService

        document = response.get_json()["data"]
        stored = DocumentRepository.find_by_id(document["id"], document["user_id"]) \
            if "user_id" in document else None
        path = DocumentService.file_path(stored or {
            "stored_name": f"{document['id']}_{filename}"
        })
        assert Config.UPLOAD_DIR.resolve() in path.resolve().parents, (
            f"{filename!r} escaped the upload directory to {path}"
        )
    else:
        assert response.status_code == 400


def test_oversized_and_wrong_type_uploads_are_rejected(app):
    client, _, _ = new_user(app)

    cases = [
        (b"X" * 10241, "big.txt", "CLIENT_TO_SERVER", 413, "FILE_TOO_LARGE"),
        (b"X" * 5121, "big.txt", "SERVER_TO_CLIENT", 413, "FILE_TOO_LARGE"),
        (b"", "empty.txt", "CLIENT_TO_SERVER", 400, "EMPTY_FILE"),
        (b"content", "script.exe", "CLIENT_TO_SERVER", 400, "INVALID_FILE_TYPE"),
        (b"\xff\xfe\x00binary", "fake.txt", "CLIENT_TO_SERVER", 400, "INVALID_FILE_TYPE"),
    ]

    for content, filename, direction, status, code in cases:
        response = client.post("/api/documents", data={
            "file": (io.BytesIO(content), filename), "direction": direction,
        }, content_type="multipart/form-data")
        assert response.status_code == status, f"{filename} {direction}"
        assert response.get_json()["error"]["code"] == code


# ------------------------------------------------------ error disclosure

def test_malformed_requests_never_leak_internals(app):
    client, _, _ = new_user(app)

    probes = [
        ("/api/transfers", "not json at all", "text/plain"),
        ("/api/transfers", '{"broken": ', "application/json"),
        ("/api/encryption/preview", '{"algorithm": null}', "application/json"),
        ("/api/encryption/preview", '["a", "list"]', "application/json"),
        ("/api/auth/login", "email=a&password=b", "application/x-www-form-urlencoded"),
    ]

    for path, payload, content_type in probes:
        response = client.post(path, data=payload, content_type=content_type)
        assert response.status_code in (400, 401, 415), f"{path} {content_type}"
        body = response.get_data(as_text=True)
        for leak in ("Traceback", "psycopg", "/Users/", "site-packages", "SELECT "):
            assert leak not in body, f"{path} leaked {leak!r}"


def test_form_encoded_bodies_are_refused_on_state_changing_routes(app):
    """Part of the CSRF story: the API takes JSON only."""
    client, _, _ = new_user(app)
    response = client.post("/api/transfers",
                           data={"document_id": "1", "algorithm": "aes", "key": "x"},
                           content_type="application/x-www-form-urlencoded")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_decryption_failures_are_indistinguishable(app):
    """Wrong key and corrupted ciphertext must not be told apart.

    Different errors for the two would give an attacker an oracle.
    """
    from repositories.transfer_repository import TransferRepository

    client, user, _ = new_user(app)
    document = upload(client, "Oracle check.")
    key = client.post("/api/algorithms/aes/key",
                      json={"key_size": 256}).get_json()["data"]["key"]
    wrong = client.post("/api/algorithms/aes/key",
                        json={"key_size": 256}).get_json()["data"]["key"]

    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    }).get_json()["data"]

    wrong_key_response = client.post(f"/api/transfers/{transfer['id']}/decrypt",
                                     json={"key": wrong})

    stored = TransferRepository.find_by_id(transfer["id"], user["id"],
                                           with_ciphertext=True)
    corrupted = list(stored["ciphertext"])
    corrupted[len(corrupted) // 2] = "A" if corrupted[len(corrupted) // 2] != "A" else "B"
    TransferRepository.update(transfer["id"], ciphertext="".join(corrupted))

    corrupt_response = client.post(f"/api/transfers/{transfer['id']}/decrypt",
                                   json={"key": key})

    assert wrong_key_response.status_code == corrupt_response.status_code == 400
    assert (wrong_key_response.get_json()["message"]
            == corrupt_response.get_json()["message"])
    assert (wrong_key_response.get_json()["error"]["code"]
            == corrupt_response.get_json()["error"]["code"]
            == "DECRYPTION_FAILED")
