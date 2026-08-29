"""Integration tests for the document upload/storage slice.

These run against a real Flask app, the real Neon database, and a real
filesystem. Nothing is mocked: an assertion that a file landed inside the
upload directory is checking an actual directory listing, and an assertion
that another user's document 404s is checking an actual SQL ``WHERE user_id``.

Two accommodations to the shared environment:

* ``Config.UPLOAD_DIR`` is redirected at a pytest ``tmp_path`` for the whole
  module, so the suite never writes into ``storage/``.
* ``truncate_all()`` is never called. Other agents are working against this
  same database concurrently, so every test creates its own user with a random
  email and asserts only about rows it created.

Authentication is stubbed by writing ``session["user_id"]`` directly, because
``core/auth.py`` is owned by another agent and may not exist yet. That keeps
these tests focused on the document slice; the 401 path is covered only when
the real decorator is importable.
"""

from __future__ import annotations

import importlib
import io
import sys
import uuid
from pathlib import Path

import pytest
from flask import Blueprint, Flask, session

# The backend package root is a plain directory, not an installed package, so
# it has to be importable before the application modules below resolve. This
# matches the convention already used by tests/crypto/.
BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from config import Config, TestConfig  # noqa: E402
from core.errors import AppError  # noqa: E402
from core.responses import failure  # noqa: E402
from database.connection import apply_schema, init_pool  # noqa: E402
from repositories.user_repository import UserRepository  # noqa: E402

#: Blueprint mount point (API_CONTRACT.md 3.4). Used as an absolute path
#: because the test client resolves a bare "" against the site root.
DOCS = "/api/documents"

# ---------------------------------------------------------------- fixtures


@pytest.fixture(scope="module", autouse=True)
def _database():
    """Open the pool once and make sure the schema is present."""
    init_pool(TestConfig.DATABASE_URL)
    apply_schema()


@pytest.fixture(scope="module", autouse=True)
def _upload_dir(tmp_path_factory):
    """Point storage at a temp directory for the whole module."""
    original = Config.UPLOAD_DIR
    directory = tmp_path_factory.mktemp("uploads")
    Config.UPLOAD_DIR = directory
    yield directory
    Config.UPLOAD_DIR = original


@pytest.fixture()
def upload_dir(_upload_dir) -> Path:
    return Path(_upload_dir)


@pytest.fixture()
def app(_database, _upload_dir):
    """A minimal app carrying only the documents blueprint.

    Building the app here rather than importing ``app.py`` keeps this suite
    independent of routes other agents are still writing.
    """
    from routes.documents import documents_bp

    application = Flask(__name__)
    application.config.from_object(TestConfig)

    application.register_blueprint(documents_bp)

    @application.errorhandler(AppError)
    def _handle_app_error(exc: AppError):
        return failure(exc.message, exc.code, exc.status_code)

    # A login-free probe so the auth stub can be verified independently of the
    # real decorator.
    probe = Blueprint("probe", __name__)

    @probe.get("/probe/session")
    def _probe():
        return {"user_id": session.get("user_id")}

    application.register_blueprint(probe)
    return application


@pytest.fixture()
def make_user():
    """Create a real user row with a unique email."""

    def _make():
        suffix = uuid.uuid4().hex[:12]
        return UserRepository.create(
            f"Doc Tester {suffix}",
            f"doc-{suffix}@cybervault.test",
            "pbkdf2:sha256:test$notarealhash",
        )

    return _make


@pytest.fixture()
def user(make_user):
    return make_user()


@pytest.fixture()
def client(app, user):
    """A test client already authenticated as ``user``."""
    test_client = app.test_client()
    with test_client.session_transaction() as sess:
        sess["user_id"] = user["id"]
    return test_client


def client_for(app, user_row):
    """Build a second authenticated client, for cross-user tests."""
    test_client = app.test_client()
    with test_client.session_transaction() as sess:
        sess["user_id"] = user_row["id"]
    return test_client


def upload(client, *, content=b"hello", filename="notes.txt", **form):
    data = {"file": (io.BytesIO(content), filename)}
    data.update(form)
    return client.post(DOCS, data=data, content_type="multipart/form-data")


# ------------------------------------------------------------- happy paths


