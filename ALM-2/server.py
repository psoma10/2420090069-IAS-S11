"""
ALM-2 AES server.

Receives a 10 KB AES-encrypted text file from the client, decrypts and
saves it, then sends a different 5 KB text file back, encrypted with the
same AES-128-CBC key.
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
SERVER_FILE = os.path.join(PROJECT_ROOT, "files", "server", "sample_5kb.txt")
RECEIVED_DIR = os.path.join(PROJECT_ROOT, "received", "server")


def print_banner() -> None:
    print("=" * 40)
    print("        AES SERVER (ALM-2)")
    print("=" * 40)


def handle_file_transfer(conn: socket.socket, header: dict, payload: bytes) -> None:
    print("\n" + "-" * 40)
    print("CLIENT -> SERVER (10 KB text file)")
    print("-" * 40)

    filename = header["filename"]
    key_text = header["key"]
    expected_hash = header["sha256"]
    key = aes_cipher.make_key(key_text)
    ciphertext_data = payload

    print(f"\nReceived {len(ciphertext_data)} bytes for {filename!r}")
    print(f"Ciphertext preview (hex): {preview_hex(ciphertext_data)}")

    plaintext_data = aes_cipher.decrypt(ciphertext_data, key)
    print(f"\nPlaintext preview:\n{preview_text(plaintext_data)}")

    os.makedirs(RECEIVED_DIR, exist_ok=True)
    out_path = os.path.join(RECEIVED_DIR, filename)
    with open(out_path, "wb") as f:
        f.write(plaintext_data)

    actual_hash = sha256_hex(plaintext_data)
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

    print("\n" + "-" * 40)
    print("SERVER -> CLIENT (5 KB text file)")
    print("-" * 40)

    with open(SERVER_FILE, "rb") as f:
        reply_plaintext_data = f.read()
    print(f"\nRead {len(reply_plaintext_data)} bytes from {SERVER_FILE}")
    print(f"\nPlaintext preview:\n{preview_text(reply_plaintext_data)}")

    reply_ciphertext_data = aes_cipher.encrypt(reply_plaintext_data, key)
    print(f"\nCiphertext preview (hex): {preview_hex(reply_ciphertext_data)}")

    reply_hash = sha256_hex(reply_plaintext_data)
    print(f"\nSending encrypted file to client... SHA-256: {reply_hash}")

    send_message(
        conn,
        {
            "type": "FILE_ACK",
            "verified": verified,
            "filename": os.path.basename(SERVER_FILE),
            "sha256": reply_hash,
        },
        reply_ciphertext_data,
    )
    print("File sent successfully.")


def handle_connection(conn: socket.socket) -> None:
    header, payload = recv_message(conn)
    if header.get("type") == "FILE_TRANSFER":
        handle_file_transfer(conn, header, payload)
    else:
        print(f"\nUnexpected message type {header.get('type')!r}, ignoring.")


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)
    print_banner()
    print(f"\nServer started on {HOST}:{PORT}")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_sock:
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_sock.bind((HOST, PORT))
        server_sock.listen(1)

        try:
            while True:
                print("\nWaiting for client...")
                conn, addr = server_sock.accept()
                with conn:
                    print(f"\nClient connected: {addr[0]}:{addr[1]}")
                    try:
                        handle_connection(conn)
                    except (ConnectionError, ValueError) as exc:
                        print(f"\nError: {exc}")
        except KeyboardInterrupt:
            print("\n\nServer shutting down.")


if __name__ == "__main__":
    main()
