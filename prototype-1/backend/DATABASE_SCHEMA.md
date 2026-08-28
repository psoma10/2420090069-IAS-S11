# CyberVault Backend — Database Schema

PostgreSQL, hosted on Neon. The schema in `database/schema.sql` is applied
idempotently at application startup — every statement is `IF NOT EXISTS`, so a
restart never destroys data. All access goes through `repositories/` — no other
module issues SQL.

The connection string is read from the `DATABASE_URL` environment variable
(loaded from a gitignored `.env` in development). It is never committed.

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

The authoritative DDL is `database/schema.sql`. The blocks below mirror it with
the reasoning attached.

### users

```sql
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));
```

Uniqueness is enforced by a functional index on `lower(email)` rather than a
plain `UNIQUE` column, so `Ada@x.com` and `ada@x.com` are the same account
without depending on the `citext` extension being available on the Neon branch.

`password_hash` is a Werkzeug PBKDF2-SHA256 string and is never serialized to
any API response.

---

### documents

```sql
CREATE TABLE documents (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    filename    TEXT        NOT NULL,          -- original name, display only
    stored_name TEXT        NOT NULL,          -- server-generated, safe on disk
    file_size   INTEGER     NOT NULL,          -- bytes
    algorithm   TEXT,                          -- intended algorithm, nullable
    status      TEXT        NOT NULL DEFAULT 'UPLOADED',
    direction   TEXT        NOT NULL DEFAULT 'CLIENT_TO_SERVER',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT documents_status_valid
        CHECK (status IN ('UPLOADED', 'ENCRYPTED', 'TRANSFERRED')),
    CONSTRAINT documents_direction_valid
        CHECK (direction IN ('CLIENT_TO_SERVER', 'SERVER_TO_CLIENT')),
    CONSTRAINT documents_size_positive CHECK (file_size > 0)
);
CREATE INDEX idx_documents_user ON documents (user_id, created_at DESC);
```

`filename` and `stored_name` are separate on purpose: the user-supplied name is
never used as a path. `stored_name` is `{id}_{secure_filename(original)}`.

---

### transfers

```sql
CREATE TABLE transfers (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id    BIGINT      NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    user_id        BIGINT      NOT NULL REFERENCES users (id)     ON DELETE CASCADE,
    sender         TEXT        NOT NULL,
    receiver       TEXT        NOT NULL,
    direction      TEXT        NOT NULL,
    algorithm      TEXT        NOT NULL,
    encryption_key TEXT,                       -- demo mode, see note below
    ciphertext     TEXT,
    plaintext_size INTEGER,
    encrypted_size INTEGER,
    status         TEXT        NOT NULL DEFAULT 'PENDING',
    error_message  TEXT,
    stages         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    decrypted_at   TIMESTAMPTZ,
    "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT transfers_direction_valid
        CHECK (direction IN ('CLIENT_TO_SERVER', 'SERVER_TO_CLIENT')),
    CONSTRAINT transfers_status_valid
        CHECK (status IN ('PENDING', 'ENCRYPTING', 'TRANSMITTING', 'RECEIVED',
                          'DECRYPTING', 'COMPLETED', 'FAILED'))
);
CREATE INDEX idx_transfers_user     ON transfers (user_id, "timestamp" DESC);
CREATE INDEX idx_transfers_document ON transfers (document_id);
CREATE INDEX idx_transfers_status   ON transfers (status);
```

`user_id` is denormalized onto the transfer so ownership checks and history
listings never need a join.

`stages` is `JSONB`, holding the state-machine trace —
`[{"stage":"ENCRYPTING","status":"done","at":"…"}, …]` — so the transfer-monitor
screen shows real timings instead of animated fiction. `timestamp` is quoted
because it is a reserved word in PostgreSQL.

> **`encryption_key` is stored in plaintext.** This is the deliberate demo-mode
> choice recorded in `ARCHITECTURE.md` §4: the receiving side must be able to
> decrypt and display the recovered document, which the PRD requires. It is not
> a defensible production design. The column is never returned by any API
> response and never written to logs.

---

### encryption_logs

```sql
CREATE TABLE encryption_logs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id     BIGINT      REFERENCES documents (id) ON DELETE CASCADE,
    transfer_id     BIGINT      REFERENCES transfers (id) ON DELETE CASCADE,
    algorithm       TEXT        NOT NULL,
    key_size        INTEGER,                   -- bits; NULL for classical ciphers
    operation       TEXT        NOT NULL,
    encryption_time DOUBLE PRECISION,          -- milliseconds
    decryption_time DOUBLE PRECISION,          -- milliseconds
    input_size      INTEGER,
    output_size     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT encryption_logs_operation_valid
        CHECK (operation IN ('ENCRYPT', 'DECRYPT'))
);
CREATE INDEX idx_enc_logs_document ON encryption_logs (document_id);
CREATE INDEX idx_enc_logs_transfer ON encryption_logs (transfer_id);
```

Feeds the encryption-details panel (FR-12). `key_size` is meaningful only for
AES; the classical ciphers store `NULL` rather than inventing a number.

---

### activity_log

```sql
CREATE TABLE activity_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    action      TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    document_id BIGINT,
    transfer_id BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_user   ON activity_log (user_id, created_at DESC);
CREATE INDEX idx_activity_recent ON activity_log (created_at DESC);
```

Not in the PRD's table list, but FR-18 requires an activity feed and
`/api/activity` needs somewhere to read from. `action` values are enumerated in
`API_CONTRACT.md` §3.8.

---

## 3. Conventions

- Timestamps are `TIMESTAMPTZ`, stored in UTC. Repositories serialize them to
  ISO-8601 strings with a trailing `Z` at the API boundary, which is what
  `API_CONTRACT.md` §6 promises the frontend.
- Sizes are bytes (`INTEGER`); durations are milliseconds (`DOUBLE PRECISION`).
- Enums are enforced with named `CHECK` constraints, so a bad status is a
  database error rather than silent corruption, and the constraint name appears
  in the error.
- Foreign keys with `ON DELETE CASCADE` are enforced by PostgreSQL by default —
  no per-connection pragma is needed.
- Identity columns (`GENERATED ALWAYS AS IDENTITY`) are the modern replacement
  for `SERIAL`; the database refuses a client-supplied id outright.
- Schema application is idempotent: every statement is `IF NOT EXISTS`, so
  startup never destroys data. Tests use `truncate_all()`, which empties rows
  but keeps the schema, and requires an explicit acknowledgement flag.

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
