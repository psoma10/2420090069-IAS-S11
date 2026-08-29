"""Unit tests for crypto/sdes.py — S-DES (Simplified DES).

Covers the documented key-schedule and block known-answer vectors, exhaustive
round-tripping of all 256 byte values, UTF-8 text handling including
multi-byte characters, and the error paths for malformed keys and ciphertext.
No mocks: every test exercises the real implementation end to end.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from crypto import sdes  # noqa: E402


# --- Known-answer vectors --------------------------------------------------

REFERENCE_KEY = "1010000010"


def test_subkey_schedule_matches_published_vector():
    """K1/K2 for key 1010000010 are the documented Stallings subkeys."""
    k1, k2 = sdes._derive_subkeys([int(bit) for bit in REFERENCE_KEY])
    assert "".join(str(b) for b in k1) == "10100100"
    assert "".join(str(b) for b in k2) == "01000011"


def test_block_known_answer_vector():
    """Plaintext block 10111101 under key 1010000010 encrypts to 01110101.

    This is the Stallings Appendix G worked example. The value is verified
    against the published key schedule above; if this fails, the permutation
    tables or the S-box row/column addressing are wrong.
    """
    block = [int(bit) for bit in "10111101"]
    k1, k2 = sdes._derive_subkeys([int(bit) for bit in REFERENCE_KEY])
    ciphertext = "".join(str(b) for b in sdes._crypt_block(block, k1, k2))
    assert ciphertext == "01110101"


def test_block_known_answer_vector_decrypts():
    """The same vector decrypts back with the subkeys applied in reverse."""
    block = [int(bit) for bit in "01110101"]
    k1, k2 = sdes._derive_subkeys([int(bit) for bit in REFERENCE_KEY])
    plaintext = "".join(str(b) for b in sdes._crypt_block(block, k2, k1))
    assert plaintext == "10111101"


def test_ip_inverse_actually_inverts_ip():
    """IP_INV must undo IP exactly, or the cipher cannot round-trip."""
    marker = list(range(1, 9))
    assert sdes._permute(sdes._permute(marker, sdes.IP), sdes.IP_INV) == marker


# --- Ciphertext format -----------------------------------------------------

def test_ciphertext_is_space_separated_eight_bit_groups():
    ciphertext = sdes.encrypt("Hi", REFERENCE_KEY)
    groups = ciphertext.split(" ")
    assert len(groups) == 2
    assert all(len(g) == 8 and set(g) <= {"0", "1"} for g in groups)


def test_one_group_per_utf8_byte_not_per_character():
    """A 1-char, 4-byte emoji must produce four blocks, not one."""
    assert len(sdes.encrypt("\U0001f512", REFERENCE_KEY).split()) == 4


# --- Round-trip ------------------------------------------------------------

@pytest.mark.parametrize(
    "text",
    [
        "",
        "A",
        "Hello, World!",
        "attack at dawn",
        "0123456789",
        "punctuation: ;'[]{}|\\<>?/~`!@#$%^&*()",
        "tabs\tand\nnewlines\r\n",
        "  leading and trailing  ",
        "CyberVault secure document exchange prototype. " * 20,
    ],
)
def test_ascii_round_trip_is_exact(text):
    assert sdes.decrypt(sdes.encrypt(text, REFERENCE_KEY), REFERENCE_KEY) == text


@pytest.mark.parametrize(
    "text",
    [
        "café",
        "naïve résumé",
        "Ünicöde",
        "Ελληνικά",
        "Привет мир",
        "日本語テキスト",
        "\U0001f512 secure \U0001f680",
        "mixed ascii + café + \U0001f512 + 日本語",
    ],
)
def test_multibyte_utf8_round_trip_is_exact(text):
    """Multi-byte characters span several blocks and must survive intact."""
    assert sdes.decrypt(sdes.encrypt(text, REFERENCE_KEY), REFERENCE_KEY) == text


def test_empty_string_round_trips():
    assert sdes.encrypt("", REFERENCE_KEY) == ""
    assert sdes.decrypt("", REFERENCE_KEY) == ""


def test_every_byte_value_round_trips():
    """Exhaustive block test: all 256 byte values survive encrypt/decrypt."""
    k1, k2 = sdes._derive_subkeys([int(bit) for bit in REFERENCE_KEY])
    for value in range(256):
        block = [(value >> shift) & 1 for shift in range(7, -1, -1)]
        recovered = sdes._crypt_block(sdes._crypt_block(block, k1, k2), k2, k1)
        assert recovered == block, f"byte {value} failed to round-trip"


def test_block_cipher_is_a_bijection_over_all_256_bytes():
    """No two plaintext bytes may collide, or decryption would be ambiguous."""
    k1, k2 = sdes._derive_subkeys([int(bit) for bit in REFERENCE_KEY])
    outputs = set()
    for value in range(256):
        block = [(value >> shift) & 1 for shift in range(7, -1, -1)]
        outputs.add(tuple(sdes._crypt_block(block, k1, k2)))
    assert len(outputs) == 256


def test_round_trip_across_many_generated_keys():
    """The round-trip identity holds for every key, not just the sample one."""
    text = "café \U0001f512 round trip"
    for _ in range(25):
        key = sdes.generate_key()
        assert sdes.decrypt(sdes.encrypt(text, key), key) == text


def test_all_1024_keys_round_trip_a_byte():
    """Exhaustive keyspace check — no key produces a non-invertible cipher."""
    for value in range(1024):
        key = format(value, "010b")
        assert sdes.decrypt(sdes.encrypt("Z", key), key) == "Z"


# --- Ciphertext actually differs from plaintext ----------------------------

def test_encryption_changes_the_text():
    plaintext = "attack at dawn"
    ciphertext = sdes.encrypt(plaintext, REFERENCE_KEY)
    assert plaintext not in ciphertext
    naive = " ".join(format(b, "08b") for b in plaintext.encode("utf-8"))
    assert ciphertext != naive, "ciphertext must not be plain binary encoding"


# --- Wrong key -------------------------------------------------------------

def test_different_keys_produce_different_ciphertext():
    plaintext = "attack at dawn"
    assert sdes.encrypt(plaintext, "1010000010") != sdes.encrypt(plaintext, "0101111101")


def test_wrong_key_does_not_recover_plaintext():
    """Over many keys, a wrong key either raises or returns the wrong text."""
    plaintext = "Meet at the north gate at midnight."
    ciphertext = sdes.encrypt(plaintext, REFERENCE_KEY)

    recovered_correctly = 0
    for value in range(1024):
        wrong_key = format(value, "010b")
        if wrong_key == REFERENCE_KEY:
            continue
        try:
            if sdes.decrypt(ciphertext, wrong_key) == plaintext:
                recovered_correctly += 1
        except ValueError:
            pass  # expected: the recovered bytes are not valid UTF-8
    assert recovered_correctly == 0, "a wrong key must never recover the plaintext"


def test_wrong_key_utf8_failure_raises_value_error_not_unicode_error():
    """A wrong key must surface as ValueError mentioning decryption failure."""
    ciphertext = sdes.encrypt("café \U0001f512 sensitive payload", REFERENCE_KEY)

    raised = None
    for value in range(1024):
        wrong_key = format(value, "010b")
        if wrong_key == REFERENCE_KEY:
            continue
        try:
            sdes.decrypt(ciphertext, wrong_key)
        except UnicodeDecodeError:  # pragma: no cover - the bug this guards
            pytest.fail("raw UnicodeDecodeError escaped decrypt()")
        except ValueError as exc:
            raised = exc
            break
    assert raised is not None, "expected some wrong key to fail UTF-8 decoding"
    assert "decryption failed" in str(raised).lower()


# --- Malformed ciphertext --------------------------------------------------

@pytest.mark.parametrize(
    "bad",
    [
        "1011101",          # 7 bits — too short
        "101110101",        # 9 bits — too long
        "10111010 0100",    # second group truncated
    ],
)
def test_wrong_group_length_raises(bad):
    with pytest.raises(ValueError, match="8"):
        sdes.decrypt(bad, REFERENCE_KEY)


@pytest.mark.parametrize(
    "bad",
    [
        "1011201a",
        "abcdefgh",
        "10111010 zzzzzzzz",
        "1011-010",
    ],
)
def test_non_binary_ciphertext_raises(bad):
    with pytest.raises(ValueError, match="non-binary"):
        sdes.decrypt(bad, REFERENCE_KEY)


def test_non_string_ciphertext_raises():
    with pytest.raises(ValueError, match="must be a string"):
        sdes.decrypt(12345678, REFERENCE_KEY)


def test_malformed_ciphertext_never_returns_garbage():
    """Bad input must raise, not silently decode to something plausible."""
    for bad in ["1011101", "abcdefgh", "10111010 010"]:
        with pytest.raises(ValueError):
            sdes.decrypt(bad, REFERENCE_KEY)


# --- Key validation --------------------------------------------------------

def test_validate_key_accepts_and_normalizes():
    assert sdes.validate_key("1010000010") == "1010000010"
    assert sdes.validate_key("  1010000010  ") == "1010000010"
    assert sdes.validate_key("\t1111111111\n") == "1111111111"


@pytest.mark.parametrize(
    "bad_key, expected",
    [
        ("", "empty"),
        ("   ", "empty"),
        ("101", "exactly 10 bits"),
        ("10100000101", "exactly 10 bits"),
        ("abcdefghij", "non-binary"),
        ("1010 00010", "non-binary"),
        ("101000001!", "non-binary"),
        ("12345678990", "non-binary"),
    ],
)
def test_invalid_string_keys_raise(bad_key, expected):
    with pytest.raises(ValueError, match=expected):
        sdes.validate_key(bad_key)


def test_none_key_raises():
    with pytest.raises(ValueError, match="not be None"):
        sdes.validate_key(None)


@pytest.mark.parametrize("bad_key", [1010000010, 3.5, ["1", "0"], {"key": "1"}])
def test_non_string_keys_raise(bad_key):
    with pytest.raises(ValueError, match="must be a string"):
        sdes.validate_key(bad_key)


def test_encrypt_and_decrypt_reject_invalid_keys():
    with pytest.raises(ValueError):
        sdes.encrypt("hello", "bad")
    with pytest.raises(ValueError):
        sdes.decrypt("10111010", "bad")


def test_encrypt_rejects_non_string_plaintext():
    with pytest.raises(ValueError, match="must be a string"):
        sdes.encrypt(12345, REFERENCE_KEY)


# --- Key generation --------------------------------------------------------

def test_generate_key_is_always_valid():
    for _ in range(200):
        key = sdes.generate_key()
        assert len(key) == 10
        assert set(key) <= {"0", "1"}
        assert sdes.validate_key(key) == key


def test_generate_key_is_not_constant():
    """A generator returning a fixed key would pass every other test."""
    assert len({sdes.generate_key() for _ in range(200)}) > 1


# --- Public contract -------------------------------------------------------

def test_module_exposes_required_interface():
    for name in ("encrypt", "decrypt", "generate_key", "validate_key", "KEY_FORMAT"):
        assert hasattr(sdes, name), f"missing public name {name}"
    assert sdes.KEY_FORMAT == "10-bit binary string, e.g. 1010000010"


def test_crypto_module_has_no_framework_imports():
    """ARCHITECTURE.md rule 2: crypto/ imports no Flask, DB, or project module."""
    source = open(sdes.__file__, encoding="utf-8").read()
    for forbidden in ("import flask", "from flask", "sqlite3", "from services", "from repositories"):
        assert forbidden not in source.lower()