def test_upload_valid_txt_returns_201_with_contract_shape(client):
    content = b"a" * (8 * 1024)
    response = upload(client, content=content, filename="confidential.txt",
                      algorithm="aes")

    assert response.status_code == 201
    body = response.get_json()
    assert body["success"] is True
    assert body["message"] == "Document uploaded successfully"

    document = body["data"]
    assert document["filename"] == "confidential.txt"
    assert document["size"] == 8 * 1024
    assert document["status"] == "UPLOADED"
    assert document["direction"] == "CLIENT_TO_SERVER"
    assert document["algorithm"] == "aes"
    assert isinstance(document["id"], int)
    assert document["created_at"].endswith("Z")
    # The on-disk name is storage detail and must not be echoed back.
    assert "stored_name" not in document


def test_upload_writes_the_real_bytes_to_disk(client, upload_dir):
    content = b"the quick brown fox\njumped\n"
    document_id = upload(client, content=content).get_json()["data"]["id"]

    matches = list(upload_dir.glob(f"{document_id}_*"))
    assert len(matches) == 1
    assert matches[0].read_bytes() == content


def test_boundary_10240_bytes_is_accepted(client):
    response = upload(client, content=b"x" * 10240)
    assert response.status_code == 201
    assert response.get_json()["data"]["size"] == 10240


def test_10241_bytes_is_rejected_with_both_sizes_named(client):
    response = upload(client, content=b"x" * 10241)

    assert response.status_code == 413
    body = response.get_json()
    assert body["error"]["code"] == "FILE_TOO_LARGE"
    # The contract requires the actual and the allowed size in the message,
    # and the two must be distinguishable -- "10 KB exceeds the 10 KB limit"
    # would satisfy a naive substring check while telling the user nothing.
    message = body["message"]
    assert "10 KB" in message
    assert "10241 bytes" in message
    assert "client to server" in message
    assert message.startswith("File size 10241 bytes exceeds the 10 KB limit")


def test_large_overage_reports_kilobytes(client):
    """Well over the limit, KB is the readable unit and both sizes differ."""
    response = upload(client, content=b"x" * 13720)
    message = response.get_json()["message"]
    assert response.status_code == 413
    assert "13.4 KB" in message
    assert "10 KB" in message


def test_server_to_client_limit_is_5120(client):
    """5121 bytes is fine for CLIENT_TO_SERVER but not SERVER_TO_CLIENT."""
    rejected = upload(client, content=b"x" * 5121, direction="SERVER_TO_CLIENT")
    assert rejected.status_code == 413
    body = rejected.get_json()
    assert body["error"]["code"] == "FILE_TOO_LARGE"
    assert "5 KB" in body["message"]
    assert "server to client" in body["message"]

    # Same payload, other direction: accepted. This is what proves the limit
    # is per-direction rather than a single global ceiling.
    accepted = upload(client, content=b"x" * 5121, direction="CLIENT_TO_SERVER")
    assert accepted.status_code == 201


def test_server_to_client_boundary_5120_is_accepted(client):
    response = upload(client, content=b"x" * 5120, direction="SERVER_TO_CLIENT")
    assert response.status_code == 201
    data = response.get_json()["data"]
    assert data["direction"] == "SERVER_TO_CLIENT"
    assert data["size"] == 5120


# --------------------------------------------------------------- rejections


@pytest.mark.parametrize("filename", ["report.pdf", "payload.exe", "noextension"])
def test_non_txt_extensions_are_rejected(client, filename):
    response = upload(client, filename=filename)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_empty_file_is_rejected(client):
    response = upload(client, content=b"")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "EMPTY_FILE"


def test_binary_bytes_with_txt_name_are_rejected(client):
    """A renamed binary is not a readable .txt, whatever its extension says."""
    response = upload(client, content=b"\xff\xfe\x00binary", filename="sneaky.txt")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_missing_file_part_is_a_validation_error(client):
    response = client.post(DOCS, data={"direction": "CLIENT_TO_SERVER"},
                           content_type="multipart/form-data")
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"


def test_oversized_and_wrong_type_reports_the_type_first(client):
    """Validation order is deterministic: extension is checked before size."""
    response = upload(client, content=b"x" * 20000, filename="huge.pdf")
    assert response.get_json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_empty_beats_size_and_type_order_is_stable(client):
    """A zero-byte .txt is EMPTY_FILE, not FILE_TOO_LARGE or a DB error."""
    response = upload(client, content=b"", filename="blank.txt")
    assert response.get_json()["error"]["code"] == "EMPTY_FILE"


# ------------------------------------------------------------ path traversal


