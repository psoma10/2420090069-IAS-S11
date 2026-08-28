# CyberVault Backend — API Contract

**Status:** stable as of Phase 1. Breaking changes require an entry in §9.

Base URL: `http://127.0.0.1:5000`
All paths are prefixed `/api`.
All request and response bodies are `application/json`, except document upload
which is `multipart/form-data`.

The backend serves **JSON only**. It renders no Jinja templates. The frontend
is a separate static application (HTML/CSS/JS) that consumes these endpoints.

---

## 1. Response envelope

Every response — success or failure — uses one of these two shapes.

**Success**

```json
{
  "success": true,
  "message": "Document encrypted successfully",
  "data": {}
}
```

**Failure**

```json
{
  "success": false,
  "message": "File exceeds the 10 KB limit",
  "error": { "code": "FILE_TOO_LARGE" }
}
```

`message` is human-readable and safe to display. `error.code` is stable and
safe to branch on. `data` is absent on failure; `error` is absent on success.

---

## 2. Authentication

Flask signed session cookie, name `session`, `HttpOnly`, `SameSite=Lax`.

Send `credentials: "include"` on every fetch. There is **no CSRF token** — the
API accepts JSON bodies only and rejects `application/x-www-form-urlencoded`
on state-changing routes, so simple-form CSRF does not apply. Do not build
HTML forms that post directly to the API.

Every route except `/api/auth/register`, `/api/auth/login`,
`/api/algorithms` and `/api/server/status` requires an authenticated session
and returns `401 UNAUTHORIZED` without one.

---

## 3. Endpoints

### 3.1 Auth

#### `POST /api/auth/register`

```json
{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "hunter2hunter2" }
```

Rules: name 1–80 chars; email must contain `@` and be unique; password ≥ 8 chars.

`201`

```json
{
  "success": true,
  "message": "Account created successfully",
  "data": { "user": { "id": 1, "name": "Ada Lovelace", "email": "ada@example.com", "created_at": "2026-08-29T10:12:04Z" } }
}
```

Errors: `VALIDATION_ERROR` 400, `EMAIL_TAKEN` 409.

Registration logs the user in — the session cookie is set on the `201`.

#### `POST /api/auth/login`

```json
{ "email": "ada@example.com", "password": "hunter2hunter2" }
```

`200` → same `data.user` shape as register.
Errors: `INVALID_CREDENTIALS` 401 (identical message for unknown email and
wrong password — the API does not reveal which).

#### `POST /api/auth/logout`

No body. `200`, `data` is `{}`. Safe to call when already logged out.

#### `GET /api/auth/me`

`200` → `data.user`. `401 UNAUTHORIZED` when no session.

**The user object never contains `password_hash`.**

---

### 3.2 Algorithms

#### `GET /api/algorithms`

Public. Static list — safe to cache for the page lifetime.

`200`

```json
{
  "success": true,
  "message": "Algorithms retrieved",
  "data": [
    {
      "id": "caesar",
      "name": "Caesar Cipher",
      "type": "classical",
      "description": "Classical substitution cipher using character shifting.",
      "key_format": "Integer shift from 0 to 25",
      "key_sizes": [],
      "supports_generate": true
    },
    {
      "id": "playfair",
      "name": "Playfair Cipher",
      "type": "classical",
      "description": "Classical digraph substitution cipher using a 5x5 key square.",
      "key_format": "Alphabetic keyword, letters only",
      "key_sizes": [],
      "supports_generate": true
    },
    {
      "id": "sdes",
      "name": "SDES",
      "type": "educational",
      "description": "Simplified Data Encryption Standard, for educational demonstration.",
      "key_format": "10-bit binary string, e.g. 1010000010",
      "key_sizes": [],
      "supports_generate": true
    },
    {
      "id": "aes",
      "name": "AES",
      "type": "modern",
      "description": "Modern symmetric block cipher in authenticated EAX mode.",
      "key_format": "Hex string: 32, 48 or 64 characters",
      "key_sizes": [128, 192, 256],
      "supports_generate": true
    }
  ]
}
```

`data` is an **array**, not an object.

#### `POST /api/algorithms/{id}/key`

Generates a valid random key for the algorithm. For `aes`, body may carry
`{ "key_size": 256 }` (one of 128/192/256, default 256). Other algorithms
take no body.

