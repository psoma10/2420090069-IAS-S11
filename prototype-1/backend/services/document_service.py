"""Document upload and retrieval.

This service owns everything between "a browser posted a file" and "a row
exists in ``documents`` with its plaintext safely on disk". Routes above it do
no validation and no filesystem work; the repository below it does no I/O
beyond SQL.

Two properties are worth stating explicitly, because the rest of the file is
written to preserve them.

**Validation order is part of the contract.** Each rejection has its own error
code (API_CONTRACT.md section 4), and a file can fail several checks at once —
a 20 KB ``.pdf`` is both the wrong type and too large. Checks therefore run in
the fixed order documented in :meth:`DocumentService.upload` so that the code
a client receives is deterministic rather than dependent on which check
happened to run first.

**No request-supplied string ever becomes a path component.** The stored name
is built server-side as ``{document_id}_{secure_filename(original)}``
(ARCHITECTURE.md section 6), and the assembled path is then re-checked against
``UPLOAD_DIR`` after resolution. See :func:`_safe_stored_name` and
:func:`_resolve_within_upload_dir` for why both layers exist.
"""

from __future__ import annotations

import logging
from pathlib import Path

from werkzeug.utils import secure_filename

from config import Config
from core.errors import (
    DocumentNotFoundError,
    EmptyFileError,
    FileTooLargeError,
    InvalidFileTypeError,
    ValidationError,
)
from repositories.document_repository import DocumentRepository

logger = logging.getLogger(__name__)

CLIENT_TO_SERVER = "CLIENT_TO_SERVER"
SERVER_TO_CLIENT = "SERVER_TO_CLIENT"
VALID_DIRECTIONS = (CLIENT_TO_SERVER, SERVER_TO_CLIENT)

#: Human wording for each direction, used in FILE_TOO_LARGE messages.
_DIRECTION_LABEL = {
    CLIENT_TO_SERVER: "client to server",
    SERVER_TO_CLIENT: "server to client",
}

#: How many characters of plaintext ``GET /api/documents/{id}`` previews.
PREVIEW_CHARS = 2000

#: Fallback when ``secure_filename`` reduces the client's name to nothing —
#: e.g. "...", "..", or a name made entirely of characters it strips.
FALLBACK_FILENAME = "document.txt"


def _limit_for(direction: str) -> int:
    """Bytes allowed in this direction (ARCHITECTURE.md section 6)."""
    if direction == SERVER_TO_CLIENT:
        return Config.MAX_SERVER_UPLOAD_BYTES
    return Config.MAX_CLIENT_UPLOAD_BYTES


def _kb(num_bytes: int, *, exact: bool = False) -> str:
    """Format a byte count in KB for a human-facing message.

    An exact multiple of 1024 renders without a decimal ("10 KB") so that the
    limit half of the message reads cleanly. Anything else keeps one decimal.

    ``exact=True`` additionally guards the *actual size* half. A file one byte
    over the limit is 10.0009... KB, which rounds to "10.0 KB" and would
    produce the self-contradictory "File size 10.0 KB exceeds the 10 KB
    limit". When rounding would hide a difference like that, the byte count is
    named outright instead, so the message always distinguishes the two
    numbers it is comparing.
    """
    if num_bytes % 1024 == 0:
        return f"{num_bytes // 1024} KB"

    kilobytes = num_bytes / 1024
    if exact and f"{kilobytes:.1f}" == f"{round(kilobytes)}.0":
        return f"{num_bytes} bytes"
    return f"{kilobytes:.1f} KB"


def _safe_stored_name(document_id: int, original: str) -> str:
    """Build the on-disk name for a document.

    Layer one of the path-traversal defence. ``secure_filename`` strips
    directory separators, drive letters, and leading dots, so "../../etc/passwd"
    becomes "etc_passwd" and "..\\\\..\\\\win.ini" becomes "win.ini" — a bare
    name with no path structure left in it. It can also return an empty string
    (for "..." or a name of only stripped characters), which would otherwise
    produce a path ending in a bare separator, so an empty result falls back to
    a generated name.

    The document id prefix makes the result unique even when two users upload
    files that reduce to the same safe name.
    """
    safe = secure_filename(original or "")
    if not safe:
        safe = FALLBACK_FILENAME
    return f"{document_id}_{safe}"


