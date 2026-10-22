"""End-to-end tests: the scenarios the prototype is graded on.

These drive the real Flask application against the real database over real
HTTP, with no mocks. Test A and Test B mirror the PRD's success criteria
(section 19) exactly: a 10 KB document from client to server and a 5 KB
document from server to client, encrypted, transmitted, decrypted, and
compared byte for byte against the original.

Each test creates its own user with a unique email, so the suite is safe to
run repeatedly and alongside other work on the same database.
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


@pytest.fixture
def client(app):
    return app.test_client()


def register(client, password: str = "correct-horse-battery") -> dict:
    """Create and log in a fresh user."""
    email = f"e2e-{uuid.uuid4().hex[:12]}@cybervault.test"
    response = client.post("/api/auth/register", json={
        "name": "End To End", "email": email, "password": password,
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]["user"]


def upload(client, content: str, filename: str = "document.txt",
           direction: str = "CLIENT_TO_SERVER") -> dict:
    data = {
        "file": (io.BytesIO(content.encode("utf-8")), filename),
        "direction": direction,
    }
    response = client.post("/api/documents", data=data,
                           content_type="multipart/form-data")
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def make_key(client, algorithm: str, key_size: int | None = None) -> str:
    body = {"key_size": key_size} if key_size else {}
    response = client.post(f"/api/algorithms/{algorithm}/key", json=body)
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]["key"]


# --------------------------------------------------------------------- Test A

def test_client_to_server_transfer_of_a_10kb_document(client):
    """PRD Test A: 10 KB client to server, AES, recovered byte for byte."""
    register(client)

    # Exactly at the documented ceiling, not merely near it.
    original = ("CyberVault confidential record. " * 400)[:10240]
    assert len(original.encode("utf-8")) == 10240

    document = upload(client, original, "confidential.txt")
    assert document["size"] == 10240
    assert document["direction"] == "CLIENT_TO_SERVER"

    key = make_key(client, "aes", 256)

    created = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    })
    assert created.status_code == 201, created.get_json()
    transfer = created.get_json()["data"]

    assert transfer["status"] == "RECEIVED"
    assert transfer["transfer_id"].startswith("TR-")
    assert transfer["sender"] == "client" and transfer["receiver"] == "server"
    # The stage trace is recorded, not invented by the frontend.
    assert [s["stage"] for s in transfer["stages"]] == [
        "ENCRYPTING", "TRANSMITTING", "RECEIVED",
    ]

    detail = client.get(f"/api/transfers/{transfer['id']}").get_json()["data"]
    ciphertext = detail["ciphertext"]
    assert ciphertext, "ciphertext must be stored"
    # What crosses the wire must not be the plaintext.
    assert original not in ciphertext
    assert original[:64] not in ciphertext

    decrypted = client.post(f"/api/transfers/{transfer['id']}/decrypt", json={})
    assert decrypted.status_code == 200, decrypted.get_json()
    payload = decrypted.get_json()["data"]

    assert payload["status"] == "COMPLETED"
    assert payload["plaintext"] == original, "recovered document must match exactly"
    assert payload["integrity_verified"] is True, "AES-EAX proves integrity"


# --------------------------------------------------------------------- Test B

def test_server_to_client_transfer_of_a_5kb_document(client):
    """PRD Test B: a different 5 KB document, server to client."""
    register(client)

    original = ("Server response bulletin. " * 250)[:5120]
    assert len(original.encode("utf-8")) == 5120

    document = upload(client, original, "server_report.txt",
                      direction="SERVER_TO_CLIENT")
    assert document["direction"] == "SERVER_TO_CLIENT"

    key = make_key(client, "aes", 256)
    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
        "direction": "SERVER_TO_CLIENT",
    }).get_json()["data"]

    assert transfer["sender"] == "server" and transfer["receiver"] == "client"

    payload = client.post(
        f"/api/transfers/{transfer['id']}/decrypt", json={}
    ).get_json()["data"]
    assert payload["plaintext"] == original


# --------------------------------------------------------------------- Test C

@pytest.mark.parametrize("algorithm", ["caesar", "sdes", "aes"])
def test_lossless_algorithms_recover_the_document_exactly(client, algorithm):
    """PRD Test C for the lossless ciphers."""
    register(client)
    original = "Attack at dawn! Meet by the old bridge, 07:30. Bring ID #4471."

    document = upload(client, original, f"{algorithm}_note.txt")
    key = make_key(client, algorithm)

    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": algorithm, "key": key,
    }).get_json()["data"]

    payload = client.post(
        f"/api/transfers/{transfer['id']}/decrypt", json={}
    ).get_json()["data"]

    assert payload["plaintext"] == original
    # Only AES claims integrity; the classical ciphers report None rather than
    # implying they checked and passed.
    expected = True if algorithm == "aes" else None
    assert payload["integrity_verified"] is expected


def test_playfair_recovers_the_normalized_document(client):
    """Playfair is lossy by construction, so it is asserted honestly.

    The classical algorithm drops non-letters and inserts fillers. The test
    asserts the letters survive rather than pretending the round trip is exact.
    """
    register(client)
    original = "MEET ME AT THE BRIDGE"

    document = upload(client, original, "playfair_note.txt")
    key = make_key(client, "playfair")

    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "playfair", "key": key,
    }).get_json()["data"]

    payload = client.post(
        f"/api/transfers/{transfer['id']}/decrypt", json={}
    ).get_json()["data"]

    recovered = payload["plaintext"]
    letters_only = "".join(c for c in original.upper() if c.isalpha()).replace("J", "I")
    stripped = recovered.replace("X", "").replace("Z", "")
    assert stripped == letters_only.replace("X", "").replace("Z", "")


# ------------------------------------------------------------- failure paths

def test_a_wrong_key_fails_and_leaves_the_transfer_retryable(client):
    """The PRD's wrong-key error, and the transfer stays usable afterwards."""
    register(client)
    document = upload(client, "Highly sensitive contents.", "secret.txt")
    key = make_key(client, "aes", 256)
    wrong_key = make_key(client, "aes", 256)

    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    }).get_json()["data"]

    failed = client.post(f"/api/transfers/{transfer['id']}/decrypt",
                         json={"key": wrong_key})
    assert failed.status_code == 400
    body = failed.get_json()
    assert body["success"] is False
    assert body["error"]["code"] == "DECRYPTION_FAILED"

    # Still RECEIVED, so the operator can try again with the right key.
    state = client.get(f"/api/transfers/{transfer['id']}").get_json()["data"]
    assert state["status"] == "RECEIVED"

    retried = client.post(f"/api/transfers/{transfer['id']}/decrypt", json={"key": key})
    assert retried.status_code == 200
    assert retried.get_json()["data"]["plaintext"] == "Highly sensitive contents."


