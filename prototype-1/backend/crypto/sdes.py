"""S-DES (Simplified DES) — the educational scale model of the DES block cipher.

Algorithm
---------
S-DES, due to Edward Schaefer and popularized by Stallings' *Cryptography and
Network Security* (Appendix G), is a deliberately miniature Feistel cipher. It
keeps DES's structure — key schedule, initial permutation, two Feistel rounds
separated by a swap, inverse permutation — but shrinks every parameter so the
whole cipher can be worked through by hand:

===================  =========  =============
Parameter            DES        S-DES
===================  =========  =============
block size           64 bits    **8 bits**
key size             56 bits    **10 bits**
rounds               16         **2**
S-boxes              8 (6->4)   **2 (4->2)**
===================  =========  =============

Key schedule (10-bit key -> two 8-bit subkeys)::

    K --P10--> split into halves L,R --LS-1--> L1,R1 --P8--> K1
                                     --LS-2--> L2,R2 --P8--> K2

``LS-n`` is a circular left shift of *each 5-bit half independently*. K2 is
derived by shifting L1/R1 a further two places, so the shifts accumulate (1
then 2, three positions total) exactly as DES's rotation schedule does.

Block encryption of one 8-bit block::

    IP -> fK(K1) -> SW -> fK(K2) -> IP-inverse

``fK`` is the round function. Splitting the 8-bit state into halves ``(L, R)``::

    fK(L, R) = (L XOR F(R, subkey), R)

``F`` expands R from 4 to 8 bits with E/P (duplicating two bits), XORs the
subkey, feeds the left nibble through S0 and the right nibble through S1 —
each collapsing 4 bits to 2 — and permutes the resulting 4 bits with P4.
``SW`` exchanges the halves so the second round transforms the other half.

An S-box is addressed by its **outer** bits and **inner** bits: for input
``b1 b2 b3 b4``, row = ``b1 b4`` and column = ``b2 b3``. This split is the one
subtlety in the cipher and the usual source of implementation error.

Decryption is the identical network with the subkeys applied in reverse order
(K2 then K1). Because each round is a Feistel step and every permutation is a
bijection, the cipher is a permutation of the 256 possible bytes, so the
round-trip is exact and lossless.

Security note: with a 10-bit key the entire keyspace is 1024 keys, exhaustible
instantly. S-DES has no protective value; it exists to make the structure of a
real Feistel cipher inspectable. CyberVault includes it as the pedagogical
bridge between the classical ciphers (Caesar, Playfair) and real AES.

Text handling
-------------
S-DES encrypts exactly 8 bits at a time, so text is first encoded to **UTF-8
bytes** and each byte is enciphered independently as one block. The ciphertext
is rendered as space-separated 8-bit binary groups (per ``ARCHITECTURE.md``),
e.g. ``"10111010 01001101"``. Multi-byte characters (accents, emoji) simply
occupy several consecutive blocks, so any UTF-8 text round-trips exactly.

Encrypting each block independently is ECB mode, which leaks equality: the
same plaintext byte always yields the same ciphertext byte. That is inherent
to demonstrating a raw block cipher and is noted honestly rather than hidden.

Standalone by design: stdlib only, no Flask, no database, no project imports.
"""

from __future__ import annotations

import secrets
from typing import List, Optional, Sequence, Tuple

__all__ = ["encrypt", "decrypt", "generate_key", "validate_key", "KEY_FORMAT"]

KEY_FORMAT = "10-bit binary string, e.g. 1010000010"

KEY_LENGTH = 10
BLOCK_SIZE = 8

# --- Standard S-DES tables. All are 1-indexed positions into their input. ---

P10 = [3, 5, 2, 7, 4, 10, 1, 9, 8, 6]       # key permutation, 10 -> 10 bits
P8 = [6, 3, 7, 4, 8, 5, 10, 9]              # subkey compression, 10 -> 8 bits
IP = [2, 6, 3, 1, 4, 8, 5, 7]               # initial permutation, 8 -> 8 bits
IP_INV = [4, 1, 3, 5, 7, 2, 8, 6]           # inverse of IP, undoes it exactly
EP = [4, 1, 2, 3, 2, 3, 4, 1]               # expansion/permutation, 4 -> 8 bits
P4 = [2, 4, 3, 1]                           # post-S-box permutation, 4 -> 4

S0 = [[1, 0, 3, 2], [3, 2, 1, 0], [0, 2, 1, 3], [3, 1, 3, 2]]
S1 = [[0, 1, 2, 3], [2, 0, 1, 3], [3, 0, 1, 0], [2, 1, 0, 3]]

Bits = List[int]


def _permute(bits: Sequence[int], table: Sequence[int]) -> Bits:
    """Reorder `bits` according to the 1-indexed positions in `table`."""
    return [bits[position - 1] for position in table]


def _left_shift(half: Sequence[int], amount: int) -> Bits:
    """Circular left shift of one 5-bit key half (the LS-n stage)."""
    amount %= len(half)
    return list(half[amount:]) + list(half[:amount])


def _derive_subkeys(key_bits: Sequence[int]) -> Tuple[Bits, Bits]:
    """Run the key schedule: 10-bit key -> subkeys (K1, K2).

    P10 scrambles the key, the halves are rotated left once and compressed by
    P8 into K1, then rotated a further two places (three in total) and
    compressed again into K2.
    """
    permuted = _permute(key_bits, P10)                       # P10
    left, right = permuted[:5], permuted[5:]                 # split into halves

    left1, right1 = _left_shift(left, 1), _left_shift(right, 1)   # LS-1
    k1 = _permute(left1 + right1, P8)                             # P8 -> K1

    left2, right2 = _left_shift(left1, 2), _left_shift(right1, 2)  # LS-2
    k2 = _permute(left2 + right2, P8)                              # P8 -> K2
    return k1, k2


