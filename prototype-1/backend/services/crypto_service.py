"""The single door into the cipher implementations.

Routes and other services call :class:`CryptoService`; nothing above this layer
imports ``crypto.caesar`` or its siblings directly (ARCHITECTURE.md section 1).
That keeps algorithm dispatch, timing, error translation and logging in one
place, and means adding a cipher touches the registry and nothing else.

Cipher modules signal every failure with ``ValueError``. This service converts
those into the typed errors in :mod:`core.errors` so the HTTP layer can map
them to stable codes without knowing anything about ciphers.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from core.errors import (
    DecryptionFailedError,
    EncryptionFailedError,
    InvalidKeyError,
    UnsupportedAlgorithmError,
    ValidationError,
)
from crypto import registry

logger = logging.getLogger(__name__)

# Plaintext shares its ceiling with the largest upload the prototype accepts
# (API_CONTRACT.md section 3.3).
MAX_TEXT_LENGTH = 10240

# Ciphertext needs its own, larger ceiling: every algorithm expands its input.
# AES adds a 32-byte header and base64 costs a third on top; SDES emits nine
# characters per input byte. Reusing the plaintext limit here would make the
# largest legal upload encryptable but not decryptable, which is precisely the
# headline scenario. Sized for the worst case with room to spare.
MAX_CIPHERTEXT_LENGTH = 10240 * 12


@dataclass(frozen=True)
class CryptoResult:
    """Outcome of one encrypt or decrypt operation."""

    algorithm: str
    algorithm_label: str
    input_text: str
    output_text: str
    input_size: int
    output_size: int
    elapsed_ms: float
    key_size: int | None = None
    lossless: bool = True
    authenticated: bool = False
    normalized_input: str | None = None


def _resolve(algorithm_id: str) -> registry.Algorithm:
    algo = registry.get(algorithm_id)
    if algo is None:
        known = ", ".join(registry.ALGORITHM_ORDER)
        raise UnsupportedAlgorithmError(
            f"Unsupported encryption algorithm: {algorithm_id!r}. Supported: {known}"
        )
    return algo


def _key_size(algo: registry.Algorithm, key: str) -> int | None:
    """Key size in bits, or ``None`` for the classical ciphers.

    Reporting ``None`` is deliberate: inventing a bit count for Caesar would
    imply a comparability with AES that does not exist.
    """
    if algo.id != "aes":
        return None
    try:
        return algo.module.key_size_bits(key)
    except Exception:
        return None


class CryptoService:
    """Algorithm-agnostic encryption and decryption."""

    @staticmethod
    def algorithms() -> list[dict]:
        return registry.public_list()

    @staticmethod
    def validate(algorithm_id: str, key: str) -> None:
        """Check a key without performing an operation.

        Raises :class:`InvalidKeyError` with the cipher's own explanation,
        which names the expected format.
        """
        algo = _resolve(algorithm_id)
        try:
            algo.module.validate_key(key)
        except ValueError as exc:
            raise InvalidKeyError(str(exc)) from exc

    @staticmethod
    def generate_key(algorithm_id: str, key_size: int | None = None) -> dict:
        """Produce a valid random key for the algorithm."""
        algo = _resolve(algorithm_id)
        try:
            if algo.id == "aes":
                size = 256 if key_size is None else int(key_size)
                if size not in algo.key_sizes:
                    raise ValidationError(
                        f"Unsupported AES key size: {key_size}. "
                        f"Choose one of {', '.join(str(s) for s in algo.key_sizes)}."
                    )
                key = algo.module.generate_key(size)
            else:
                key = algo.module.generate_key()
        except ValidationError:
            raise
        except (ValueError, TypeError) as exc:
            raise ValidationError(f"Could not generate a key: {exc}") from exc

        return {
            "algorithm": algo.id,
            "key": key,
            "key_size": _key_size(algo, key),
        }

    @staticmethod
    def _check_text(text: str, *, field: str = "text",
                    max_length: int = MAX_TEXT_LENGTH) -> str:
        if text is None or not isinstance(text, str):
            raise ValidationError(f"The {field} field must be a string")
        if len(text) > max_length:
            raise ValidationError(
                f"The {field} field exceeds the {max_length} character limit"
            )
        return text

    @staticmethod
    def encrypt(algorithm_id: str, text: str, key: str) -> CryptoResult:
        """Encrypt ``text``, timing the operation.

        The elapsed time measures only the cipher call, so the number shown in
        the encryption-details panel reflects the algorithm rather than
        surrounding request overhead.
        """
        algo = _resolve(algorithm_id)
        CryptoService._check_text(text)

        # Validate the key first so a bad key is INVALID_KEY (400) rather than
        # ENCRYPTION_FAILED (500) — it is the caller's mistake, not ours.
        try:
            algo.module.validate_key(key)
        except ValueError as exc:
            raise InvalidKeyError(str(exc)) from exc

        started = time.perf_counter()
        try:
            ciphertext = algo.module.encrypt(text, key)
        except ValueError as exc:
            raise InvalidKeyError(str(exc)) from exc
        except Exception as exc:
            # Never let a cipher's internal error text reach the client.
            logger.exception("Encryption failed for algorithm %s", algo.id)
            raise EncryptionFailedError() from exc
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

        normalized = None
        if not algo.lossless and hasattr(algo.module, "normalize_plaintext"):
            # Playfair rewrites its input; the caller shows this instead of the
            # raw text so the preview matches what was actually encrypted.
            normalized = algo.module.normalize_plaintext(text)

        return CryptoResult(
            algorithm=algo.id,
            algorithm_label=algo.label(key),
            input_text=text,
            output_text=ciphertext,
            input_size=len(text.encode("utf-8")),
            output_size=len(ciphertext.encode("utf-8")),
            elapsed_ms=elapsed_ms,
            key_size=_key_size(algo, key),
            lossless=algo.lossless,
            authenticated=algo.authenticated,
            normalized_input=normalized,
        )

    @staticmethod
    def decrypt(algorithm_id: str, ciphertext: str, key: str) -> CryptoResult:
        """Decrypt ``ciphertext``.

        A wrong key, a corrupted payload or a failed authentication check all
        surface as :class:`DecryptionFailedError`, which the API reports as
        ``DECRYPTION_FAILED``. The distinction between them is deliberately not
        exposed — telling an attacker which part of a payload failed is a
        padding-oracle-shaped mistake.
        """
        algo = _resolve(algorithm_id)
        CryptoService._check_text(
            ciphertext, field="ciphertext", max_length=MAX_CIPHERTEXT_LENGTH
        )

        try:
            algo.module.validate_key(key)
        except ValueError as exc:
            raise InvalidKeyError(str(exc)) from exc

        started = time.perf_counter()
        try:
            plaintext = algo.module.decrypt(ciphertext, key)
        except ValueError as exc:
            logger.info("Decryption failed for algorithm %s: %s", algo.id, exc)
            raise DecryptionFailedError() from exc
        except Exception as exc:
            logger.exception("Unexpected decryption error for algorithm %s", algo.id)
            raise DecryptionFailedError() from exc
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

        return CryptoResult(
            algorithm=algo.id,
            algorithm_label=algo.label(key),
            input_text=ciphertext,
            output_text=plaintext,
            input_size=len(ciphertext.encode("utf-8")),
            output_size=len(plaintext.encode("utf-8")),
            elapsed_ms=elapsed_ms,
            key_size=_key_size(algo, key),
            lossless=algo.lossless,
            authenticated=algo.authenticated,
        )

    @staticmethod
    def integrity_verified(algorithm_id: str) -> bool | None:
        """Whether a successful decryption also proves integrity.

        ``True`` only for AES-EAX. The classical ciphers report ``None`` rather
        than ``False`` — they make no integrity claim at all, and saying
        "unverified" would imply they had tried.
        """
        algo = registry.get(algorithm_id)
        if algo is None:
            return None
        return True if algo.authenticated else None


__all__ = ["CryptoService", "CryptoResult", "MAX_TEXT_LENGTH", "MAX_CIPHERTEXT_LENGTH"]