def test_tampered_ciphertext_is_detected(client):
    """AES-EAX must reject a modified payload rather than return garbage."""
    from repositories.transfer_repository import TransferRepository

    user = register(client)
    document = upload(client, "Original untampered content.", "tamper.txt")
    key = make_key(client, "aes", 256)

    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    }).get_json()["data"]

    stored = TransferRepository.find_by_id(transfer["id"], user["id"],
                                           with_ciphertext=True)
    corrupted = list(stored["ciphertext"])
    # Flip a character in the body, avoiding base64 padding at the end.
    index = len(corrupted) // 2
    corrupted[index] = "A" if corrupted[index] != "A" else "B"
    TransferRepository.update(transfer["id"], ciphertext="".join(corrupted))

    response = client.post(f"/api/transfers/{transfer['id']}/decrypt", json={})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "DECRYPTION_FAILED"


def test_transfers_and_documents_are_private_to_their_owner(client, app):
    """One user must not read another user's transfer, even with the real id."""
    owner = register(client)
    document = upload(client, "Owner's private data.", "private.txt")
    key = make_key(client, "aes", 256)
    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    }).get_json()["data"]

    intruder_client = app.test_client()
    register(intruder_client)

    assert intruder_client.get(f"/api/documents/{document['id']}").status_code == 404
    assert intruder_client.get(f"/api/transfers/{transfer['id']}").status_code == 404
    assert intruder_client.post(
        f"/api/transfers/{transfer['id']}/decrypt", json={}
    ).status_code == 404


def test_the_dashboard_reflects_real_activity(client):
    """The dashboard is one request and its numbers are real."""
    register(client)
    empty = client.get("/api/dashboard").get_json()["data"]
    assert empty["documents"] == 0
    assert empty["success_rate"] == 100.0, "no transfers is not a failure"
    assert empty["algorithms"] == 4

    document = upload(client, "Dashboard check.", "dash.txt")
    key = make_key(client, "aes", 256)
    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    }).get_json()["data"]
    client.post(f"/api/transfers/{transfer['id']}/decrypt", json={})

    after = client.get("/api/dashboard").get_json()["data"]
    assert after["documents"] == 1
    assert after["transfers"] == 1
    assert after["successful_transfers"] == 1
    assert after["success_rate"] == 100.0
    assert len(after["recent_transfers"]) == 1
    assert after["recent_activity"], "activity must be recorded"