def _resolve_within_upload_dir(stored_name: str) -> Path:
    """Join ``stored_name`` onto ``UPLOAD_DIR`` and prove it stayed inside.

    Layer two of the path-traversal defence, and deliberately redundant with
    :func:`_safe_stored_name`. ``secure_filename`` is a blocklist-shaped
    function: it is good, but a bypass in it would silently become an
    arbitrary-file-write. This check is shape-independent — it resolves the
    final path (following ``..`` and symlinks) and refuses anything that does
    not land under the upload directory, so a hypothetical bypass upstream
    fails closed here rather than escaping ``storage/``.
    """
    upload_dir = Path(Config.UPLOAD_DIR).resolve()
    candidate = (upload_dir / stored_name).resolve()

    if candidate == upload_dir or upload_dir not in candidate.parents:
        logger.warning(
            "Rejected upload path outside the storage directory (stored_name=%r)",
            stored_name,
        )
        raise ValidationError("The uploaded file could not be stored safely")
    return candidate


class DocumentService:
    """Upload, read, and list documents."""

    # ---------------------------------------------------------------- upload
    @staticmethod
    def upload(user_id: int, file_storage, direction: str | None = None,
               algorithm: str | None = None) -> dict:
        """Validate an uploaded file, store it, and record it.

        Checks run in this order, and each has its own error code:

        1. a filename is present and ends in ``.txt`` -> ``INVALID_FILE_TYPE``
        2. the file has content -> ``EMPTY_FILE``
        3. it is within the limit for its direction -> ``FILE_TOO_LARGE``
        4. its bytes decode as UTF-8 -> ``INVALID_FILE_TYPE``
        5. the direction is one we know -> ``VALIDATION_ERROR``

        The row is inserted before the file is written, because the stored
        name embeds the document id (ARCHITECTURE.md section 6). If the write
        then fails the row is deleted again, so a document never claims to
        exist with no bytes behind it.
        """
        if file_storage is None:
            raise ValidationError("A file is required")

        original = (file_storage.filename or "").strip()

        # 1. extension. Checked on the client-supplied name, which is only
        #    ever inspected here -- it never reaches the filesystem.
        if not original or not original.lower().endswith(".txt"):
            raise InvalidFileTypeError()

        # 2. content. Read once; the stream is not rewound afterwards because
        #    everything below works from these bytes.
        raw = file_storage.read()
        if not raw:
            raise EmptyFileError()

        # Direction is normalised before the size check so the limit and the
        # message match, but an unknown value is not rejected until step 5 --
        # an oversized file with a typo'd direction is still FILE_TOO_LARGE
        # against the default limit, which is the stricter answer.
        normalized_direction = (direction or CLIENT_TO_SERVER).strip().upper()

        # 3. size, per direction.
        limit = _limit_for(normalized_direction)
        if len(raw) > limit:
            label = _DIRECTION_LABEL.get(
                normalized_direction, _DIRECTION_LABEL[CLIENT_TO_SERVER]
            )
            raise FileTooLargeError(
                f"File size {_kb(len(raw), exact=True)} exceeds the {_kb(limit)} limit "
                f"for {label} transfers"
            )

        # 4. content must be human-readable text, not a renamed binary.
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise InvalidFileTypeError(
                "Only human-readable .txt files are supported by this prototype"
            ) from exc

        # 5. direction must be one the state machine understands.
        if normalized_direction not in VALID_DIRECTIONS:
            raise ValidationError(
                "direction must be CLIENT_TO_SERVER or SERVER_TO_CLIENT"
            )

        normalized_algorithm = (algorithm or "").strip().lower() or None

        # The document text is stored in the row itself. The original design
        # kept only a path and wrote the bytes to storage/uploads, which works
        # locally and loses every document on a host with an ephemeral
        # filesystem: a redeploy wipes the disk, the rows survive, and each one
        # then points at bytes that are gone. At a 10 KB ceiling the content
        # belongs in the database, which is the only durable store here.
        #
        # The id is needed to build the stored name, so the row goes in first
        # with a placeholder and the real name is written back once known.
        document = DocumentRepository.create(
            user_id=user_id,
            filename=original,
            stored_name="",
            file_size=len(raw),
            algorithm=normalized_algorithm,
            direction=normalized_direction,
            content=text,
        )

        stored_name = _safe_stored_name(document["id"], original)
        try:
            document = DocumentService._persist_stored_name(
                document["id"], stored_name
            )
        except Exception:
            # The row is the document now, so a failure here leaves nothing
            # useful behind.
            DocumentRepository.delete(document["id"], user_id)
            raise

        # A copy on disk, written after the durable store has already
        # succeeded. It makes the uploaded files visible while developing and
        # is never read back unless a row predates the content column, so a
        # read-only or ephemeral filesystem is not an error worth failing an
        # upload over.
        try:
            path = _resolve_within_upload_dir(stored_name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        except (OSError, ValidationError):
            logger.info(
                "Could not write the on-disk copy of document %s; "
                "the stored content is unaffected",
                document["id"],
            )

        return DocumentService._to_api(document)

    @staticmethod
    def _persist_stored_name(document_id: int, stored_name: str) -> dict:
        """Write the generated stored name back onto the row.

        This is the one write the repository does not expose, and it is a
        server-generated value rather than client input.
        """
        from database.connection import get_cursor
        from repositories.base import serialize
        from repositories.document_repository import FIELDS

        with get_cursor() as cur:
            cur.execute(
                f"UPDATE documents SET stored_name = %s WHERE id = %s "
                f"RETURNING {FIELDS}",
                (stored_name, document_id),
            )
            return serialize(cur.fetchone())

    # ------------------------------------------------------------- retrieval
    @staticmethod
    def get(document_id: int, user_id: int) -> dict:
        """Return one document plus its plaintext and a preview.

        The owner uploaded this text, so returning it is not a disclosure.
        Ownership is enforced by the repository's ``user_id`` filter: another
        user's document is indistinguishable from a missing one.
        """
        document = DocumentService._require(document_id, user_id)
        content = DocumentService._read_file(document)
        payload = DocumentService._to_api(document)
        payload["content"] = content
        payload["preview"] = content[:PREVIEW_CHARS]
        return payload

    @staticmethod
    def list(user_id: int, *, direction: str | None = None,
             status: str | None = None, limit: int = 50,
             offset: int = 0) -> tuple[list[dict], int]:
        """Return ``(documents, total)`` for this user only."""
        rows, total = DocumentRepository.list_for_user(
            user_id,
            direction=direction,
            status=status,
            limit=limit,
            offset=offset,
        )
        return [DocumentService._to_api(row) for row in rows], total

    @staticmethod
    def read_content(document_id: int, user_id: int) -> str:
        """Return the stored plaintext for a document this user owns."""
        return DocumentService._read_file(
            DocumentService._require(document_id, user_id)
        )

    @staticmethod
    def file_path(document: dict) -> Path:
        """Resolve a document row to its location on disk.

        Goes through the same containment check as the upload path, so a row
        whose ``stored_name`` was somehow tampered with cannot be used to read
        outside the upload directory.
        """
        return _resolve_within_upload_dir(document["stored_name"])

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _require(document_id: int, user_id: int) -> dict:
        # Every path that reads a document's text funnels through here, so the
        # content is fetched with the row rather than in a second query.
        document = DocumentRepository.find_by_id(
            document_id, user_id, with_content=True
        )
        if document is None:
            raise DocumentNotFoundError()
        return document

    @staticmethod
    def _read_file(document: dict) -> str:
        """Return a document's text.

        The database column is authoritative. The filesystem is consulted only
        for rows written before that column existed, whose bytes may still be
        on disk if the process has not been redeployed since.
        """
        content = document.get("content")
        if content is not None:
            return content

        try:
            path = DocumentService.file_path(document)
            return path.read_text(encoding="utf-8")
        except (FileNotFoundError, ValidationError) as exc:
            # A row from before the content column whose file is also gone —
            # on an ephemeral filesystem, that is every such row after the
            # first redeploy. The bytes are unrecoverable, so this is reported
            # as a missing document rather than a 500 leaking a path.
            logger.error(
                "Document %s has no stored content and no file on disk",
                document["id"],
            )
            raise DocumentNotFoundError(
                "The stored file for this document is missing"
            ) from exc

    @staticmethod
    def _to_api(document: dict) -> dict:
        """Shape a row into the response object of API_CONTRACT.md 3.4.

        ``file_size`` is renamed to ``size`` and ``stored_name``/``user_id``
        are dropped: the client has no use for the on-disk name, and echoing
        it back would expose the storage layout for no benefit.
        """
        return {
            "id": document["id"],
            "filename": document["filename"],
            "size": document["file_size"],
            "algorithm": document["algorithm"],
            "direction": document["direction"],
            "status": document["status"],
            "created_at": document["created_at"],
        }


__all__ = ["DocumentService", "PREVIEW_CHARS"]
