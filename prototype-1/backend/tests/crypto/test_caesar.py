"""Unit tests for the Caesar cipher (crypto/caesar.py).

Pure-function module, so there is nothing to mock: every test exercises the
real implementation and asserts on real return values.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from crypto import caesar  # noqa: E402

ALL_VALID_KEYS = [str(k) for k in range(26)]


# --------------------------------------------------------------------------
# Known-answer tests — the textbook vectors
# --------------------------------------------------------------------------

def test_known_answer_hello_world():
    assert caesar.encrypt("Hello, World!", "3") == "Khoor, Zruog!"


def test_known_answer_decrypt_hello_world():
    assert caesar.decrypt("Khoor, Zruog!", "3") == "Hello, World!"


def test_case_is_preserved():
    assert caesar.encrypt("aA", "3") == "dD"


def test_shift_wraps_z_to_c():
    assert caesar.encrypt("z", "3") == "c"
    assert caesar.encrypt("Z", "3") == "C"
    assert caesar.encrypt("xyz", "3") == "abc"


def test_wrap_backwards_on_decrypt():
    assert caesar.decrypt("abc", "3") == "xyz"


def test_full_alphabet_shift_one():
    assert caesar.encrypt("abcdefghijklmnopqrstuvwxyz", "1") == (
        "bcdefghijklmnopqrstuvwxyza"
    )


def test_zero_shift_is_identity():
    assert caesar.encrypt("Attack at dawn!", "0") == "Attack at dawn!"


# --------------------------------------------------------------------------
# Round-trip guarantee
# --------------------------------------------------------------------------

ROUND_TRIP_SAMPLES = [
    "attackatdawn",
    "ATTACKATDAWN",
    "Attack At Dawn",
    "Hello, World! 123 -- (yes/no?) #tag @user 50%",
    "line one\nline two\r\nline three\ttabbed",
    "   leading and trailing spaces   ",
    "",
    "1234567890",
    "!@#$%^&*()_+-=[]{};':\",./<>?\\|`~",
    "naive cafe resume 3.14 z Z a A",
]


@pytest.mark.parametrize("text", ROUND_TRIP_SAMPLES)
@pytest.mark.parametrize("key", ALL_VALID_KEYS)
def test_round_trip_exact_for_every_valid_key(text, key):
    assert caesar.decrypt(caesar.encrypt(text, key), key) == text


def test_round_trip_lowercase():
    assert caesar.decrypt(caesar.encrypt("attackatdawn", "7"), "7") == "attackatdawn"


def test_round_trip_uppercase():
    assert caesar.decrypt(caesar.encrypt("ATTACKATDAWN", "7"), "7") == "ATTACKATDAWN"


def test_round_trip_mixed_case():
    text = "The Quick Brown Fox Jumps Over The Lazy Dog"
    assert caesar.decrypt(caesar.encrypt(text, "11"), "11") == text


def test_round_trip_punctuation_digits_newlines_spaces():
    text = "Dear Bob,\n\tSend $1,500 by 09/12 -- urgent! (ref #42)\n"
    assert caesar.decrypt(caesar.encrypt(text, "19"), "19") == text


def test_empty_string_round_trips():
    assert caesar.encrypt("", "5") == ""
    assert caesar.decrypt("", "5") == ""


# --------------------------------------------------------------------------
# Pass-through: non-letters must survive untouched
# --------------------------------------------------------------------------

def test_non_letters_pass_through_unchanged():
    symbols = "0123456789 !@#$%^&*()-_=+[]{}|;:'\",.<>/?\\`~\n\t\r"
    assert caesar.encrypt(symbols, "13") == symbols


def test_unicode_passes_through_unchanged():
    text = "café naïve 日本語 Привет مرحبا 🚀 emoji"
    encrypted = caesar.encrypt(text, "5")
    # Only the ASCII letters move; every other codepoint is preserved verbatim.
    assert encrypted == "hfké sfïaj 日本語 Привет مرحبا 🚀 jrton"
    assert caesar.decrypt(encrypted, "5") == text


def test_unicode_letters_are_not_shifted():
    for char in "日本語Привет日مرحبا🚀é":
        assert caesar.encrypt(char, "9") == char


def test_length_is_always_preserved():
    text = "Mixed 123 text!\nwith café"
    for key in ALL_VALID_KEYS:
        assert len(caesar.encrypt(text, key)) == len(text)


# --------------------------------------------------------------------------
# Determinism
# --------------------------------------------------------------------------

def test_encryption_is_deterministic():
    text = "Repeatability matters, 42 times!"
    first = caesar.encrypt(text, "17")
    for _ in range(10):
        assert caesar.encrypt(text, "17") == first


def test_different_keys_give_different_ciphertext():
    text = "attack"
    outputs = {caesar.encrypt(text, str(k)) for k in range(26)}
    assert len(outputs) == 26


# --------------------------------------------------------------------------
# Key validation
# --------------------------------------------------------------------------

@pytest.mark.parametrize("key", ALL_VALID_KEYS)
def test_validate_key_accepts_every_valid_shift(key):
    assert caesar.validate_key(key) == int(key)


def test_validate_key_accepts_int():
    assert caesar.validate_key(7) == 7


def test_validate_key_strips_whitespace():
    assert caesar.validate_key("  12  ") == 12
    assert caesar.validate_key("\t3\n") == 3


def test_validate_key_accepts_explicit_plus_sign():
    """"+3" is an unambiguous integer literal for shift 3, so it is accepted."""
    assert caesar.validate_key("+3") == 3


@pytest.mark.parametrize(
    "bad_key",
    ["abc", "", "   ", "26", "-1", None, "3.5", "1e2", "0x5", "٣", "٣٤",
     "3 4", "3,5", 26, -1, 100, 3.5, [], {}, True],
)
def test_validate_key_rejects_invalid(bad_key):
    with pytest.raises(ValueError):
        caesar.validate_key(bad_key)


def test_out_of_range_error_message_names_the_range():
    with pytest.raises(ValueError) as excinfo:
        caesar.validate_key("26")
    message = str(excinfo.value)
    assert "0 to 25" in message
    assert "26" in message


def test_non_numeric_error_message_is_educational():
    with pytest.raises(ValueError) as excinfo:
        caesar.validate_key("abc")
    assert "0 to 25" in str(excinfo.value)


@pytest.mark.parametrize("bad_key", ["abc", "", "26", "-1", None, "3.5"])
def test_encrypt_rejects_invalid_keys(bad_key):
    with pytest.raises(ValueError):
        caesar.encrypt("hello", bad_key)


@pytest.mark.parametrize("bad_key", ["abc", "", "26", "-1", None, "3.5"])
def test_decrypt_rejects_invalid_keys(bad_key):
    with pytest.raises(ValueError):
        caesar.decrypt("khoor", bad_key)


def test_negative_and_oversized_keys_are_rejected_not_modulo_normalized():
    """Documented policy: reject outside 0-25 rather than wrap silently."""
    with pytest.raises(ValueError):
        caesar.validate_key("29")     # would be 3 under modulo
    with pytest.raises(ValueError):
        caesar.validate_key("-23")    # would be 3 under modulo


def test_encrypt_rejects_non_string_plaintext():
    with pytest.raises(ValueError):
        caesar.encrypt(12345, "3")


def test_decrypt_rejects_non_string_ciphertext():
    with pytest.raises(ValueError):
        caesar.decrypt(12345, "3")


# --------------------------------------------------------------------------
# generate_key
# --------------------------------------------------------------------------

def test_generate_key_returns_string():
    assert isinstance(caesar.generate_key(), str)


def test_generate_key_is_always_valid_and_never_zero():
    for _ in range(300):
        key = caesar.generate_key()
        shift = caesar.validate_key(key)
        assert key != "0"
        assert 1 <= shift <= 25


def test_generate_key_round_trips_real_text():
    text = "Confidential: transfer 1 document at 09:00.\nSigned, Alice."
    for _ in range(50):
        key = caesar.generate_key()
        assert caesar.decrypt(caesar.encrypt(text, key), key) == text


def test_generate_key_actually_changes_letters():
    for _ in range(50):
        key = caesar.generate_key()
        assert caesar.encrypt("abc", key) != "abc"


def test_generate_key_is_not_constant():
    keys = {caesar.generate_key() for _ in range(200)}
    assert len(keys) > 1


# --------------------------------------------------------------------------
# Module contract
# --------------------------------------------------------------------------

def test_key_format_constant():
    assert caesar.KEY_FORMAT == "Integer shift from 0 to 25"


def test_module_imports_no_framework_or_project_modules():
    source = Path(caesar.__file__).read_text()
    for forbidden in ("flask", "sqlite3", "from database", "from services",
                      "from repositories", "from models", "Crypto"):
        assert forbidden not in source
