# CyberVault Backend — Architecture

Backend for CyberVault, a secure client–server document exchange prototype.
Flask + PostgreSQL (Neon) + PyCryptodome. Consumed by a separately-developed frontend
purely over the REST API described in `API_CONTRACT.md`.

---

## 1. Layering

Requests move strictly downward. A layer never reaches past the one below it.

```text
routes/          HTTP only: parse request, call service, shape response
   |
services/        business rules, orchestration, transactions
   |
repositories/    all SQL lives here; returns plain dicts
   |
database/        connection, schema, migrations
```

Cross-cutting:

```text
crypto/          pure algorithm implementations, zero framework imports
core/            errors, response envelope, auth decorator, validation
```

### Hard rules

1. `routes/` must not import a database driver or anything from `crypto/`.
2. `crypto/` must not import Flask, the database, or any other project module.
   Each cipher is a standalone, testable unit.
3. Only `repositories/` writes SQL.
4. `services/crypto_service.py` is the single door into `crypto/`. Routes call
   `CryptoService`, never `CaesarCipher` directly.

---

## 2. Directory layout

```text
prototype-1/backend/
├── app.py                     application factory + blueprint registration
├── config.py                  limits, paths, secret loading
├── requirements.txt
│
├── core/
│   ├── errors.py              AppError hierarchy + error codes
│   ├── responses.py           success()/failure() envelope builders
│   ├── auth.py                @login_required, current_user
│   └── validation.py          shared input validators
│
├── crypto/
│   ├── base.py                Cipher interface + registry
│   ├── caesar.py
│   ├── playfair.py
│   ├── sdes.py
│   └── aes.py
│
├── database/
│   ├── connection.py          pooled PostgreSQL connections
│   └── schema.sql             DDL, applied at startup
│
├── repositories/
│   ├── user_repository.py
│   ├── document_repository.py
│   ├── transfer_repository.py
│   ├── encryption_log_repository.py
│   └── activity_repository.py
│
├── services/
│   ├── auth_service.py
│   ├── crypto_service.py      algorithm dispatch + timing + logging
│   ├── document_service.py    upload validation, storage, encryption
│   ├── transfer_service.py    transfer state machine
│   └── stats_service.py       dashboard + server status aggregation
│
├── routes/
│   ├── auth.py                /api/auth/*
│   ├── documents.py           /api/documents/*
│   ├── encryption.py          /api/encryption/*, /api/algorithms
│   ├── transfers.py           /api/transfers/*
│   └── system.py              /api/dashboard, /api/server/status, /api/activity
│
├── storage/
│   ├── uploads/               development copies; the database is authoritative
│   ├── encrypted/             ciphertext payloads
│   └── decrypted/             recovered plaintext
│
└── tests/
    ├── crypto/                per-algorithm unit tests
    ├── documents/             upload validation tests
    └── integration/           API + end-to-end tests
```

---

## 3. Cryptography abstraction

Every cipher implements the same two functions:

```python
encrypt(plaintext: str, key: str) -> str   # returns ciphertext as text
decrypt(ciphertext: str, key: str) -> str  # returns recovered plaintext
```

Ciphertext is always a **string**, so it is safe to store in a TEXT column,
embed in JSON, and display in the UI.

| Algorithm | Ciphertext encoding | Key format |
|---|---|---|
| Caesar | printable text, same alphabet | integer 0–25 as string |
| Playfair | uppercase A–Z letters | alphabetic keyword |
| SDES | space-separated 8-bit binary groups | 10-bit binary string |
| AES | Base64 of `nonce ‖ tag ‖ ciphertext` | hex string, 32/48/64 chars |

Dispatch:

```text
CryptoService.encrypt(algorithm, text, key)
        |
        +-- "caesar"   -> crypto.caesar
        +-- "playfair" -> crypto.playfair
        +-- "sdes"     -> crypto.sdes
        +-- "aes"      -> crypto.aes
```

`CryptoService` additionally: validates the algorithm id, measures elapsed
time in milliseconds, converts any cipher-level exception into an `AppError`
with an `INVALID_KEY` / `ENCRYPTION_FAILED` / `DECRYPTION_FAILED` code, and
writes an `encryption_logs` row when a document is involved.

