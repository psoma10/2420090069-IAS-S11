"""Playfair cipher — classical digraph substitution (Wheatstone, 1854).

ALGORITHM
---------
Playfair encrypts *pairs* of letters using a 5x5 key square. Because the Latin
alphabet has 26 letters and the square holds only 25, **J is folded into I** —
the standard English convention.

1. Key square. Write the keyword's letters left-to-right, top-to-bottom,
   skipping any letter already placed. Fill the remaining cells with the
   unused letters of the alphabet in order. For the keyword ``MONARCHY``::

       M O N A R
       C H Y B D
       E F G I K
       L P Q S T
       U V W X Z

2. Plaintext preparation. Uppercase the text, discard everything that is not
   a letter, fold J -> I, then split into digraphs, applying the two padding
   rules described under PADDING below.

3. Encryption, applied per digraph. Let the two letters sit at (r1,c1) and
   (r2,c2) in the square:

   * SAME ROW      -> replace each with the letter to its RIGHT (wrapping).
   * SAME COLUMN   -> replace each with the letter BELOW it (wrapping).
   * RECTANGLE     -> the two letters form opposite corners of a rectangle;
                      replace each with the letter in its own row at the
                      other letter's column (i.e. swap the columns).

   Decryption inverts these: LEFT, UP, and the same column swap (the
   rectangle rule is its own inverse).

PADDING
-------
A digraph may never contain two identical letters, and the text must have even
length. Two distinct filler letters are used, and the choice is deliberate:

* ``X`` separates a repeated pair — ``BALLOON`` becomes ``BA LX LO ON``.
  If the repeated letter is *itself* ``X`` (e.g. ``XX``), ``X`` cannot separate
  it, so ``Q`` is used instead — ``Q`` is the rarest English letter after those
  already spoken for, and this avoids an infinite insertion loop.
* ``Z`` pads a final odd letter — ``INSTRUMENTS`` becomes
  ``IN ST RU ME NT SZ``. If the dangling letter is itself ``Z``, ``X`` is used.

Using ``Z`` for the trailing pad (rather than ``X``) follows the convention in
Stallings and Forouzan, and reproduces their canonical worked example:
``encrypt("INSTRUMENTS", "MONARCHY") == "GATLMZCLRQTX"``.

LOSSINESS — EXPECTED BEHAVIOR, NOT A DEFECT
-------------------------------------------
Playfair is **not** a round-trip-exact cipher, and no faithful implementation
can be. Three irreversible transformations happen before a single letter is
encrypted:

1. Spaces, punctuation, digits and case are discarded — they were never
   encrypted, so decryption cannot restore them.
2. ``J`` is folded into ``I`` and is indistinguishable from it afterwards.
3. Filler letters are inserted, and a decrypted ``X`` cannot be told apart
   from an ``X`` the author actually wrote.

Therefore::

    decrypt(encrypt(p, k), k) != p            # in general

what does hold is::

    decrypt(encrypt(p, k), k) == normalize_plaintext(p)   # modulo fillers

This module deliberately does NOT invent an encoding scheme to preserve
punctuation or spacing. Doing so would no longer be the Playfair cipher. The
honest alternative is transparency: :func:`normalize_plaintext` is public so
the calling API can show the user exactly which letters were encrypted, and
:func:`build_key_square` is public so the UI can render the 5x5 grid.

Ciphertext is emitted as a **continuous** uppercase A-Z string with no spaces
or pair grouping. Grouping is a display concern; a continuous string keeps the
round trip clean and satisfies the "uppercase A-Z letters" contract in
ARCHITECTURE.md section 3.
"""

from __future__ import annotations

import random

KEY_FORMAT = "Alphabetic keyword, letters only"

SIZE = 5
ALPHABET = "ABCDEFGHIKLMNOPQRSTUVWXYZ"  # 25 letters: J is folded into I
PAIR_FILLER = "X"  # separates a repeated pair
PAIR_FILLER_ALT = "Q"  # used when the repeated letter is itself "X"
TAIL_FILLER = "Z"  # pads a final odd letter
TAIL_FILLER_ALT = "X"  # used when the dangling letter is itself "Z"

_VOWELS = "AEIOU"
_CONSONANTS = "BCDFGHKLMNPRSTVW"  # no J/Q/X/Y/Z — keeps keys pronounceable


def _fold(text: str) -> str:
    """Uppercase and fold J into I. Does not strip anything."""
    return text.upper().replace("J", "I")


