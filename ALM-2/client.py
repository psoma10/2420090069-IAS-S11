"""
ALM-2 AES client.

Sends a 10 KB human-readable text file to the server, encrypted with
AES-128-CBC (PyCryptodome). In the same connection, receives a different
5 KB text file back from the server, encrypted the same way.
"""

import os
import socket
import sys

from algorithms import aes_cipher
from fileutils import preview_hex, preview_text, sha256_hex
from network.protocol import recv_message, send_message

HOST = "127.0.0.1"
PORT = 6000

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
CLIENT_FILE = os.path.join(PROJECT_ROOT, "files", "client", "sample_10kb.txt")
RECEIVED_DIR = os.path.join(PROJECT_ROOT, "received", "client")


def print_banner() -> None:
    print("=" * 40)
    print("        AES CLIENT (ALM-2)")
    print("=" * 40)


def read_key() -> str:
    while True:
        key_text = input("Enter AES-128 key (16 characters): ")
        if len(key_text.encode("utf-8")) == aes_cipher.KEY_LEN:
            return key_text
        print(f"Key must be exactly {aes_cipher.KEY_LEN} characters. Try again.")


def run(sock: socket.socket) -> None:
    key_text = read_key()
    key = aes_cipher.make_key(key_text)

    print("\n" + "-" * 40)
    print("CLIENT -> SERVER (10 KB text file)")
    print("-" * 40)

    with open(CLIENT_FILE, "rb") as f:
        plaintext_data = f.read()
    print(f"\nRead {len(plaintext_data)} bytes from {CLIENT_FILE}")
    print(f"\nPlaintext preview:\n{preview_text(plaintext_data)}")

    ciphertext_data = aes_cipher.encrypt(plaintext_data, key)
    print(f"\nCiphertext preview (hex): {preview_hex(ciphertext_data)}")

    original_hash = sha256_hex(plaintext_data)
    print(f"\nSending to server... SHA-256: {original_hash}")

    send_message(
        sock,
        {
            "type": "FILE_TRANSFER",
            "algorithm": "aes128-cbc",
            "filename": os.path.basename(CLIENT_FILE),
            "key": key_text,
            "sha256": original_hash,
        },
        ciphertext_data,
    )

    header, ack_payload = recv_message(sock)
    if header.get("type") != "FILE_ACK":
        print("Unexpected response from server.")
        return

    status = "matched" if header.get("verified") else "DID NOT MATCH"
    print(f"\nServer report: decrypted file {status} the original (SHA-256).")

    if not ack_payload:
        return

    print("\n" + "-" * 40)
    print("SERVER -> CLIENT (5 KB text file)")
    print("-" * 40)

    filename = header["filename"]
    expected_hash = header["sha256"]
    print(f"\nReceived {len(ack_payload)} bytes for {filename!r}")
    print(f"Ciphertext preview (hex): {preview_hex(ack_payload)}")

    reply_plaintext_data = aes_cipher.decrypt(ack_payload, key)
    print(f"\nPlaintext preview:\n{preview_text(reply_plaintext_data)}")

    os.makedirs(RECEIVED_DIR, exist_ok=True)
    out_path = os.path.join(RECEIVED_DIR, filename)
    with open(out_path, "wb") as f:
        f.write(reply_plaintext_data)

    actual_hash = sha256_hex(reply_plaintext_data)
    verified = actual_hash == expected_hash

    print(f"\nSaved decrypted file to: {out_path}")
    print("\n✓ File transfer successful" if verified else "\n✗ File transfer FAILED")
    print("✓ Decryption successful" if verified else "✗ Decryption mismatch")
    print(
        "✓ Original and decrypted files match"
        if verified
        else "✗ Original and decrypted files DO NOT match"
    )
    print(f"SHA-256: {actual_hash}")


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    print_banner()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.connect((HOST, PORT))
            print(f"\nConnected to server {HOST}:{PORT}")
            run(sock)
    except ConnectionRefusedError:
        print(f"\nCould not connect to {HOST}:{PORT}. Is server.py running?")
    except (ConnectionError, ValueError) as exc:
        print(f"\nError: {exc}")


if __name__ == "__main__":
    main()
