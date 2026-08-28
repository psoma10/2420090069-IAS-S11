"""Share-link tests.

The public share route is the only unauthenticated endpoint that returns
document content, so these tests lean on the access rules rather than the happy
path: revocation, expiry, ownership, token unguessability, and exactly which
fields a visitor can see.
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import create_app
from config import Config
from repositories.share_repository import ShareRepository


@pytest.fixture(scope="module")
def app():
    application = create_app(Config)
    application.config.update(TESTING=True)
    return application


def new_user_client(app):
    client = app.test_client()
    email = f"share-{uuid.uuid4().hex[:12]}@cybervault.test"
    response = client.post("/api/auth/register", json={
        "name": "Share Owner", "email": email, "password": "correct-horse-battery",
    })
    assert response.status_code == 201
    return client, response.get_json()["data"]["user"]


def upload(client, content: str = "Quarterly figures, internal only.",
           filename: str = "report.txt") -> dict:
    response = client.post("/api/documents", data={
        "file": (io.BytesIO(content.encode("utf-8")), filename),
    }, content_type="multipart/form-data")
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def create_share(client, document_id: int, **body) -> dict:
    response = client.post(f"/api/documents/{document_id}/shares", json=body)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


# ------------------------------------------------------------- the happy path

def test_anyone_with_the_link_can_read_the_document(app):
    """The link is the credential: no session, no login, still readable."""
    owner, _ = new_user_client(app)
    content = "The board meets on Thursday at four."
    document = upload(owner, content, "board.txt")
    share = create_share(owner, document["id"], label="For the committee")

    visitor = app.test_client()  # never authenticated
    response = visitor.get(f"/api/share/{share['token']}")

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["content"] == content
    assert data["filename"] == "board.txt"
    assert data["shared_by"] == "Share Owner"


def test_a_visitor_sees_the_document_and_nothing_about_the_account(app):
    """The public payload is deliberately narrow."""
    owner, _ = new_user_client(app)
    document = upload(owner)
    share = create_share(owner, document["id"])

    visitor = app.test_client()
    body = visitor.get(f"/api/share/{share['token']}").get_data(as_text=True)
    data = visitor.get(f"/api/share/{share['token']}").get_json()["data"]

    for forbidden in ("user_id", "email", "password", "encryption_key",
                      "ciphertext", "token"):
        assert forbidden not in data, f"{forbidden} must not reach a visitor"
    assert "@" not in body or "cybervault.test" not in body, "no owner email"


def test_the_token_is_long_and_unpredictable(app):
    """Guessing a link must not be feasible, and two links must never collide."""
    owner, _ = new_user_client(app)
    document = upload(owner)

    tokens = {create_share(owner, document["id"])["token"] for _ in range(5)}
    assert len(tokens) == 5, "tokens must be unique"
    for token in tokens:
        # secrets.token_urlsafe(32) yields 43 characters, ~256 bits.
        assert len(token) >= 40
        assert str(document["id"]) != token, "token must not derive from the id"


# ----------------------------------------------------------------- revocation

def test_revoking_a_link_takes_effect_immediately(app):
    owner, _ = new_user_client(app)
    document = upload(owner)
    share = create_share(owner, document["id"])
    visitor = app.test_client()

    assert visitor.get(f"/api/share/{share['token']}").status_code == 200

    revoked = owner.delete(f"/api/shares/{share['id']}")
    assert revoked.status_code == 200
    assert revoked.get_json()["data"]["revoked"] is True
    assert revoked.get_json()["data"]["active"] is False

    assert visitor.get(f"/api/share/{share['token']}").status_code == 404


def test_a_revoked_link_is_indistinguishable_from_one_that_never_existed(app):
    """A visitor must not be able to tell a withdrawn link from a fake one."""
    owner, _ = new_user_client(app)
    document = upload(owner)
    share = create_share(owner, document["id"])
    owner.delete(f"/api/shares/{share['id']}")

    visitor = app.test_client()
    revoked = visitor.get(f"/api/share/{share['token']}")
    invented = visitor.get(f"/api/share/{'z' * 43}")

    assert revoked.status_code == invented.status_code == 404
    assert revoked.get_json()["message"] == invented.get_json()["message"]
    assert revoked.get_json()["error"]["code"] == invented.get_json()["error"]["code"]


def test_an_expired_link_stops_working(app):
    """Expiry is enforced in SQL, so a past date closes the link at once."""
    owner, user = new_user_client(app)
    document = upload(owner)
    share = create_share(owner, document["id"], expires_in_days=1)

    visitor = app.test_client()
    assert visitor.get(f"/api/share/{share['token']}").status_code == 200

    # Move the expiry into the past rather than waiting a day.
    from database.connection import get_cursor
    with get_cursor() as cur:
        cur.execute(
            "UPDATE document_shares SET expires_at = %s WHERE id = %s",
            (datetime.now(timezone.utc) - timedelta(minutes=1), share["id"]),
        )

    assert visitor.get(f"/api/share/{share['token']}").status_code == 404
    assert ShareRepository.find_by_token(share["token"]) is None


def test_expiry_must_be_a_sane_number_of_days(app):
    owner, _ = new_user_client(app)
    document = upload(owner)

    for bad in (0, -5, 10_000, "soon"):
        response = owner.post(f"/api/documents/{document['id']}/shares",
                              json={"expires_in_days": bad})
        assert response.status_code == 400, bad
        assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


# ------------------------------------------------------------------ ownership

def test_only_the_owner_can_share_a_document(app):
    owner, _ = new_user_client(app)
    document = upload(owner)

    intruder, _ = new_user_client(app)
    response = intruder.post(f"/api/documents/{document['id']}/shares", json={})

    # 404 rather than 403: sharing must not confirm that someone else's
    # document id exists.
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "DOCUMENT_NOT_FOUND"


def test_only_the_owner_can_revoke_a_link(app):
    owner, _ = new_user_client(app)
    document = upload(owner)
    share = create_share(owner, document["id"])

    intruder, _ = new_user_client(app)
    assert intruder.delete(f"/api/shares/{share['id']}").status_code == 404

    # And the link still works, so the failed revoke really was a no-op.
    visitor = app.test_client()
    assert visitor.get(f"/api/share/{share['token']}").status_code == 200


def test_listing_links_requires_a_session_and_is_scoped_to_the_owner(app):
    owner, _ = new_user_client(app)
    document = upload(owner)
    create_share(owner, document["id"])

    anonymous = app.test_client()
    assert anonymous.get("/api/shares").status_code == 401

    intruder, _ = new_user_client(app)
    assert intruder.get("/api/shares").get_json()["data"]["total"] == 0
    assert owner.get("/api/shares").get_json()["data"]["total"] >= 1


# --------------------------------------------------------------- housekeeping

def test_views_are_counted(app):
    owner, _ = new_user_client(app)
    document = upload(owner)
    share = create_share(owner, document["id"])

    visitor = app.test_client()
    for _ in range(3):
        visitor.get(f"/api/share/{share['token']}")

    listed = owner.get(f"/api/documents/{document['id']}/shares").get_json()["data"]
    assert listed["shares"][0]["view_count"] == 3
    assert listed["shares"][0]["last_viewed_at"] is not None


def test_deleting_the_document_closes_its_links(app):
    """A share must not outlive the document it points at."""
    from repositories.document_repository import DocumentRepository

    owner, user = new_user_client(app)
    document = upload(owner)
    share = create_share(owner, document["id"])

    visitor = app.test_client()
    assert visitor.get(f"/api/share/{share['token']}").status_code == 200

    DocumentRepository.delete(document["id"], user["id"])

    assert visitor.get(f"/api/share/{share['token']}").status_code == 404
