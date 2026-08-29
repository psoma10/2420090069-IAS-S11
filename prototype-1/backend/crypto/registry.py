"""Algorithm registry.

The single place that knows which cipher modules exist and what the API should
say about them. Adding an algorithm means adding one entry here and one module
beside it — no route, service or test needs to change.

Each cipher module exposes the same surface (ARCHITECTURE.md section 3)::

    encrypt(plaintext: str, key: str) -> str
    decrypt(ciphertext: str, key: str) -> str
    generate_key(...) -> str
    validate_key(key) -> Any
    KEY_FORMAT: str
"""

from __future__ import annotations

from dataclasses import dataclass, field
from types import ModuleType

from crypto import aes, caesar, playfair, sdes


@dataclass(frozen=True)
class Algorithm:
    """Everything the API knows about one cipher."""

    id: str
    name: str
    type: str
    description: str
    module: ModuleType
    key_sizes: tuple[int, ...] = field(default_factory=tuple)
    lossless: bool = True
    authenticated: bool = False

    @property
    def key_format(self) -> str:
        return self.module.KEY_FORMAT

    def label(self, key: str | None = None) -> str:
        """Display label, e.g. ``"AES-256"`` or ``"Caesar Cipher"``."""
        if self.id == "aes" and key:
            try:
                return f"AES-{self.module.key_size_bits(key)}"
            except Exception:
                return self.name
        return self.name

    def to_public_dict(self) -> dict:
        """The shape API_CONTRACT.md section 3.2 promises the frontend."""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "description": self.description,
            "key_format": self.key_format,
            "key_sizes": list(self.key_sizes),
            "supports_generate": True,
        }


ALGORITHMS: dict[str, Algorithm] = {
    "caesar": Algorithm(
        id="caesar",
        name="Caesar Cipher",
        type="classical",
        description="Classical substitution cipher using character shifting.",
        module=caesar,
    ),
    "playfair": Algorithm(
        id="playfair",
        name="Playfair Cipher",
        type="classical",
        description="Classical digraph substitution cipher using a 5x5 key square.",
        module=playfair,
        # Discards non-letters, folds J into I and inserts padding, so the
        # recovered text is not byte-identical to the input. The API echoes the
        # normalized plaintext so the interface can show what was encrypted.
        lossless=False,
    ),
    "sdes": Algorithm(
        id="sdes",
        name="SDES",
        type="educational",
        description=(
            "Simplified Data Encryption Standard, for educational demonstration."
        ),
        module=sdes,
    ),
    "aes": Algorithm(
        id="aes",
        name="AES",
        type="modern",
        description="Modern symmetric block cipher in authenticated EAX mode.",
        module=aes,
        key_sizes=(128, 192, 256),
        authenticated=True,
    ),
}

# Order the frontend displays them in: classical, educational, then modern.
ALGORITHM_ORDER = ("caesar", "playfair", "sdes", "aes")


def get(algorithm_id: str) -> Algorithm | None:
    if not isinstance(algorithm_id, str):
        return None
    return ALGORITHMS.get(algorithm_id.strip().lower())


def all_algorithms() -> list[Algorithm]:
    return [ALGORITHMS[key] for key in ALGORITHM_ORDER]


def public_list() -> list[dict]:
    return [algo.to_public_dict() for algo in all_algorithms()]


__all__ = ["Algorithm", "ALGORITHMS", "ALGORITHM_ORDER", "get", "all_algorithms", "public_list"]
