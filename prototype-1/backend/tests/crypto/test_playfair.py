"""Unit tests for crypto/playfair.py.

Round-trip assertions are made against ``normalize_plaintext(...)``, never
against the raw input, because Playfair is lossy by construction (it discards
non-letters, folds J into I, and inserts filler letters). See the module
docstring of crypto/playfair.py for the full explanation.
"""

import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from crypto import playfair  # noqa: E402

# The MONARCHY square, written out by hand from the textbook:
#   M O N A R
#   C H Y B D
#   E F G I K
#   L P Q S T
#   U V W X Z
MONARCHY_SQUARE = [
    ["M", "O", "N", "A", "R"],
    ["C", "H", "Y", "B", "D"],
    ["E", "F", "G", "I", "K"],
    ["L", "P", "Q", "S", "T"],
    ["U", "V", "W", "X", "Z"],
]


# --------------------------------------------------------------------------
# Known-answer vector
# --------------------------------------------------------------------------


def test_known_answer_monarchy_instruments():
    """Canonical textbook vector (Stallings / Forouzan).

    INSTRUMENTS -> IN ST RU ME NT SZ, with Z padding the dangling S.
    """
    assert playfair.encrypt("INSTRUMENTS", "MONARCHY") == "GATLMZCLRQTX"


def test_known_answer_decrypts_back():
    assert playfair.decrypt("GATLMZCLRQTX", "MONARCHY") == "INSTRUMENTSZ"


def test_known_answer_is_not_accidentally_input_dependent():
    """A different key must not produce the textbook ciphertext."""
    assert playfair.encrypt("INSTRUMENTS", "KEYWORD") != "GATLMZCLRQTX"


# --------------------------------------------------------------------------
# Key square construction
# --------------------------------------------------------------------------


def test_build_key_square_monarchy():
    assert playfair.build_key_square("MONARCHY") == MONARCHY_SQUARE


def test_key_square_holds_25_unique_letters_without_j():
    square = playfair.build_key_square("PLAYFAIR")
    flat = [letter for row in square for letter in row]
    assert len(flat) == 25
    assert len(set(flat)) == 25
    assert "J" not in flat
    assert set(flat) == set("ABCDEFGHIKLMNOPQRSTUVWXYZ")


def test_key_square_deduplicates_keyword_letters_in_order():
    # PLAYFAIR -> P L A Y F I R (second A and the I from... none; J absent)
    square = playfair.build_key_square("PLAYFAIR")
    assert square[0] == ["P", "L", "A", "Y", "F"]
    assert square[1][:2] == ["I", "R"]


def test_key_square_is_5x5():
    square = playfair.build_key_square("MONARCHY")
    assert len(square) == 5
    assert all(len(row) == 5 for row in square)


def test_key_square_folds_j_in_keyword():
    """A keyword containing J places I, and never a J cell."""
    square = playfair.build_key_square("JAZZ")
    flat = [letter for row in square for letter in row]
    assert square[0][0] == "I"
    assert "J" not in flat


def test_key_square_case_insensitive():
    assert playfair.build_key_square("monarchy") == playfair.build_key_square("MONARCHY")


# --------------------------------------------------------------------------
# J folding
# --------------------------------------------------------------------------


def test_normalize_folds_j_to_i():
    assert playfair.normalize_plaintext("JUMP") == "IUMP"


def test_j_and_i_encrypt_identically():
    assert playfair.encrypt("JAM", "MONARCHY") == playfair.encrypt("IAM", "MONARCHY")


# --------------------------------------------------------------------------
# normalize_plaintext
# --------------------------------------------------------------------------


def test_normalize_strips_non_letters_and_uppercases():
    assert playfair.normalize_plaintext("Hello, World! 123") == "HELLOWORLD"


def test_normalize_empty_string():
    assert playfair.normalize_plaintext("") == ""


def test_normalize_all_punctuation_yields_empty():
    assert playfair.normalize_plaintext("!!! ??? 123") == ""


# --------------------------------------------------------------------------
# Digraph padding
# --------------------------------------------------------------------------


def test_identical_pair_gets_x_inserted():
    """BALLOON -> BA LX LO ON, so the ciphertext is 8 letters."""
    cipher = playfair.encrypt("BALLOON", "MONARCHY")
    assert len(cipher) == 8
    assert playfair.decrypt(cipher, "MONARCHY") == "BALXLOON"