def test_no_response_ever_contains_the_encryption_key(client):
    """The stored key must not leak through any transfer-facing endpoint."""
    register(client)
    document = upload(client, "Key leak check.", "leak.txt")
    key = make_key(client, "aes", 256)

    created = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    })
    transfer_id = created.get_json()["data"]["id"]

    bodies = [
        created.get_data(as_text=True),
        client.get(f"/api/transfers/{transfer_id}").get_data(as_text=True),
        client.get("/api/transfers").get_data(as_text=True),
        client.get("/api/dashboard").get_data(as_text=True),
        client.post(f"/api/transfers/{transfer_id}/decrypt",
                    json={}).get_data(as_text=True),
        client.get("/api/activity").get_data(as_text=True),
    ]
    for body in bodies:
        assert key not in body, "the encryption key must never appear in a response"
        assert "encryption_key" not in body


def test_activity_has_one_shape_everywhere_it_appears(client):
    """The same record must not change field names between endpoints.

    Activity is returned both embedded in the dashboard and from its own
    feed. They went out of step once — the dashboard passed raw rows with
    `created_at` while the feed mapped them to `at` — so both now go through
    one shaping function and this test holds them together.
    """
    register(client)
    upload(client, "Shape check.", "shape.txt")

    dashboard = client.get("/api/dashboard").get_json()["data"]["recent_activity"]
    feed = client.get("/api/activity").get_json()["data"]["activity"]

    assert dashboard and feed, "both endpoints must return activity"
    assert sorted(dashboard[0]) == sorted(feed[0]), (
        "activity entries must have identical fields in both endpoints"
    )
    for entry in dashboard + feed:
        assert "at" in entry, "the timestamp field is `at` (API_CONTRACT.md 3.8)"
        assert "created_at" not in entry, "raw column name must not leak through"


def test_documents_survive_the_filesystem_being_wiped(client, app):
    """Documents must not depend on local disk.

    The original design stored only a path and wrote the bytes to
    storage/uploads. That loses every document on a host with an ephemeral
    filesystem: a redeploy wipes the disk, the rows survive, and each one then
    points at bytes that are gone. This reproduces that by deleting the upload
    directory outright and asserting every read path still works.
    """
    import shutil
    from pathlib import Path

    register(client)
    original = "This document must outlive the container it was uploaded to."
    document = upload(client, original, "durable.txt")

    assert client.get(f"/api/documents/{document['id']}").status_code == 200

    upload_dir = Path(Config.UPLOAD_DIR)
    shutil.rmtree(upload_dir, ignore_errors=True)
    upload_dir.mkdir(parents=True, exist_ok=True)

    detail = client.get(f"/api/documents/{document['id']}")
    assert detail.status_code == 200, "the document must not vanish with the disk"
    assert detail.get_json()["data"]["content"] == original

    download = client.get(f"/api/documents/{document['id']}/download")
    assert download.status_code == 200
    assert download.get_data(as_text=True) == original

    # The whole encrypt/transfer/decrypt cycle still runs with no files on disk.
    key = make_key(client, "aes", 256)
    transfer = client.post("/api/transfers", json={
        "document_id": document["id"], "algorithm": "aes", "key": key,
    })
    assert transfer.status_code == 201, transfer.get_json()
    result = client.post(
        f"/api/transfers/{transfer.get_json()['data']['id']}/decrypt", json={}
    )
    assert result.get_json()["data"]["plaintext"] == original

    # And so does a public share link.
    share = client.post(f"/api/documents/{document['id']}/shares",
                        json={}).get_json()["data"]
    visitor = app.test_client()
    shared = visitor.get(f"/api/share/{share['token']}")
    assert shared.status_code == 200
    assert shared.get_json()["data"]["content"] == original


def test_a_listing_does_not_carry_document_bodies(client):
    """Content is fetched on demand, not dragged through every listing."""
    register(client)
    for index in range(3):
        upload(client, f"Body number {index}. " * 50, f"doc{index}.txt")

    listing = client.get("/api/documents").get_json()["data"]
    assert listing["total"] == 3
    for row in listing["documents"]:
        assert "content" not in row, "listings must not include document bodies"
        assert "stored_name" not in row, "the storage layout is not the client's business"