`200`

```json
{ "success": true, "message": "Key generated", "data": { "algorithm": "aes", "key": "3f7c…", "key_size": 256 } }
```

Errors: `UNSUPPORTED_ALGORITHM` 400, `VALIDATION_ERROR` 400 (bad key size).

---

### 3.3 Encryption preview

#### `POST /api/encryption/preview`

Encrypts a text snippet without creating a document or transfer. Powers the
side-by-side plaintext/ciphertext screen.

```json
{ "algorithm": "aes", "key": "3f7c…", "text": "Hello CyberVault" }
```

`text` max 10240 characters.

`200`

```json
{
  "success": true,
  "message": "Preview generated",
  "data": {
    "algorithm": "aes",
    "algorithm_label": "AES-256",
    "plaintext": "Hello CyberVault",
    "ciphertext": "k9Fh…",
    "plaintext_size": 16,
    "ciphertext_size": 60,
    "encryption_time_ms": 0.21
  }
}
```

`algorithm_label` is the display string ("AES-256", "Caesar Cipher", …).
For Playfair, `plaintext` echoes the **normalized** text actually encrypted,
which may differ from what was sent — see `ARCHITECTURE.md` §3.

Errors: `UNSUPPORTED_ALGORITHM` 400, `INVALID_KEY` 400, `VALIDATION_ERROR` 400,
`ENCRYPTION_FAILED` 500.

#### `POST /api/encryption/decrypt-preview`

Mirror of the above; body takes `ciphertext` instead of `text`, response
returns `plaintext` and `decryption_time_ms`. Errors add `DECRYPTION_FAILED` 400.

---

### 3.4 Documents

#### `POST /api/documents`

`multipart/form-data`.

| field | required | notes |
|---|---|---|
| `file` | yes | `.txt`, UTF-8 decodable, non-empty |
| `direction` | no | `CLIENT_TO_SERVER` (default) or `SERVER_TO_CLIENT` |
| `algorithm` | no | recorded as the intended algorithm |

Size limit follows `direction`: 10240 B client→server, 5120 B server→client.

`201`

```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "id": 7,
    "filename": "confidential.txt",
    "size": 8704,
    "algorithm": "aes",
    "direction": "CLIENT_TO_SERVER",
    "status": "UPLOADED",
    "created_at": "2026-08-29T10:14:31Z"
  }
}
```

`status` is one of `UPLOADED`, `ENCRYPTED`, `TRANSFERRED`.

Errors: `FILE_TOO_LARGE` 413, `INVALID_FILE_TYPE` 400, `EMPTY_FILE` 400,
`VALIDATION_ERROR` 400, `UNAUTHORIZED` 401.

`FILE_TOO_LARGE` messages name the actual and allowed sizes, e.g.
`"File size 13.4 KB exceeds the 10 KB limit for client to server transfers"`.

#### `GET /api/documents`

Query: `direction`, `status`, `limit` (default 50, max 200), `offset`.

`200` → `data.documents` array (shape above) plus `data.total`.

Only the authenticated user's documents are returned.

#### `GET /api/documents/{id}`

`200` → document object plus `data.content` (the plaintext, since the owner
uploaded it) and `data.preview` (first 2000 chars).

Errors: `DOCUMENT_NOT_FOUND` 404 — also returned for another user's document.

#### `GET /api/documents/{id}/download`

`200` `text/plain` attachment. Not JSON.

---

### 3.5 Transfers

#### `POST /api/transfers`

Encrypts a document and transmits it. Runs the state machine synchronously.

```json
{
  "document_id": 7,
  "algorithm": "aes",
  "key": "3f7c…",
  "direction": "CLIENT_TO_SERVER"
}
```

`direction` defaults to the document's direction. The key is stored on the
transfer so the receiver can decrypt (demo mode — `ARCHITECTURE.md` §4).

`201`