def test_odd_length_plaintext_is_padded_with_z():
    cipher = playfair.encrypt("ABC", "MONARCHY")
    assert len(cipher) == 4
    assert playfair.decrypt(cipher, "MONARCHY") == "ABCZ"


def test_even_length_plaintext_is_not_padded():
    cipher = playfair.encrypt("ABCD", "MONARCHY")
    assert len(cipher) == 4
    assert playfair.decrypt(cipher, "MONARCHY") == "ABCD"


def test_dangling_z_uses_alternate_tail_filler():
    """A trailing Z cannot be padded with Z; X is used instead."""
    recovered = playfair.decrypt(playfair.encrypt("ABZ", "MONARCHY"), "MONARCHY")
    assert recovered == "ABZX"


def test_adjacent_x_in_separate_digraphs_needs_no_filler():
    """AXXB splits as AX|XB, so the two X-es never share a digraph."""
    recovered = playfair.decrypt(playfair.encrypt("AXXB", "MONARCHY"), "MONARCHY")
    assert recovered == "AXXB"


def test_repeated_x_uses_alternate_pair_filler():
    """When XX really does form a digraph, X cannot separate it; Q is used."""
    recovered = playfair.decrypt(playfair.encrypt("XXY", "MONARCHY"), "MONARCHY")
    assert recovered == "XQXY"


def test_triple_letter_run_is_separated():
    recovered = playfair.decrypt(playfair.encrypt("AAA", "MONARCHY"), "MONARCHY")
    assert recovered == "AXAXAZ"


# --------------------------------------------------------------------------
# The three encryption rules, exercised explicitly against the MONARCHY square
# --------------------------------------------------------------------------


def test_same_row_rule_shifts_right():
    # Row 3 is L P Q S T. ST -> (T, L) because T wraps to L.
    assert playfair.encrypt("ST", "MONARCHY") == "TL"


def test_same_row_rule_wraps_at_end_of_row():
    # Row 0 is M O N A R. RM -> (M, O): R wraps to M, M -> O.
    assert playfair.encrypt("RM", "MONARCHY") == "MO"


def test_same_column_rule_shifts_down():
    # Column 0 is M C E L U. ME -> (C, L).
    assert playfair.encrypt("ME", "MONARCHY") == "CL"


def test_same_column_rule_wraps_at_bottom():
    # Column 0: U is last, wraps to M. UM -> (M, C).
    assert playfair.encrypt("UM", "MONARCHY") == "MC"


def test_rectangle_rule_swaps_columns():
    # I is (2,3), N is (0,2). Rectangle -> row2 col2 = G, row0 col3 = A.
    assert playfair.encrypt("IN", "MONARCHY") == "GA"


def test_rectangle_rule_is_self_inverse_shape():
    # Decrypting a rectangle pair applies the same column swap.
    assert playfair.decrypt("GA", "MONARCHY") == "IN"


def test_same_row_decrypt_shifts_left():
    assert playfair.decrypt("TL", "MONARCHY") == "ST"


def test_same_column_decrypt_shifts_up():
    assert playfair.decrypt("CL", "MONARCHY") == "ME"


# --------------------------------------------------------------------------
# Round trip against normalized plaintext
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "plaintext",
    [
        "HIDETHEGOLD",
        "ATTACKATDAWN",
        "The quick brown fox jumps over the lazy dog",
        "Meet me at the bridge, 9 PM!",
        "CRYPTOGRAPHY",
        "aaaa bbbb cccc",
        "Z",
        "AB",
    ],
)
def test_round_trip_recovers_normalized_plaintext(plaintext):
    """decrypt(encrypt(p)) == normalize_plaintext(p), modulo inserted fillers.

    We assert the normalized text is recoverable by stripping the fillers the
    implementation is documented to insert, rather than asserting raw equality
    (which Playfair cannot provide).
    """
    key = "MONARCHY"
    normalized = playfair.normalize_plaintext(plaintext)
    recovered = playfair.decrypt(playfair.encrypt(plaintext, key), key)

    # Every original letter survives, in order, inside the recovered text.
    assert _strip_fillers(recovered, normalized) == normalized


def _strip_fillers(recovered: str, normalized: str) -> str:
    """Remove inserted filler letters by walking both strings in lockstep."""
    out = []
    index = 0
    for char in recovered:
        if index < len(normalized) and char == normalized[index]:
            out.append(char)
            index += 1
    return "".join(out)


