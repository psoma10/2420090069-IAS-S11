"""AES in EAX mode — CyberVault's modern, authenticated cipher.

Algorithm
---------
AES (the Advanced Encryption Standard, FIPS 197) is a symmetric block cipher
operating on 128-bit blocks with a 128-, 192- or 256-bit key. Unlike the
classical ciphers in this package it is not broken by frequency analysis: each
output block depends on the whole key through 10, 12 or 14 rounds of
substitution (S-box), permutation (ShiftRows), diffusion (MixColumns) and key
mixing (AddRoundKey).

This module uses **EAX mode**, an authenticated encryption with associated data
(AEAD) construction built on top of raw AES. EAX composes CTR mode for
confidentiality with OMAC for integrity, producing two outputs:

* the ciphertext, exactly as long as the plaintext (CTR is a stream mode, so
  there is no block padding), and
* a 16-byte **authentication tag** binding the ciphertext, the nonce and the key.

The tag is why this module is the product's primary algorithm. On decryption
PyCryptodome recomputes the tag and compares it against the stored one; if a
single bit of the key, nonce, tag or ciphertext has changed, verification fails
and this module raises ``ValueError`` instead of returning plausible-looking
garbage. That is a genuine tamper-detection guarantee — the classical ciphers
here have none, and will happily "decrypt" a corrupted message into nonsense.

Payload layout
--------------
:func:`encrypt` returns a **self-contained** string: everything :func:`decrypt`
needs except the key travels inside it. The raw payload is the concatenation

    nonce (16 bytes) ‖ tag (16 bytes) ‖ ciphertext (N bytes)

and the returned string is the standard Base64 encoding of those ``32 + N``
bytes. A reader can therefore parse it by hand::

    raw = base64.b64decode(ciphertext_string)
    nonce, tag, body = raw[:16], raw[16:32], raw[32:]

The nonce is fresh random bytes on every call, so encrypting the same plaintext
with the same key twice yields two different strings. This is required, not
incidental: reusing a nonce with a stream mode leaks the XOR of the two
plaintexts.

Key policy
----------
Keys are hexadecimal strings, matching the REST contract: 32 hex characters for
AES-128, 48 for AES-192, 64 for AES-256 (two hex characters per key byte).
Surrounding whitespace is stripped; case is irrelevant. Odd-length, non-hex and
wrong-length keys are each rejected with their own explicit ``ValueError``.
Keys are never hardcoded, never logged, and never included in exception text.

Empty string
------------
``encrypt("")`` is *legitimate* and round-trips to ``""``. EAX is a stream mode,
so a zero-length message is well defined, and the payload still carries a real
nonce and a real tag — an empty document remains integrity-protected and its
length is honestly reported rather than being rejected as a special case. Refusing
it here would only push an arbitrary edge case onto the upload layer, which
already rejects empty files for its own reasons (``ARCHITECTURE.md`` §6).

Standalone by design: stdlib plus PyCryptodome only, no Flask, no database,
no project imports.
"""

from __future__ import annotations

import base64
import binascii
from typing import Optional

from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

__all__ = [
    "encrypt",
    "decrypt",
    "generate_key",
    "validate_key",
    "key_size_bits",
    "KEY_FORMAT",
    "SUPPORTED_KEY_SIZES",
]

KEY_FORMAT = "Hex string: 32, 48 or 64 characters"
SUPPORTED_KEY_SIZES = (128, 192, 256)

NONCE_BYTES = 16
TAG_BYTES = 16
HEADER_BYTES = NONCE_BYTES + TAG_BYTES

