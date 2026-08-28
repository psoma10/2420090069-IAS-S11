"""Adversarial unit tests for :mod:`crypto.aes`.

These tests guard CyberVault's real security claim, so they go beyond
round-tripping: they corrupt the nonce, the tag and the ciphertext body
independently and assert that decryption *raises* rather than returning
plausible garbage. No mocks are used anywhere — the cipher under test is the
real PyCryptodome AES-EAX implementation.
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

import pytest

# crypto/ is a plain directory next to this test tree, not an installed package.
BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from crypto import aes  # noqa: E402

KEY_128 = "00112233445566778899aabbccddeeff"
KEY_192 = "000102030405060708090a0b0c0d0e0f1011121314151617"
KEY_256 = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

ALL_KEYS = [
    pytest.param(KEY_128, 128, id="aes-128"),
    pytest.param(KEY_192, 192, id="aes-192"),
    pytest.param(KEY_256, 256, id="aes-256"),
]

SAMPLE_TEXTS = [
    pytest.param("Hello CyberVault", id="ascii"),
    pytest.param("", id="empty-string"),
    pytest.param("Ünïcödé — 日本語 — Ελληνικά — 🔐🛡️", id="multibyte-utf8"),
    pytest.param("line one\nline two\r\n\tindented\n", id="newlines"),
    pytest.param("A" * 10240, id="10kb-document"),
    pytest.param("x", id="single-char"),
    pytest.param("\x00\x01 null-ish but valid str", id="control-chars"),
]


def _flip_byte(payload: str, index: int) -> str:
    """Return `payload` with the byte at `index` of its raw form flipped."""
    raw = bytearray(base64.b64decode(payload))
    raw[index] ^= 0xFF
    return base64.b64encode(bytes(raw)).decode("ascii")


# --------------------------------------------------------------------------
# Module contract
# --------------------------------------------------------------------------


def test_key_format_constant():
    assert aes.KEY_FORMAT == "Hex string: 32, 48 or 64 characters"


def test_supported_key_sizes_constant():
    assert aes.SUPPORTED_KEY_SIZES == (128, 192, 256)


def test_payload_layout_is_documented_and_parsable_by_hand():
    """A reader must be able to split nonce/tag/body using the documented offsets."""
    payload = aes.encrypt("layout check", KEY_256)
    raw = base64.b64decode(payload)
    nonce, tag, body = raw[:16], raw[16:32], raw[32:]

    assert len(nonce) == aes.NONCE_BYTES == 16
    assert len(tag) == aes.TAG_BYTES == 16
    # EAX is a stream mode: ciphertext length equals plaintext length exactly.
    assert len(body) == len("layout check".encode("utf-8"))


# --------------------------------------------------------------------------
# Round-trip
# --------------------------------------------------------------------------


@pytest.mark.parametrize("key,bits", ALL_KEYS)
@pytest.mark.parametrize("text", SAMPLE_TEXTS)
def test_round_trip(key, bits, text):
    assert aes.decrypt(aes.encrypt(text, key), key) == text


@pytest.mark.parametrize("key,bits", ALL_KEYS)
def test_round_trip_with_generated_key(key, bits):
    generated = aes.generate_key(bits)
    assert aes.decrypt(aes.encrypt("generated-key round trip", generated), generated) == (
        "generated-key round trip"
    )


def test_empty_string_round_trips_rather_than_raising():
    """Documented decision: encrypting "" is legitimate and returns "" intact."""
    payload = aes.encrypt("", KEY_256)
    assert payload  # a real nonce + tag are still present
    assert len(base64.b64decode(payload)) == 32  # nonce + tag, zero-length body
    assert aes.decrypt(payload, KEY_256) == ""


def test_ciphertext_is_base64_ascii_text():
    payload = aes.encrypt("storable in a TEXT column", KEY_256)
    assert isinstance(payload, str)
    assert payload.isascii()
    base64.b64decode(payload, validate=True)  # must not raise


def test_ten_kb_document_round_trips_exactly():
    text = "".join(f"line {i} of the confidential document\n" for i in range(300))
    assert len(text.encode("utf-8")) > 10000
    assert aes.decrypt(aes.encrypt(text, KEY_256), KEY_256) == text


# --------------------------------------------------------------------------
# Nonce freshness — a naive implementation gets this wrong
# --------------------------------------------------------------------------


def test_same_plaintext_and_key_produce_different_ciphertexts():
    first = aes.encrypt("identical plaintext", KEY_256)
    second = aes.encrypt("identical plaintext", KEY_256)
    assert first != second
    assert aes.decrypt(first, KEY_256) == aes.decrypt(second, KEY_256)


def test_nonces_are_unique_across_many_encryptions():
    nonces = {base64.b64decode(aes.encrypt("same", KEY_256))[:16] for _ in range(50)}
    assert len(nonces) == 50


def test_ciphertext_body_differs_from_plaintext_bytes():
    text = "AAAAAAAAAAAAAAAA"
    body = base64.b64decode(aes.encrypt(text, KEY_256))[32:]
    assert body != text.encode("utf-8")


# --------------------------------------------------------------------------
# Tamper detection — the core security claim (FR-12)
# --------------------------------------------------------------------------


def test_wrong_key_raises_and_does_not_return_garbage():
    payload = aes.encrypt("top secret", KEY_256)
    wrong = "ff" * 32
    assert wrong != KEY_256
    with pytest.raises(ValueError, match="integrity check"):
        aes.decrypt(payload, wrong)


def test_wrong_key_of_different_size_raises():
    payload = aes.encrypt("top secret", KEY_256)
    with pytest.raises(ValueError):
        aes.decrypt(payload, KEY_128)


def test_tampered_ciphertext_body_raises():
    payload = aes.encrypt("The launch code is 0000", KEY_256)
    # Byte 32 is the first byte of the ciphertext body.
    with pytest.raises(ValueError, match="integrity check"):
        aes.decrypt(_flip_byte(payload, 32), KEY_256)


def test_tampered_ciphertext_at_every_body_offset_raises():
    payload = aes.encrypt("0123456789abcdef", KEY_256)
    body_len = len(base64.b64decode(payload)) - 32
    for offset in range(body_len):
        with pytest.raises(ValueError):
            aes.decrypt(_flip_byte(payload, 32 + offset), KEY_256)


def test_tampered_tag_raises():
    payload = aes.encrypt("integrity matters", KEY_256)
    # Bytes 16..31 are the authentication tag specifically.
    with pytest.raises(ValueError, match="integrity check"):
        aes.decrypt(_flip_byte(payload, 16), KEY_256)


def test_tampered_tag_at_every_tag_offset_raises():
    payload = aes.encrypt("integrity matters", KEY_256)
    for offset in range(16, 32):
        with pytest.raises(ValueError):
            aes.decrypt(_flip_byte(payload, offset), KEY_256)


def test_tampered_nonce_raises():
    payload = aes.encrypt("nonce is authenticated too", KEY_256)
    with pytest.raises(ValueError, match="integrity check"):
        aes.decrypt(_flip_byte(payload, 0), KEY_256)


def test_truncated_payload_raises():
    payload = aes.encrypt("a reasonably long message to truncate", KEY_256)
    raw = base64.b64decode(payload)
    truncated = base64.b64encode(raw[:-5]).decode("ascii")
    with pytest.raises(ValueError):
        aes.decrypt(truncated, KEY_256)


def test_payload_shorter_than_header_raises_truncation_error():
    too_short = base64.b64encode(b"\x00" * 31).decode("ascii")
    with pytest.raises(ValueError, match="truncated"):
        aes.decrypt(too_short, KEY_256)


def test_empty_payload_raises():
    with pytest.raises(ValueError, match="truncated"):
        aes.decrypt("", KEY_256)


def test_appended_bytes_raise():
    payload = aes.encrypt("do not extend me", KEY_256)
    extended = base64.b64encode(base64.b64decode(payload) + b"evil").decode("ascii")
    with pytest.raises(ValueError, match="integrity check"):
        aes.decrypt(extended, KEY_256)


def test_swapped_tag_from_another_message_raises():
    """A tag lifted from a different message must not authenticate this one."""
    first = bytearray(base64.b64decode(aes.encrypt("message one", KEY_256)))
    second = base64.b64decode(aes.encrypt("message two", KEY_256))
    first[16:32] = second[16:32]
    forged = base64.b64encode(bytes(first)).decode("ascii")
    with pytest.raises(ValueError, match="integrity check"):
        aes.decrypt(forged, KEY_256)


@pytest.mark.parametrize(
    "garbage",
    [
        pytest.param("not base64 at all!!!", id="punctuation"),
        pytest.param("héllo", id="non-ascii"),
        pytest.param("====", id="padding-only"),
        pytest.param("abc", id="bad-length"),
        pytest.param("   ", id="whitespace"),
    ],
)
def test_non_base64_input_raises(garbage):
    with pytest.raises(ValueError):
        aes.decrypt(garbage, KEY_256)


def test_non_string_ciphertext_raises():
    with pytest.raises(ValueError, match="must be a string"):
        aes.decrypt(b"raw bytes", KEY_256)


def test_non_string_plaintext_raises():
    with pytest.raises(ValueError, match="must be a string"):
        aes.encrypt(12345, KEY_256)


# --------------------------------------------------------------------------
# Key validation
# --------------------------------------------------------------------------


@pytest.mark.parametrize("key,bits", ALL_KEYS)
def test_validate_key_returns_raw_bytes(key, bits):
    key_bytes = aes.validate_key(key)
    assert isinstance(key_bytes, bytes)
    assert len(key_bytes) == bits // 8
    assert key_bytes == bytes.fromhex(key)


def test_validate_key_accepts_uppercase_hex():
    assert aes.validate_key(KEY_256.upper()) == bytes.fromhex(KEY_256)


def test_validate_key_strips_surrounding_whitespace():
    assert aes.validate_key(f"  {KEY_256}\n") == bytes.fromhex(KEY_256)


def test_empty_key_raises():
    with pytest.raises(ValueError, match="must not be empty"):
        aes.validate_key("")


def test_odd_length_key_raises():
    with pytest.raises(ValueError, match="odd length"):
        aes.validate_key("abc")


def test_non_hex_key_raises():
    with pytest.raises(ValueError, match="not valid hexadecimal"):
        aes.validate_key("zz" * 32)


def test_wrong_size_key_raises():
    with pytest.raises(ValueError, match="unsupported length"):
        aes.validate_key("ab" * 20)  # 40 chars = 20 bytes, not 16/24/32


def test_none_key_raises():
    with pytest.raises(ValueError, match="required"):
        aes.validate_key(None)


def test_non_string_key_raises():
    with pytest.raises(ValueError, match="must be a string"):
        aes.validate_key(12345)


def test_key_never_appears_in_error_message():
    secret = "ab" * 20  # wrong size, so it is rejected
    with pytest.raises(ValueError) as excinfo:
        aes.validate_key(secret)
    assert secret not in str(excinfo.value)


@pytest.mark.parametrize("bad_key", ["", "abc", "zz" * 32, "ab" * 20, None])
def test_encrypt_and_decrypt_reject_invalid_keys(bad_key):
    with pytest.raises(ValueError):
        aes.encrypt("text", bad_key)
    with pytest.raises(ValueError):
        aes.decrypt(aes.encrypt("text", KEY_256), bad_key)


# --------------------------------------------------------------------------
# key_size_bits
# --------------------------------------------------------------------------


@pytest.mark.parametrize("key,bits", ALL_KEYS)
def test_key_size_bits(key, bits):
    assert aes.key_size_bits(key) == bits


def test_key_size_bits_rejects_invalid_key():
    with pytest.raises(ValueError):
        aes.key_size_bits("nope")


# --------------------------------------------------------------------------
# generate_key
# --------------------------------------------------------------------------


@pytest.mark.parametrize("bits", [128, 192, 256])
def test_generate_key_length_and_validity(bits):
    key = aes.generate_key(bits)
    assert isinstance(key, str)
    assert len(key) == bits // 4  # two hex chars per byte
    assert len(aes.validate_key(key)) == bits // 8
    assert aes.key_size_bits(key) == bits


def test_generate_key_defaults_to_256():
    assert len(aes.generate_key()) == 64
    assert aes.key_size_bits(aes.generate_key()) == 256


def test_generate_key_is_hex_lowercase():
    key = aes.generate_key(256)
    assert all(c in "0123456789abcdef" for c in key)


def test_two_generated_keys_differ():
    assert aes.generate_key(256) != aes.generate_key(256)


def test_many_generated_keys_are_all_distinct():
    assert len({aes.generate_key(128) for _ in range(100)}) == 100


@pytest.mark.parametrize("bad_size", [0, 64, 127, 129, 512, -256, "256", None, 256.0])
def test_generate_key_rejects_invalid_size(bad_size):
    with pytest.raises(ValueError):
        aes.generate_key(bad_size)


def test_generate_key_rejects_bool_size():
    with pytest.raises(ValueError, match="must be an integer"):
        aes.generate_key(True)