def validate_key(key: str) -> str:
    """Validate a Playfair keyword and return it normalized (uppercase, J->I).

    Raises ValueError for anything that is not a non-empty run of letters.
    """
    if key is None:
        raise ValueError("Playfair key is required: expected an alphabetic keyword")
    if not isinstance(key, str):
        raise ValueError(f"Playfair key must be a string, got {type(key).__name__}")
    if not key.strip():
        raise ValueError("Playfair key cannot be empty or whitespace only")
    if not key.isalpha():
        raise ValueError(
            f"Playfair key must contain letters only (A-Z), got {key!r}. "
            f"Key format: {KEY_FORMAT}"
        )
    return _fold(key)


def build_key_square(key: str) -> list[list[str]]:
    """Build the 5x5 Playfair key square for ``key``.

    Keyword letters come first in order with duplicates removed, then the
    remaining letters of the 25-letter (J-less) alphabet.
    """
    normalized = validate_key(key)

    seen: set[str] = set()
    letters: list[str] = []
    for char in normalized + ALPHABET:
        if char not in seen:
            seen.add(char)
            letters.append(char)

    return [letters[row * SIZE : (row + 1) * SIZE] for row in range(SIZE)]


def normalize_plaintext(text: str) -> str:
    """Return the letters that Playfair will actually encrypt.

    Uppercases, discards every non-letter, and folds J into I. This is the
    text the round trip recovers, and the API echoes it back to the UI so the
    user can see what was lost.
    """
    if not text:
        return ""
    return "".join(char for char in _fold(text) if char in ALPHABET)


def _digraphs(normalized: str) -> list[tuple[str, str]]:
    """Split normalized letters into padded digraphs (see PADDING in docstring)."""
    pairs: list[tuple[str, str]] = []
    index = 0
    while index < len(normalized):
        first = normalized[index]
        second = normalized[index + 1] if index + 1 < len(normalized) else None

        if second is None:
            filler = TAIL_FILLER if first != TAIL_FILLER else TAIL_FILLER_ALT
            pairs.append((first, filler))
            index += 1
        elif first == second:
            filler = PAIR_FILLER if first != PAIR_FILLER else PAIR_FILLER_ALT
            pairs.append((first, filler))
            index += 1  # `second` is not consumed; it starts the next digraph
        else:
            pairs.append((first, second))
            index += 2
    return pairs


def _positions(square: list[list[str]]) -> dict[str, tuple[int, int]]:
    return {
        letter: (row, col)
        for row, line in enumerate(square)
        for col, letter in enumerate(line)
    }


def _transform(text: str, key: str, step: int) -> str:
    """Shared engine. ``step`` is +1 to encrypt and -1 to decrypt."""
    square = build_key_square(key)
    pos = _positions(square)

    out: list[str] = []
    for first, second in _digraphs(normalize_plaintext(text)):
        (r1, c1), (r2, c2) = pos[first], pos[second]

        if r1 == r2:
            # RULE 1 — same row: shift right (encrypt) / left (decrypt).
            out.append(square[r1][(c1 + step) % SIZE])
            out.append(square[r2][(c2 + step) % SIZE])
        elif c1 == c2:
            # RULE 2 — same column: shift down (encrypt) / up (decrypt).
            out.append(square[(r1 + step) % SIZE][c1])
            out.append(square[(r2 + step) % SIZE][c2])
        else:
            # RULE 3 — rectangle: swap columns, keep rows. Self-inverse.
            out.append(square[r1][c2])
            out.append(square[r2][c1])

    return "".join(out)


def encrypt(plaintext: str, key: str) -> str:
    """Encrypt ``plaintext`` with Playfair, returning continuous uppercase A-Z.

    Non-letters are discarded and J is folded to I before encryption; call
    :func:`normalize_plaintext` to see exactly what was encrypted.
    """
    return _transform(plaintext, key, step=1)


def decrypt(ciphertext: str, key: str) -> str:
    """Decrypt Playfair ``ciphertext``, returning continuous uppercase A-Z.

    The result equals ``normalize_plaintext(original)`` with any inserted
    filler letters still present; it is not byte-identical to the raw input.
    """
    return _transform(ciphertext, key, step=-1)


def generate_key() -> str:
    """Generate a random pronounceable-ish alphabetic keyword of 5-10 letters."""
    length = random.randint(5, 10)
    letters = [
        random.choice(_CONSONANTS if index % 2 == 0 else _VOWELS)
        for index in range(length)
    ]
    return "".join(letters)