# Key length in bytes -> key size in bits, for the three AES variants.
_VALID_KEY_BYTES = {size // 8: size for size in SUPPORTED_KEY_SIZES}


def validate_key(key: Optional[str]) -> bytes:
    """Decode `key` from hex into raw key bytes, or raise ``ValueError``.

    A valid key is a string of 32, 48 or 64 hexadecimal characters, yielding a
    16-, 24- or 32-byte AES key respectively. Surrounding whitespace is ignored
    and either letter case is accepted. Empty, non-string, odd-length, non-hex
    and wrong-length keys each raise a distinct, self-explanatory ``ValueError``.
    The key itself never appears in the message.
    """
    if key is None:
        raise ValueError(f"AES key is required. {KEY_FORMAT}.")
    if not isinstance(key, str):
        raise ValueError(
            f"AES key must be a string, got {type(key).__name__}. {KEY_FORMAT}."
        )

    candidate = key.strip()
    if not candidate:
        raise ValueError(f"AES key must not be empty. {KEY_FORMAT}.")

    if len(candidate) % 2 != 0:
        raise ValueError(
            f"AES key has an odd length ({len(candidate)} characters); hex keys "
            f"need two characters per byte. {KEY_FORMAT}."
        )

    try:
        key_bytes = bytes.fromhex(candidate)
    except ValueError:
        raise ValueError(
            f"AES key is not valid hexadecimal; only the characters 0-9 and "
            f"a-f are allowed. {KEY_FORMAT}."
        ) from None

    if len(key_bytes) not in _VALID_KEY_BYTES:
        raise ValueError(
            f"AES key has an unsupported length ({len(candidate)} characters). "
            f"{KEY_FORMAT}, for AES-128, AES-192 and AES-256 respectively."
        )
    return key_bytes


def key_size_bits(key: str) -> int:
    """Return the AES key size `key` selects: 128, 192 or 256 bits."""
    return _VALID_KEY_BYTES[len(validate_key(key))]


def generate_key(key_size: int = 256) -> str:
    """Return a fresh random AES key of `key_size` bits as a hex string.

    Bytes come from ``Crypto.Random.get_random_bytes``, a cryptographically
    secure source seeded by the operating system — never from ``random``, whose
    Mersenne Twister state is recoverable from its own output.
    """
    if isinstance(key_size, bool) or not isinstance(key_size, int):
        raise ValueError(
            f"AES key size must be an integer, got {type(key_size).__name__}. "
            f"Supported sizes: {', '.join(str(s) for s in SUPPORTED_KEY_SIZES)}."
        )
    if key_size not in SUPPORTED_KEY_SIZES:
        raise ValueError(
            f"AES key size {key_size} is not supported. Supported sizes: "
            f"{', '.join(str(s) for s in SUPPORTED_KEY_SIZES)}."
        )
    return get_random_bytes(key_size // 8).hex()


def encrypt(plaintext: str, key: str) -> str:
    """Encrypt `plaintext` under `key`, returning Base64 of nonce ‖ tag ‖ ciphertext.

    `plaintext` may be any ``str`` — including the empty string, multi-byte
    UTF-8 and newlines — and is encoded as UTF-8 before encryption. A fresh
    random 16-byte nonce is drawn per call, so two encryptions of identical
    input under an identical key produce different output.
    """
    if not isinstance(plaintext, str):
        raise ValueError(
            f"AES plaintext must be a string, got {type(plaintext).__name__}."
        )
    key_bytes = validate_key(key)

    nonce = get_random_bytes(NONCE_BYTES)
    cipher = AES.new(key_bytes, AES.MODE_EAX, nonce=nonce)
    body, tag = cipher.encrypt_and_digest(plaintext.encode("utf-8"))
    return base64.b64encode(nonce + tag + body).decode("ascii")


def decrypt(ciphertext: str, key: str) -> str:
    """Recover the plaintext from an :func:`encrypt` payload, or raise ``ValueError``.

    The EAX tag is verified before anything is returned, so a wrong key, a
    flipped bit anywhere in the payload, or a truncated payload raises rather
    than yielding garbage plaintext. Every failure mode — malformed Base64, a
    payload too short to hold a nonce and tag, a failed integrity check, and a
    plaintext that is not valid UTF-8 — is reported as ``ValueError``; no raw
    PyCryptodome exception escapes, so the service layer can map this cleanly
    onto ``DECRYPTION_FAILED``.
    """
    if not isinstance(ciphertext, str):
        raise ValueError(
            f"AES ciphertext must be a string, got {type(ciphertext).__name__}."
        )
    key_bytes = validate_key(key)

    try:
        raw = base64.b64decode(ciphertext, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError(
            "AES ciphertext is not valid Base64; the payload is malformed or "
            "was not produced by this cipher."
        ) from None

    if len(raw) < HEADER_BYTES:
        raise ValueError(
            f"AES ciphertext is truncated: {len(raw)} bytes cannot hold the "
            f"{NONCE_BYTES}-byte nonce and {TAG_BYTES}-byte authentication tag."
        )

    nonce = raw[:NONCE_BYTES]
    tag = raw[NONCE_BYTES:HEADER_BYTES]
    body = raw[HEADER_BYTES:]

    try:
        cipher = AES.new(key_bytes, AES.MODE_EAX, nonce=nonce)
        plaintext_bytes = cipher.decrypt_and_verify(body, tag)
    except (ValueError, KeyError):
        raise ValueError(
            "AES decryption failed: the integrity check did not pass. The key "
            "is wrong or the ciphertext has been tampered with."
        ) from None

    try:
        return plaintext_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError(
            "AES decryption produced bytes that are not valid UTF-8 text."
        ) from None