### Round-trip guarantee

`decrypt(encrypt(p, k), k) == p` holds exactly for **AES** and **SDES**.

Caesar preserves case, spaces, punctuation and digits, so it round-trips
exactly for those characters too.

Playfair is lossy by construction — the classical algorithm discards
non-letters, folds J into I, and inserts padding. `crypto/playfair.py`
documents this, and its tests assert against the *normalized* plaintext
rather than the raw input. This is expected classical behavior, not a defect.

---

## 4. Key handling model

**Demo mode, chosen deliberately for this academic prototype.**

The encryption key is submitted with the transfer and stored on the transfer
row, so the receiving side can decrypt and display the recovered plaintext —
which is what the PRD's server-side screens require.

```text
CLIENT                                    SERVER
plaintext                                 ciphertext + key
   | encrypt(key)                                |
ciphertext ---------- transfer ------------>  decrypt(key)
                                                 |
                                             plaintext
```

This is **not** a secure key-exchange design. A real system would negotiate a
session key (RSA/ECDH), never transmit the symmetric key alongside the data,
and never persist it. Recorded honestly here and in `SECURITY_REVIEW.md`
because the prototype's purpose is to demonstrate the encryption/decryption
cycle end to end, not to model key distribution.

Mitigations that *are* implemented:

- Keys are never written to application logs.
- `GET /api/transfers/{id}` never returns the key.
- Keys are only readable by the owning user's authenticated session.

---

## 5. Transfer state machine

```text
PENDING -> ENCRYPTING -> TRANSMITTING -> RECEIVED -> DECRYPTING -> COMPLETED
                |              |             |            |
                +--------------+-------------+------------+---> FAILED
```

- `POST /api/transfers` drives PENDING → RECEIVED synchronously; the
  intermediate states are recorded so the frontend's transfer-monitor screen
  has real stage data to render.
- `POST /api/transfers/{id}/decrypt` drives RECEIVED → COMPLETED.
- Any raised `AppError` moves the transfer to FAILED and records the reason.
- Transitions are validated: a COMPLETED transfer cannot re-enter DECRYPTING.

Direction is `CLIENT_TO_SERVER` or `SERVER_TO_CLIENT`. Direction determines
the size ceiling, enforced at upload time (see §6).

---

## 6. File validation

| Direction | Max size | Extension | Content |
|---|---:|---|---|
| `CLIENT_TO_SERVER` | 10 KB (10240 B) | `.txt` | must decode as UTF-8 |
| `SERVER_TO_CLIENT` | 5 KB (5120 B) | `.txt` | must decode as UTF-8 |

Rejected: empty files, non-`.txt` extensions, bytes that fail UTF-8 decode,
and any filename that fails the safe-name check.

Document text is stored in the `documents.content` column, not on the
filesystem. The upload directory still receives a copy while developing, but
nothing reads it back: the database is the only durable store, and a host with
an ephemeral filesystem would otherwise lose every document on redeploy.

Stored filenames are generated server-side as
`{document_id}_{secure_filename(original)}`. The original name is kept only as
a database column. No request-supplied path ever reaches the filesystem, so
`../` traversal and absolute paths cannot escape `storage/`.

---

## 7. Errors

Every failure raises an `AppError` subclass carrying an HTTP status and a
stable machine-readable code. A single Flask error handler converts these into
the failure envelope. Unhandled exceptions become a generic
`INTERNAL_ERROR` 500 — the message and traceback are logged server-side and
never returned to the client.

Codes are listed in `API_CONTRACT.md` §4.

---

## 8. Authentication

Flask server-side sessions, signed with `SECRET_KEY` from the environment
(a development fallback is generated at import time when unset, and a warning
is logged). Passwords hashed with Werkzeug's PBKDF2-SHA256.

`@login_required` rejects unauthenticated requests with `401 UNAUTHORIZED`.
Ownership is enforced per resource: a user can only read documents and
transfers whose `user_id` matches the session — a mismatch returns 404, not
403, so the API does not confirm that another user's document id exists.

---

## 9. Startup

`app.py` exposes `create_app(config)`. On first run it creates `storage/`
subdirectories and applies `database/schema.sql`. Tests build an app against a
temporary database and storage root, so the suite never touches development
data.