```json
{
  "success": true,
  "message": "Transfer completed",
  "data": {
    "transfer_id": "TR-000123",
    "id": 123,
    "status": "RECEIVED",
    "document_id": 7,
    "filename": "confidential.txt",
    "algorithm": "aes",
    "direction": "CLIENT_TO_SERVER",
    "sender": "client",
    "receiver": "server",
    "plaintext_size": 8704,
    "encrypted_size": 11624,
    "encryption_time_ms": 1.83,
    "stages": [
      { "stage": "ENCRYPTING",   "status": "done", "at": "2026-08-29T10:15:02.114Z" },
      { "stage": "TRANSMITTING", "status": "done", "at": "2026-08-29T10:15:02.119Z" },
      { "stage": "RECEIVED",     "status": "done", "at": "2026-08-29T10:15:02.121Z" }
    ],
    "timestamp": "2026-08-29T10:15:02Z"
  }
}
```

`transfer_id` is the display id (`TR-` + zero-padded numeric `id`). Both are
returned; **use the numeric `id` in URLs**, though the `TR-000123` form is also
accepted by `GET`/`POST` on `/api/transfers/{id}`.

Errors: `DOCUMENT_NOT_FOUND` 404, `INVALID_KEY` 400, `UNSUPPORTED_ALGORITHM` 400,
`ENCRYPTION_FAILED` 500, `TRANSFER_FAILED` 500. On failure the transfer row is
persisted with status `FAILED` so it still appears in history.

#### `GET /api/transfers`

Query: `direction`, `status`, `limit` (default 50, max 200), `offset`.

`200` → `data.transfers` array + `data.total`. Newest first.
Each element is the transfer object **without** `stages` and **without** any key.

#### `GET /api/transfers/{id}`

`200` → full transfer object including `stages`, `ciphertext`
(may be large — up to ~14 KB), and `ciphertext_preview` (first 2000 chars).
Includes `decrypted_content` once the transfer is `COMPLETED`.

**Never includes the encryption key.**

Errors: `TRANSFER_NOT_FOUND` 404.

#### `POST /api/transfers/{id}/decrypt`

Receiving side decrypts. Body is optional:

```json
{ "key": "3f7c…" }
```

Omit `key` to use the key stored with the transfer (demo mode). Supply one to
verify a specific key — a wrong key returns `DECRYPTION_FAILED` 400 and leaves
the transfer at `RECEIVED` so it can be retried.

`200`

```json
{
  "success": true,
  "message": "Document decrypted successfully",
  "data": {
    "transfer_id": "TR-000123",
    "status": "COMPLETED",
    "plaintext": "This is the original document.",
    "plaintext_size": 8704,
    "decryption_time_ms": 1.44,
    "integrity_verified": true,
    "stages": [ ]
  }
}
```

`integrity_verified` is `true` only for AES (EAX tag check). For the classical
ciphers it is `null` — they provide no integrity guarantee, and the API says so
rather than implying one.

Errors: `DECRYPTION_FAILED` 400, `INVALID_KEY` 400, `TRANSFER_NOT_FOUND` 404,
`INVALID_STATE` 409 (e.g. transfer is `FAILED`).

---

### 3.6 Dashboard

#### `GET /api/dashboard`

One request, everything the dashboard screen needs.

`200`

```json
{
  "success": true,
  "message": "Dashboard data retrieved",
  "data": {
    "documents": 24,
    "transfers": 18,
    "encrypted_documents": 18,
    "algorithms": 4,
    "successful_transfers": 18,
    "failed_transfers": 0,
    "success_rate": 100.0,
    "server_status": "online",
    "recent_transfers": [],
    "recent_activity": []
  }
}
```

`recent_transfers` holds up to 5 transfer summaries, `recent_activity` up to 10
activity entries (§3.8 shape). `success_rate` is a float 0–100; it is `100.0`
when there are no transfers yet.

---

### 3.7 Server status

#### `GET /api/server/status`

Public — the frontend uses it for the offline banner before login.

`200`

```json
{
  "success": true,
  "message": "Server status retrieved",
  "data": {
    "status": "online",
    "connected_clients": 3,
    "documents_received": 18,
    "documents_sent": 12,
    "successful_transfers": 30,
    "failed_transfers": 1,
    "uptime_seconds": 4210,
    "recent_transfers": []
  }
}
```

`connected_clients` = distinct users with activity in the last 15 minutes.
`documents_received` = completed `CLIENT_TO_SERVER`; `documents_sent` =
completed `SERVER_TO_CLIENT`. These are global counts, not per-user.

