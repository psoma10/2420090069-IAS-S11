"""
AES-128-CBC helpers built on PyCryptodome.

AES here plays the same role SDES played in ALM-1: a symmetric block
cipher the client and server both use with a shared key. Unlike SDES's
8-bit blocks, AES operates on 16-byte (128-bit) blocks, so plaintext that
isn't an exact multiple of 16 bytes needs padding (PKCS#7, via
Crypto.Util.Padding) — removed again after decryption.

A random 16-byte IV is generated per encryption call and prepended to the
ciphertext, so the receiver can recover it without a separate exchange.
This is the standard way to use CBC mode safely (never reuse an IV).
"""

from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad

KEY_LEN = 16  # AES-128
BLOCK_SIZE = AES.block_size  # 16 bytes
IV_LEN = BLOCK_SIZE


def make_key(key_text: str) -> bytes:
    """Validate and encode a 16-character key string as raw AES-128 key bytes."""
    key_bytes = key_text.encode("utf-8")
    if len(key_bytes) != KEY_LEN:
        raise ValueError(f"AES-128 key must be exactly {KEY_LEN} characters")
    return key_bytes


def encrypt(plaintext: bytes, key: bytes) -> bytes:
    """Encrypt plaintext with AES-128-CBC. Returns IV || ciphertext."""
    iv = get_random_bytes(IV_LEN)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    ciphertext = cipher.encrypt(pad(plaintext, BLOCK_SIZE))
    return iv + ciphertext


def decrypt(data: bytes, key: bytes) -> bytes:
    """Decrypt IV || ciphertext produced by encrypt(), returns plaintext."""
    if len(data) < IV_LEN:
        raise ValueError("Ciphertext too short to contain an IV")
    iv, ciphertext = data[:IV_LEN], data[IV_LEN:]
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return unpad(cipher.decrypt(ciphertext), BLOCK_SIZE)