def _sbox_lookup(nibble: Sequence[int], box: Sequence[Sequence[int]]) -> Bits:
    """Collapse 4 bits to 2 via `box`: row = outer bits, column = inner bits."""
    row = nibble[0] * 2 + nibble[3]      # b1 b4
    column = nibble[1] * 2 + nibble[2]   # b2 b3
    value = box[row][column]
    return [(value >> 1) & 1, value & 1]


def _round_function(block: Sequence[int], subkey: Sequence[int]) -> Bits:
    """One Feistel round fK: returns (L XOR F(R, subkey), R), leaving R intact."""
    left, right = list(block[:4]), list(block[4:])

    expanded = _permute(right, EP)                                   # E/P: 4->8
    mixed = [b ^ k for b, k in zip(expanded, subkey)]                # XOR subkey
    substituted = (
        _sbox_lookup(mixed[:4], S0) + _sbox_lookup(mixed[4:], S1)    # S0 | S1
    )
    scrambled = _permute(substituted, P4)                            # P4

    return [b ^ s for b, s in zip(left, scrambled)] + right


def _swap(block: Sequence[int]) -> Bits:
    """SW: exchange the two 4-bit halves between the rounds."""
    return list(block[4:]) + list(block[:4])


def _crypt_block(block: Sequence[int], first: Sequence[int], second: Sequence[int]) -> Bits:
    """Apply IP -> fK(first) -> SW -> fK(second) -> IP-inverse to one block.

    Encryption passes (K1, K2); decryption passes (K2, K1). Nothing else about
    the network changes — that symmetry is the point of a Feistel cipher.
    """
    state = _permute(block, IP)          # IP
    state = _round_function(state, first)   # fK with the first subkey
    state = _swap(state)                    # SW
    state = _round_function(state, second)  # fK with the second subkey
    return _permute(state, IP_INV)      # IP-inverse


def validate_key(key: Optional[str]) -> str:
    """Normalize `key` to a 10-character binary string, or raise ``ValueError``.

    Surrounding whitespace is stripped. Anything that is not exactly ten
    ``'0'``/``'1'`` characters — ``None``, a non-string, an empty string, the
    wrong length, or non-binary characters — is rejected with a message naming
    the expected format.
    """
    if key is None:
        raise ValueError(f"S-DES key must not be None. {KEY_FORMAT}.")
    if not isinstance(key, str):
        raise ValueError(
            f"S-DES key must be a string, got {type(key).__name__}. {KEY_FORMAT}."
        )

    candidate = key.strip()
    if not candidate:
        raise ValueError(f"S-DES key must not be empty. {KEY_FORMAT}.")
    if any(character not in "01" for character in candidate):
        raise ValueError(
            f"S-DES key {key!r} contains non-binary characters. {KEY_FORMAT}."
        )
    if len(candidate) != KEY_LENGTH:
        raise ValueError(
            f"S-DES key must be exactly {KEY_LENGTH} bits, got {len(candidate)}. "
            f"{KEY_FORMAT}."
        )
    return candidate


def encrypt(plaintext: str, key: str) -> str:
    """Encrypt `plaintext` under the 10-bit `key` as space-separated bit groups.

    The text is encoded to UTF-8 and each byte enciphered as one 8-bit block,
    so multi-byte characters occupy consecutive groups. An empty string
    produces an empty string.
    """
    if not isinstance(plaintext, str):
        raise ValueError(
            f"S-DES plaintext must be a string, got {type(plaintext).__name__}."
        )
    k1, k2 = _derive_subkeys([int(bit) for bit in validate_key(key)])

    groups = []
    for byte in plaintext.encode("utf-8"):
        block = [(byte >> shift) & 1 for shift in range(7, -1, -1)]
        groups.append("".join(str(bit) for bit in _crypt_block(block, k1, k2)))
    return " ".join(groups)


def decrypt(ciphertext: str, key: str) -> str:
    """Recover the plaintext from space-separated 8-bit groups under `key`.

    Raises ``ValueError`` if the ciphertext is malformed (a group of the wrong
    length or containing non-binary characters), and also if the recovered
    bytes are not valid UTF-8 — which is the usual outcome of decrypting with
    the wrong key. Callers map that to ``DECRYPTION_FAILED`` rather than
    letting a raw ``UnicodeDecodeError`` escape.
    """
    if not isinstance(ciphertext, str):
        raise ValueError(
            f"S-DES ciphertext must be a string, got {type(ciphertext).__name__}."
        )
    k1, k2 = _derive_subkeys([int(bit) for bit in validate_key(key)])

    groups = ciphertext.split()
    if not groups:
        return ""

    recovered = bytearray()
    for group in groups:
        if any(character not in "01" for character in group):
            raise ValueError(
                f"S-DES ciphertext group {group!r} contains non-binary characters. "
                "Expected space-separated 8-bit binary groups."
            )
        if len(group) != BLOCK_SIZE:
            raise ValueError(
                f"S-DES ciphertext group {group!r} is {len(group)} bits, expected "
                f"{BLOCK_SIZE}. Expected space-separated 8-bit binary groups."
            )
        # Decryption reuses the same network with the subkeys reversed.
        plain_bits = _crypt_block([int(bit) for bit in group], k2, k1)
        recovered.append(int("".join(str(bit) for bit in plain_bits), 2))

    try:
        return recovered.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(
            "S-DES decryption failed: the recovered bytes are not valid UTF-8. "
            "This usually means the key is incorrect."
        ) from exc


def generate_key() -> str:
    """Return a cryptographically random 10-bit key as a binary string."""
    return "".join(str(secrets.randbelow(2)) for _ in range(KEY_LENGTH))
