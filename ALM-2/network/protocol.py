"""
Simple framed messaging protocol over TCP (same design as ALM-1).

Every message on the wire looks like:

    [4-byte big-endian header length][JSON header][raw payload bytes]

The JSON header always carries a "payload_len" field, so the receiver
knows exactly how many payload bytes to pull off the socket. Reading is
done in a loop (see recv_exact) so this works whether the payload is a
few bytes or a full 10 KB text file.
"""

import json
import socket
import struct

HEADER_LEN_SIZE = 4
CHUNK_SIZE = 4096


def recv_exact(sock: socket.socket, num_bytes: int) -> bytes:
    """Read exactly num_bytes from sock, looping over recv() as needed."""
    buf = bytearray()
    while len(buf) < num_bytes:
        remaining = num_bytes - len(buf)
        chunk = sock.recv(min(CHUNK_SIZE, remaining))
        if not chunk:
            raise ConnectionError(
                f"Connection closed after {len(buf)}/{num_bytes} bytes"
            )
        buf.extend(chunk)
    return bytes(buf)


def send_message(sock: socket.socket, header: dict, payload: bytes = b"") -> None:
    """Send a JSON header followed by an optional binary payload."""
    header = dict(header)
    header["payload_len"] = len(payload)
    header_bytes = json.dumps(header).encode("utf-8")

    sock.sendall(struct.pack("!I", len(header_bytes)))
    sock.sendall(header_bytes)
    if payload:
        sock.sendall(payload)


def recv_message(sock: socket.socket) -> tuple[dict, bytes]:
    """Receive a JSON header and its payload. Returns (header, payload)."""
    header_len = struct.unpack("!I", recv_exact(sock, HEADER_LEN_SIZE))[0]
    header = json.loads(recv_exact(sock, header_len).decode("utf-8"))
    payload_len = header.get("payload_len", 0)
    payload = recv_exact(sock, payload_len) if payload_len else b""
    return header, payload