@pytest.mark.parametrize(
    "hostile",
    [
        "../../../etc/passwd",
        "..\\..\\win.ini",
        "/etc/passwd",
        "....//....//escape.txt",
    ],
)
def test_traversal_filenames_land_inside_the_upload_dir(client, upload_dir, hostile):
    """A hostile name must never place a file outside UPLOAD_DIR.

    The name is given a .txt suffix so it clears the extension check and
    actually reaches the path-building code — testing traversal against a name
    that is rejected for being a .passwd would prove nothing.
    """
    before = {p for p in upload_dir.rglob("*")}
    escape_targets = [
        upload_dir.parent / "passwd",
        upload_dir.parent / "win.ini",
        upload_dir.parent / "escape.txt",
    ]

    response = upload(client, content=b"traversal probe", filename=f"{hostile}.txt")
    assert response.status_code == 201
    document_id = response.get_json()["data"]["id"]

    # The file exists, exactly once, directly inside the upload directory.
    created = {p for p in upload_dir.rglob("*")} - before
    written = [p for p in created if p.is_file()]
    assert len(written) == 1
    stored = written[0]
    assert stored.parent.resolve() == upload_dir.resolve()
    assert stored.read_bytes() == b"traversal probe"
    assert stored.name.startswith(f"{document_id}_")
    # No separator survived into the stored name.
    assert "/" not in stored.name and "\\" not in stored.name

    # And nothing appeared next to the upload directory.
    for target in escape_targets:
        assert not target.exists()

    # The resolved path is genuinely under UPLOAD_DIR.
    assert upload_dir.resolve() in stored.resolve().parents


def test_original_filename_is_preserved_for_display(client):
    """The hostile name is kept in the DB column but never used as a path."""
    response = upload(client, filename="../../../etc/passwd.txt")
    assert response.get_json()["data"]["filename"] == "../../../etc/passwd.txt"


@pytest.mark.parametrize("filename", ["...txt", ".txt", "..txt", "   .txt"])
def test_degenerate_txt_names_are_stored_safely(client, upload_dir, filename):
    """Names that survive secure_filename only as a stub must still store."""
    response = upload(client, content=b"edge case", filename=filename)
    assert response.status_code == 201

    document_id = response.get_json()["data"]["id"]
    matches = [p for p in upload_dir.glob(f"{document_id}_*") if p.is_file()]
    assert len(matches) == 1
    assert matches[0].read_bytes() == b"edge case"
    # A real name component, never a path ending in a bare separator.
    assert matches[0].name.startswith(f"{document_id}_")
    assert len(matches[0].name) > len(f"{document_id}_")
    assert matches[0].parent.resolve() == upload_dir.resolve()


def test_stored_name_falls_back_when_secure_filename_returns_empty():
    """The fallback branch, driven directly.

    Every name that ``secure_filename`` empties ("...", "..", ".") lacks a
    .txt extension and is rejected before path building, so this branch is
    unreachable through the HTTP route today. It is asserted here so the
    guard cannot silently rot into producing "7_" if the extension rule
    changes later.
    """
    from services.document_service import _safe_stored_name

    from werkzeug.utils import secure_filename

    assert secure_filename("...") == ""
    assert _safe_stored_name(7, "...") == "7_document.txt"
    assert _safe_stored_name(7, "") == "7_document.txt"


def test_dotdot_only_filename_is_handled(client, upload_dir):
    response = upload(client, content=b"dots", filename="...")
    # No .txt extension, so this is rejected before it reaches path building.
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE_TYPE"


# ------------------------------------------------------------ read & isolate


def test_get_returns_content_and_preview(client):
    body = "line of text\n" * 500
    document_id = upload(client, content=body.encode()).get_json()["data"]["id"]

    response = client.get(f"/api/documents/{document_id}")
    assert response.status_code == 200

    data = response.get_json()["data"]
    assert data["content"] == body
    assert data["preview"] == body[:2000]
    assert len(data["preview"]) == 2000
    assert data["id"] == document_id


def test_preview_equals_content_when_short(client):
    document_id = upload(client, content=b"short").get_json()["data"]["id"]
    data = client.get(f"/api/documents/{document_id}").get_json()["data"]
    assert data["preview"] == data["content"] == "short"


def test_get_another_users_document_is_404(app, client, make_user):
    """Ownership: a real, existing id belonging to someone else must 404."""
    document_id = upload(client, content=b"private").get_json()["data"]["id"]

    intruder = client_for(app, make_user())
    response = intruder.get(f"/api/documents/{document_id}")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "DOCUMENT_NOT_FOUND"
    # The owner can still read it -- the 404 is authorization, not deletion.
    assert client.get(f"/api/documents/{document_id}").status_code == 200


