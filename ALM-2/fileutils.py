"""Small helpers shared by the AES file transfer flows (client<->server)."""

import hashlib


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def preview_text(data: bytes, num_chars: int = 300) -> str:
    """Readable preview of a text payload, for terminal display."""
    text = data.decode("utf-8", errors="replace")
    snippet = text[:num_chars]
    suffix = " ..." if len(text) > num_chars else ""
    return snippet + suffix


def preview_hex(data: bytes, num_bytes: int = 32) -> str:
    """Hex dump preview, used for ciphertext (not human-readable)."""
    snippet = data[:num_bytes]
    suffix = " ..." if len(data) > num_bytes else ""
    return snippet.hex(" ") + suffix
