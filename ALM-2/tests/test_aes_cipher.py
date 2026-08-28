"""Tests for algorithms/aes_cipher.py (AES-128-CBC via PyCryptodome)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from algorithms import aes_cipher

KEY_TEXT = "sixteenbytekey!!"


class TestMakeKey(unittest.TestCase):
    def test_accepts_16_char_key(self):
        key = aes_cipher.make_key(KEY_TEXT)
        self.assertEqual(len(key), 16)

    def test_rejects_short_key(self):
        with self.assertRaises(ValueError):
            aes_cipher.make_key("short")

    def test_rejects_long_key(self):
        with self.assertRaises(ValueError):
            aes_cipher.make_key("this key is way too long")


class TestEncryptDecryptRoundTrip(unittest.TestCase):
    def setUp(self):
        self.key = aes_cipher.make_key(KEY_TEXT)

    def test_round_trip_short_text(self):
        plaintext = b"Hello, AES!"
        ciphertext = aes_cipher.encrypt(plaintext, self.key)
        self.assertEqual(aes_cipher.decrypt(ciphertext, self.key), plaintext)

    def test_round_trip_exact_block_multiple(self):
        plaintext = b"A" * 32  # exactly two AES blocks
        ciphertext = aes_cipher.encrypt(plaintext, self.key)
        self.assertEqual(aes_cipher.decrypt(ciphertext, self.key), plaintext)

    def test_round_trip_empty(self):
        ciphertext = aes_cipher.encrypt(b"", self.key)
        self.assertEqual(aes_cipher.decrypt(ciphertext, self.key), b"")

    def test_ciphertext_includes_iv_prefix_and_differs_per_call(self):
        plaintext = b"same plaintext every time"
        c1 = aes_cipher.encrypt(plaintext, self.key)
        c2 = aes_cipher.encrypt(plaintext, self.key)
        self.assertNotEqual(c1, c2)  # random IV each call
        self.assertEqual(len(c1) - aes_cipher.IV_LEN, len(c2) - aes_cipher.IV_LEN)

    def test_decrypt_rejects_data_shorter_than_iv(self):
        with self.assertRaises(ValueError):
            aes_cipher.decrypt(b"short", self.key)

    def test_decrypt_with_wrong_key_fails_or_garbles(self):
        plaintext = b"secret message"
        ciphertext = aes_cipher.encrypt(plaintext, self.key)
        wrong_key = aes_cipher.make_key("differentkey!!!!"[:16])
        with self.assertRaises(Exception):
            aes_cipher.decrypt(ciphertext, wrong_key)


class TestSampleFiles(unittest.TestCase):
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def test_10kb_sample_exists_and_round_trips(self):
        path = os.path.join(self.PROJECT_ROOT, "files", "client", "sample_10kb.txt")
        self.assertTrue(os.path.isfile(path))
        with open(path, "rb") as f:
            data = f.read()
        self.assertEqual(len(data), 10240)

        key = aes_cipher.make_key(KEY_TEXT)
        ciphertext = aes_cipher.encrypt(data, key)
        self.assertEqual(aes_cipher.decrypt(ciphertext, key), data)

    def test_5kb_sample_exists_and_round_trips(self):
        path = os.path.join(self.PROJECT_ROOT, "files", "server", "sample_5kb.txt")
        self.assertTrue(os.path.isfile(path))
        with open(path, "rb") as f:
            data = f.read()
        self.assertEqual(len(data), 5120)

        key = aes_cipher.make_key(KEY_TEXT)
        ciphertext = aes_cipher.encrypt(data, key)
        self.assertEqual(aes_cipher.decrypt(ciphertext, key), data)


if __name__ == "__main__":
    unittest.main()