def test_download_of_another_users_document_is_404(app, client, make_user):
    document_id = upload(client, content=b"private").get_json()["data"]["id"]
    intruder = client_for(app, make_user())
    assert intruder.get(f"/api/documents/{document_id}/download").status_code == 404


def test_get_nonexistent_id_is_404(client):
    response = client.get("/api/documents/99999999")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "DOCUMENT_NOT_FOUND"


def test_list_returns_only_the_callers_documents(app, client, make_user):
    mine = {upload(client, filename=f"mine-{i}.txt").get_json()["data"]["id"]
            for i in range(3)}

    other_user = make_user()
    other_client = client_for(app, other_user)
    theirs = upload(other_client, filename="theirs.txt").get_json()["data"]["id"]

    body = client.get(DOCS).get_json()["data"]
    listed = {d["id"] for d in body["documents"]}

    assert mine <= listed
    assert theirs not in listed
    assert body["total"] >= len(mine)

    # And symmetrically, the other user does not see mine.
    other_listed = {d["id"] for d in other_client.get(DOCS).get_json()["data"]["documents"]}
    assert theirs in other_listed
    assert not (mine & other_listed)


def test_list_filters_by_direction(client):
    c2s = upload(client, content=b"one").get_json()["data"]["id"]
    s2c = upload(client, content=b"two",
                 direction="SERVER_TO_CLIENT").get_json()["data"]["id"]

    body = client.get(f"{DOCS}?direction=SERVER_TO_CLIENT").get_json()["data"]
    listed = {d["id"] for d in body["documents"]}
    assert s2c in listed
    assert c2s not in listed


# ---------------------------------------------------------------- download


def test_download_returns_plain_text_attachment(client):
    content = b"downloadable content\nsecond line\n"
    document_id = upload(client, content=content,
                         filename="report.txt").get_json()["data"]["id"]

    response = client.get(f"/api/documents/{document_id}/download")

    assert response.status_code == 200
    assert response.mimetype == "text/plain"
    assert response.data == content
    disposition = response.headers["Content-Disposition"]
    assert "attachment" in disposition
    assert "report.txt" in disposition


def test_disposition_filename_sanitizer_strips_injection_characters():
    """The Content-Disposition name cannot carry quotes or CRLF.

    This is asserted against the helper rather than over HTTP on purpose: the
    multipart encoder truncates a filename at the first quote, so a crafted
    name never reaches the server intact and an end-to-end version of this
    test would pass without exercising the guard at all. The guard still
    matters -- the name comes from the client and is interpolated into a
    header -- so it is tested where it lives.
    """
    from routes.documents import _header_safe_filename

    assert _header_safe_filename('ev"il.txt') == "evil.txt"
    assert _header_safe_filename("a\r\nX-Injected: yes.txt") == "aX-Injected: yes.txt"
    assert _header_safe_filename('..\\..\\win.ini') == "....win.ini"
    # Nothing usable left -> a safe default, never an empty header value.
    assert _header_safe_filename('"') == "document.txt"
    assert _header_safe_filename("") == "document.txt"


def test_download_disposition_survives_a_hostile_upload_name(client):
    """End-to-end: a traversal name still yields a well-formed header."""
    document_id = upload(
        client, content=b"x", filename="../../../etc/passwd.txt"
    ).get_json()["data"]["id"]

    response = client.get(f"/api/documents/{document_id}/download")
    assert response.status_code == 200
    disposition = response.headers["Content-Disposition"]
    assert disposition.startswith("attachment; filename=")
    assert "\r" not in disposition and "\n" not in disposition
    # Exactly the opening and closing quotes of the quoted-string, no more.
    assert disposition.count('"') == 2


# ------------------------------------------------------------------- auth


def test_unauthenticated_request_is_401(app):
    """Only meaningful once the real decorator exists; skipped otherwise."""
    try:
        auth = importlib.import_module("core.auth")
    except ModuleNotFoundError:  # pragma: no cover - depends on sibling agent
        pytest.skip("core/auth.py not written yet")

    if not hasattr(auth, "login_required"):  # pragma: no cover
        pytest.skip("core.auth.login_required not available")

    anonymous = app.test_client()
    response = anonymous.get(DOCS)
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "UNAUTHORIZED"
