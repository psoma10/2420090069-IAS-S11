"""Algorithm and encryption-preview endpoints (API_CONTRACT.md 3.2, 3.3).

The preview endpoints exist for the side-by-side plaintext/ciphertext screen:
they transform text without creating a document or a transfer, so the
interface can demonstrate an algorithm without leaving records behind.
"""

from __future__ import annotations

from flask import Blueprint, request

from core.auth import login_required
from core.responses import success
from core.validation import require_fields, require_json
from services.crypto_service import CryptoService

encryption_bp = Blueprint("encryption", __name__, url_prefix="/api")


@encryption_bp.get("/algorithms")
def list_algorithms():
    """Public: the frontend needs this before login to render the selector."""
    return success(CryptoService.algorithms(), "Algorithms retrieved")


@encryption_bp.post("/algorithms/<algorithm_id>/key")
def generate_key(algorithm_id: str):
    """Generate a valid random key for an algorithm."""
    data = require_json(request, allow_empty=True) or {}
    result = CryptoService.generate_key(algorithm_id, data.get("key_size"))
    return success(result, "Key generated")


@encryption_bp.post("/encryption/preview")
@login_required
def encryption_preview():
    """Encrypt a snippet for display. Creates no document and no transfer."""
    data = require_json(request)
    require_fields(data, "algorithm", "key", "text")

    result = CryptoService.encrypt(data["algorithm"], data["text"], data["key"])

    return success(
        {
            "algorithm": result.algorithm,
            "algorithm_label": result.algorithm_label,
            # For a lossy cipher this is the normalized text that was actually
            # encrypted, not the raw input — otherwise the preview would show a
            # transformation that did not happen.
            "plaintext": result.normalized_input or result.input_text,
            "original_text": result.input_text,
            "ciphertext": result.output_text,
            "plaintext_size": result.input_size,
            "ciphertext_size": result.output_size,
            "encryption_time_ms": result.elapsed_ms,
            "key_size": result.key_size,
            "lossless": result.lossless,
            "authenticated": result.authenticated,
        },
        "Preview generated",
    )


@encryption_bp.post("/encryption/decrypt-preview")
@login_required
def decryption_preview():
    """Decrypt a snippet for display."""
    data = require_json(request)
    require_fields(data, "algorithm", "key", "ciphertext")

    result = CryptoService.decrypt(data["algorithm"], data["ciphertext"], data["key"])

    return success(
        {
            "algorithm": result.algorithm,
            "algorithm_label": result.algorithm_label,
            "ciphertext": result.input_text,
            "plaintext": result.output_text,
            "ciphertext_size": result.input_size,
            "plaintext_size": result.output_size,
            "decryption_time_ms": result.elapsed_ms,
            "key_size": result.key_size,
            "integrity_verified": CryptoService.integrity_verified(result.algorithm),
        },
        "Decryption preview generated",
    )
