"""Caesar cipher — the classical monoalphabetic substitution cipher.

Algorithm
---------
Each alphabetic character is replaced by the letter standing `k` positions
further along the 26-letter English alphabet, wrapping from ``z`` back to
``a``. Writing ``p`` and ``c`` for the plaintext/ciphertext letter positions
(``a`` = 0 ... ``z`` = 25)::

    encryption:  c = (p + k) mod 26
    decryption:  p = (c - k) mod 26

The shift `k` is the entire key, so the keyspace holds only 26 members. The
cipher therefore falls to exhaustive search and to frequency analysis, since a
fixed shift preserves the language's letter-frequency profile. It is the
historical baseline against which CyberVault's stronger ciphers (Playfair,
S-DES, AES) are compared.

Character handling
------------------
Case is preserved: with ``k = 3``, ``'a' -> 'd'`` and ``'A' -> 'D'``. Every
non-alphabetic character — spaces, punctuation, digits, newlines and all
non-ASCII/unicode text — passes through untouched. Nothing is dropped, folded
or padded, so ``decrypt(encrypt(p, k), k) == p`` holds exactly for any input.

Key policy
----------
Keys arrive as strings (``"3"``), matching the REST contract. Whitespace is
stripped; the key must be an ASCII integer literal in the **inclusive range
0-25**. Values outside it (``"26"``, ``"-1"``) raise ``ValueError`` rather than
being modulo-normalized — an error naming the legal range teaches more than a
silent reinterpretation of the user's input.

Standalone by design: stdlib only, no Flask, no database, no project imports.
"""

from __future__ import annotations

import random
from typing import Union

__all__ = ["encrypt", "decrypt", "generate_key", "validate_key", "KEY_FORMAT"]

KEY_FORMAT = "Integer shift from 0 to 25"

ALPHABET_SIZE = 26
MIN_SHIFT = 0
MAX_SHIFT = 25


def validate_key(key: Union[str, int, None]) -> int:
    """Normalize `key` to an integer shift in 0-25, or raise ``ValueError``.

    Accepts an ``int`` or a ``str`` holding an ASCII integer literal (outer
    whitespace ignored). Anything else — ``None``, a float, a non-numeric
    string, or a number outside 0-25 — raises ``ValueError`` naming the format.
    """
    if isinstance(key, bool) or key is None:
        raise ValueError(f"Caesar key must be an integer shift. {KEY_FORMAT}.")

    if isinstance(key, int):
        shift = key
    elif isinstance(key, str):
        candidate = key.strip()
        if not candidate:
            raise ValueError(f"Caesar key must not be empty. {KEY_FORMAT}.")
        # `int()` also accepts non-ASCII digits such as Arabic-Indic "\u0663";
        # keys arrive over the REST API, so restrict them to ASCII digits.
        if not candidate.isascii():
            raise ValueError(f"Caesar key {key!r} must use ASCII digits. {KEY_FORMAT}.")
        try:
            shift = int(candidate)
        except ValueError:
            raise ValueError(
                f"Caesar key {key!r} is not a valid integer. {KEY_FORMAT}."
            ) from None
    else:
        raise ValueError(
            f"Caesar key must be a string or integer, got {type(key).__name__}. "
            f"{KEY_FORMAT}."
        )

    if not MIN_SHIFT <= shift <= MAX_SHIFT:
        raise ValueError(f"Caesar key {shift} is out of range. {KEY_FORMAT}.")
    return shift


def _shift_text(text: str, shift: int) -> str:
    """Apply `shift` to every ASCII letter in `text`; pass all else through."""
    result = []
    for char in text:
        if "a" <= char <= "z":
            result.append(chr((ord(char) - 97 + shift) % ALPHABET_SIZE + 97))
        elif "A" <= char <= "Z":
            result.append(chr((ord(char) - 65 + shift) % ALPHABET_SIZE + 65))
        else:
            result.append(char)
    return "".join(result)


def _require_text(value: str, label: str) -> str:
    """Reject non-string payloads before any shifting is attempted."""
    if not isinstance(value, str):
        raise ValueError(f"Caesar {label} must be a string, got {type(value).__name__}.")
    return value


def encrypt(plaintext: str, key: str) -> str:
    """Encrypt `plaintext` with the Caesar shift `key` (a string such as ``"3"``)."""
    return _shift_text(_require_text(plaintext, "plaintext"), validate_key(key))


def decrypt(ciphertext: str, key: str) -> str:
    """Recover the plaintext from `ciphertext` using the same Caesar shift `key`."""
    return _shift_text(_require_text(ciphertext, "ciphertext"), -validate_key(key))


def generate_key() -> str:
    """Return a random shift in 1-25 as a string.

    Zero is excluded on purpose: a zero shift is the identity transform, which
    would make ciphertext identical to plaintext and ruin a demonstration.
    """
    return str(random.randint(MIN_SHIFT + 1, MAX_SHIFT))
