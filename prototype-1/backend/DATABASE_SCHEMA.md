# CyberVault Backend — Database Schema

SQLite. One file, `cybervault.db`, created at startup from
`database/schema.sql`. All access goes through `repositories/` — no other
module issues SQL.

---

## 1. Relationships

```text
users
  | 1
  |
  | N
documents
  | 1
  +----------------+
  |                |
  | N              | N
transfers    encryption_logs

users
  | 1
  | N
activity_log
```

- A document belongs to exactly one user.
- A document may have many transfers (it can be re-sent) and many encryption
  log entries (one per encrypt or decrypt operation).
- Deleting a user cascades to their documents, transfers, logs and activity.

---

## 2. Tables

### users

```sql
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_users_email ON users(email);
```

`email` is `COLLATE NOCASE` so `Ada@x.com` and `ada@x.com` are the same account.
`password_hash` is a Werkzeug PBKDF2-SHA256 string and is never serialized to
any API response.

---

### documents

```sql
CREATE TABLE documents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename       TEXT    NOT NULL,          -- original name, display only
    stored_name    TEXT    NOT NULL,          -- server-generated, safe on disk
    file_size      INTEGER NOT NULL,          -- bytes
    algorithm      TEXT,                      -- intended algorithm, nullable
    status         TEXT    NOT NULL DEFAULT 'UPLOADED',
    direction      TEXT    NOT NULL DEFAULT 'CLIENT_TO_SERVER',
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    CHECK (status    IN ('UPLOADED','ENCRYPTED','TRANSFERRED')),
    CHECK (direction IN ('CLIENT_TO_SERVER','SERVER_TO_CLIENT')),
    CHECK (file_size > 0)
);
CREATE INDEX idx_documents_user ON documents(user_id, created_at DESC);
```

`filename` and `stored_name` are separate on purpose: the user-supplied name is
never used as a path. `stored_name` is `{id}_{secure_filename(original)}`.

---

### transfers

```sql
CREATE TABLE transfers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    sender          TEXT    NOT NULL,
    receiver        TEXT    NOT NULL,
    direction       TEXT    NOT NULL,
    algorithm       TEXT    NOT NULL,
    encryption_key  TEXT,                     -- demo mode, see note below
    ciphertext      TEXT,
    plaintext_size  INTEGER,
    encrypted_size  INTEGER,
    status          TEXT    NOT NULL DEFAULT 'PENDING',
    error_message   TEXT,
    stages          TEXT,                     -- JSON array of stage records
    decrypted_at    TEXT,
    timestamp       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    CHECK (direction IN ('CLIENT_TO_SERVER','SERVER_TO_CLIENT')),
    CHECK (status IN ('PENDING','ENCRYPTING','TRANSMITTING','RECEIVED',
                      'DECRYPTING','COMPLETED','FAILED'))
);
CREATE INDEX idx_transfers_user     ON transfers(user_id, timestamp DESC);
CREATE INDEX idx_transfers_document ON transfers(document_id);
```

`user_id` is denormalized onto the transfer so ownership checks and history
listings never need a join.

`stages` stores the state-machine trace as JSON —
`[{"stage":"ENCRYPTING","status":"done","at":"…"}, …]` — giving the frontend's
transfer-monitor screen real timings instead of animated fiction.

> **`encryption_key` is stored in plaintext.** This is the deliberate demo-mode
> choice recorded in `ARCHITECTURE.md` §4: the receiving side must be able to
> decrypt and display the recovered document, which the PRD requires. It is not
> a defensible production design. The column is never returned by any API
> response and never written to logs.

---

### encryption_logs

```sql
CREATE TABLE encryption_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    transfer_id     INTEGER REFERENCES transfers(id) ON DELETE CASCADE,
    algorithm       TEXT    NOT NULL,
    key_size        INTEGER,                  -- bits; NULL for classical ciphers
    operation       TEXT    NOT NULL,
    encryption_time REAL,                     -- ms
    decryption_time REAL,                     -- ms
    input_size      INTEGER,
    output_size     INTEGER,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    CHECK (operation IN ('ENCRYPT','DECRYPT'))
);
CREATE INDEX idx_enc_logs_document ON encryption_logs(document_id);
```

Feeds the encryption-details panel (FR-12). `key_size` is meaningful only for
AES; the classical ciphers store `NULL` rather than inventing a number.

---

### activity_log

```sql
CREATE TABLE activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    document_id INTEGER,
    transfer_id INTEGER,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
```

Not in the PRD's table list, but FR-18 requires an activity feed and
`/api/activity` needs somewhere to read from. `action` values are enumerated in
`API_CONTRACT.md` §3.8.

---

## 3. Conventions

- Timestamps are ISO-8601 UTC strings (`2026-08-29T10:14:31Z`), not Unix
  integers — SQLite has no native datetime, and readable rows matter for the
  documentation screenshots.
- Sizes are bytes; durations are milliseconds as `REAL`.
- Enums are enforced with `CHECK` constraints, so a bad status is a database
  error rather than silent corruption.
- `PRAGMA foreign_keys = ON` is issued on every connection — SQLite defaults it
  off, and without it the `ON DELETE CASCADE` rules above do nothing.

---

## 4. Repository interfaces

Other modules call these, never SQL.

```python
UserRepository:      create(name, email, password_hash) -> dict
                     find_by_email(email) -> dict | None
                     find_by_id(user_id) -> dict | None

DocumentRepository:  create(...) -> dict
                     find_by_id(doc_id, user_id) -> dict | None
                     list_for_user(user_id, **filters) -> (rows, total)
                     update_status(doc_id, status) -> None

TransferRepository:  create(...) -> dict
                     find_by_id(transfer_id, user_id) -> dict | None
                     list_for_user(user_id, **filters) -> (rows, total)
                     update_status(transfer_id, status, **fields) -> None
                     append_stage(transfer_id, stage, status) -> None
                     global_counts() -> dict          # server monitor

EncryptionLogRepository: create(...) -> dict
                         list_for_document(doc_id) -> list

ActivityRepository:  record(user_id, action, message, **refs) -> dict
                     list_for_user(user_id, limit, offset) -> (rows, total)
```

Every `find_by_id` takes `user_id` and filters on it, so ownership is enforced
at the data layer and cannot be forgotten by a route.