def test_round_trip_exact_when_text_needs_no_padding():
    """When no filler is required the round trip is exactly the normalized text."""
    key = "MONARCHY"
    plaintext = "HIDETHEGOLD"  # HI DE TH EG OL DZ -> odd, so pick an even clean one
    normalized = playfair.normalize_plaintext("ATTACK")  # AT TA CK, no repeats
    recovered = playfair.decrypt(playfair.encrypt("ATTACK", key), key)
    assert recovered == normalized
    assert plaintext  # keep the illustrative constant referenced


# --------------------------------------------------------------------------
# Ciphertext shape
# --------------------------------------------------------------------------


def test_ciphertext_is_continuous_uppercase_letters_only():
    cipher = playfair.encrypt("Meet me at the bridge, 9 PM!", "MONARCHY")
    assert re.fullmatch(r"[A-Z]+", cipher)
    assert " " not in cipher


def test_ciphertext_never_contains_j():
    cipher = playfair.encrypt("JJJJ JUMPING JACKS", "MONARCHY")
    assert "J" not in cipher


def test_ciphertext_length_is_always_even():
    for text in ["A", "AB", "ABC", "BALLOON", "HELLO WORLD"]:
        assert len(playfair.encrypt(text, "MONARCHY")) % 2 == 0


# --------------------------------------------------------------------------
# Empty plaintext
# --------------------------------------------------------------------------


def test_encrypt_empty_plaintext():
    assert playfair.encrypt("", "MONARCHY") == ""


def test_decrypt_empty_ciphertext():
    assert playfair.decrypt("", "MONARCHY") == ""


def test_encrypt_punctuation_only_yields_empty():
    assert playfair.encrypt("!!! 123 ???", "MONARCHY") == ""


# --------------------------------------------------------------------------
# Key validation
# --------------------------------------------------------------------------


@pytest.mark.parametrize("bad_key", ["", "   ", "abc123", "!!!", None, "MON ARCHY", "KEY-WORD", 42])
def test_invalid_keys_raise_value_error(bad_key):
    with pytest.raises(ValueError):
        playfair.validate_key(bad_key)


@pytest.mark.parametrize("bad_key", ["", "   ", "abc123", "!!!", None])
def test_encrypt_rejects_invalid_keys(bad_key):
    with pytest.raises(ValueError):
        playfair.encrypt("HELLO", bad_key)


@pytest.mark.parametrize("bad_key", ["", "   ", "abc123", "!!!", None])
def test_decrypt_rejects_invalid_keys(bad_key):
    with pytest.raises(ValueError):
        playfair.decrypt("GATL", bad_key)


def test_validate_key_returns_normalized_keyword():
    assert playfair.validate_key("monarchy") == "MONARCHY"
    assert playfair.validate_key("Jazz") == "IAZZ"


def test_validate_key_error_messages_are_informative():
    with pytest.raises(ValueError, match="empty or whitespace"):
        playfair.validate_key("   ")
    with pytest.raises(ValueError, match="letters only"):
        playfair.validate_key("abc123")


# --------------------------------------------------------------------------
# generate_key
# --------------------------------------------------------------------------


def test_generate_key_shape():
    for _ in range(50):
        key = playfair.generate_key()
        assert key.isalpha()
        assert key.isupper()
        assert 5 <= len(key) <= 10


def test_generated_keys_are_usable_and_varied():
    keys = {playfair.generate_key() for _ in range(30)}
    assert len(keys) > 1, "generate_key must not be constant"
    for key in keys:
        assert playfair.validate_key(key) == key
        assert playfair.encrypt("HELLO", key)


def test_generated_key_round_trips():
    key = playfair.generate_key()
    recovered = playfair.decrypt(playfair.encrypt("ATTACK", key), key)
    assert recovered == "ATTACK"


# --------------------------------------------------------------------------
# Contract constants
# --------------------------------------------------------------------------


def test_key_format_constant():
    assert playfair.KEY_FORMAT == "Alphabetic keyword, letters only"


def test_different_keys_produce_different_ciphertext():
    assert playfair.encrypt("ATTACKATDAWN", "MONARCHY") != playfair.encrypt(
        "ATTACKATDAWN", "PLAYFAIR"
    )