If the frontend cannot reach this endpoint at all, treat the server as offline
and show the `SERVER_UNAVAILABLE` state — the backend cannot report its own
downtime.

---

### 3.8 Activity

#### `GET /api/activity`

Query: `limit` (default 50, max 200), `offset`.

`200`

```json
{
  "success": true,
  "message": "Activity retrieved",
  "data": {
    "activity": [
      { "id": 91, "action": "TRANSFER_COMPLETED", "message": "Document decrypted", "at": "2026-08-29T12:33:04Z" }
    ],
    "total": 91
  }
}
```

`action` values: `USER_REGISTERED`, `USER_LOGIN`, `USER_LOGOUT`,
`DOCUMENT_UPLOADED`, `DOCUMENT_ENCRYPTED`, `TRANSFER_INITIATED`,
`TRANSFER_RECEIVED`, `TRANSFER_COMPLETED`, `TRANSFER_FAILED`.

Activity is scoped to the authenticated user.

---

## 4. Error codes

| Code | HTTP | Meaning |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Malformed or missing fields |
| `UNAUTHORIZED` | 401 | No valid session |
| `INVALID_CREDENTIALS` | 401 | Login failed |
| `EMAIL_TAKEN` | 409 | Email already registered |
| `INVALID_FILE_TYPE` | 400 | Not a readable `.txt` |
| `EMPTY_FILE` | 400 | Zero-byte upload |
| `FILE_TOO_LARGE` | 413 | Over the direction's limit |
| `DOCUMENT_NOT_FOUND` | 404 | No such document for this user |
| `TRANSFER_NOT_FOUND` | 404 | No such transfer for this user |
| `UNSUPPORTED_ALGORITHM` | 400 | Algorithm id not in the registry |
| `INVALID_KEY` | 400 | Key malformed for the algorithm |
| `ENCRYPTION_FAILED` | 500 | Cipher raised during encrypt |
| `DECRYPTION_FAILED` | 400 | Wrong key or corrupted ciphertext |
| `TRANSFER_FAILED` | 500 | Transfer aborted |
| `INVALID_STATE` | 409 | Illegal state-machine transition |
| `SERVER_UNAVAILABLE` | 503 | Dependency down |
| `INTERNAL_ERROR` | 500 | Unhandled — details are logged, not returned |

---

## 5. Frontend screen → endpoint map

| Screen | Calls |
|---|---|
| Login | `POST /api/auth/login` |
| Register | `POST /api/auth/register` |
| Dashboard | `GET /api/dashboard` (single request) |
| Algorithm selector | `GET /api/algorithms` |
| Key generate button | `POST /api/algorithms/{id}/key` |
| Secure upload | `POST /api/documents` |
| Encryption preview | `POST /api/encryption/preview` |
| Send to server | `POST /api/transfers` |
| Transfer monitor | `GET /api/transfers/{id}` (poll, or read `stages` from the create response) |
| Server document view | `POST /api/transfers/{id}/decrypt` |
| Server send | `POST /api/documents` (`direction=SERVER_TO_CLIENT`) then `POST /api/transfers` |
| Transfer history | `GET /api/transfers` |
| Documents list | `GET /api/documents` |
| Server monitor | `GET /api/server/status` |
| Activity | `GET /api/activity` |

---

## 6. Conventions

- Timestamps: ISO-8601 UTC with trailing `Z`.
- Sizes: bytes (integers). Formatting to "8.7 KB" is the frontend's job.
- Durations: milliseconds, float, 2 decimal places.
- Ids: integers, except `transfer_id` which is the `TR-` display string.
- Enum values (`status`, `direction`, `action`) are UPPER_SNAKE_CASE.
  Algorithm ids are lowercase.
- Lists are newest-first and support `limit`/`offset`.

---

## 7. CORS

The dev server enables CORS for `http://localhost:*` and `http://127.0.0.1:*`
with credentials allowed, so the frontend may run on its own port. If the
frontend is served as static files by Flask instead, CORS is irrelevant.

---

## 8. Ownership

Backend session owns: everything under `prototype-1/backend/`.
Frontend session owns: everything under `prototype-1/frontend/`.

Neither edits the other's tree. This document is the interface between them.

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-08-29 | Initial contract, Phase 1. |
