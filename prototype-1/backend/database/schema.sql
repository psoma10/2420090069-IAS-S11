-- CyberVault schema (PostgreSQL / Neon)
--
-- Applied idempotently at application startup by database/connection.py.
-- Every statement is CREATE ... IF NOT EXISTS so a restart is harmless.
--
-- See DATABASE_SCHEMA.md for the reasoning behind each table.

-- ---------------------------------------------------------------- users ---
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_name_not_blank CHECK (length(btrim(name)) > 0)
);

-- Case-insensitive uniqueness without depending on the citext extension:
-- Ada@x.com and ada@x.com are the same account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

-- ------------------------------------------------------------ documents ---
CREATE TABLE IF NOT EXISTS documents (
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

CREATE INDEX IF NOT EXISTS idx_documents_user
    ON documents (user_id, created_at DESC);

-- ------------------------------------------------------------ transfers ---
CREATE TABLE IF NOT EXISTS transfers (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id    BIGINT      NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    -- user_id is denormalized onto the transfer so ownership checks and
    -- history listings never need a join.
    user_id        BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    sender         TEXT        NOT NULL,
    receiver       TEXT        NOT NULL,
    direction      TEXT        NOT NULL,
    algorithm      TEXT        NOT NULL,
    -- Demo mode: the key is stored so the receiving side can decrypt and
    -- display the recovered document, which the PRD requires. This is not a
    -- defensible production design -- see ARCHITECTURE.md section 4. The
    -- column is never returned by any API response and never logged.
    encryption_key TEXT,
    ciphertext     TEXT,
    plaintext_size INTEGER,
    encrypted_size INTEGER,
    status         TEXT        NOT NULL DEFAULT 'PENDING',
    error_message  TEXT,
    -- State-machine trace, so the transfer monitor screen shows real
    -- timings instead of animated fiction.
    stages         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    decrypted_at   TIMESTAMPTZ,
    "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT transfers_direction_valid
        CHECK (direction IN ('CLIENT_TO_SERVER', 'SERVER_TO_CLIENT')),
    CONSTRAINT transfers_status_valid
        CHECK (status IN ('PENDING', 'ENCRYPTING', 'TRANSMITTING', 'RECEIVED',
                          'DECRYPTING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_transfers_user
    ON transfers (user_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_document
    ON transfers (document_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status
    ON transfers (status);

-- ------------------------------------------------------ encryption_logs ---
CREATE TABLE IF NOT EXISTS encryption_logs (
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

CREATE INDEX IF NOT EXISTS idx_enc_logs_document ON encryption_logs (document_id);
CREATE INDEX IF NOT EXISTS idx_enc_logs_transfer ON encryption_logs (transfer_id);

-- --------------------------------------------------------- activity_log ---
CREATE TABLE IF NOT EXISTS activity_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    action      TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    document_id BIGINT,
    transfer_id BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_user
    ON activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_recent
    ON activity_log (created_at DESC);

-- --------------------------------------------------------- document_shares ---
-- Opt-in public sharing. A document is private until its owner creates a share,
-- and the unguessable token is the only credential, so it is generated with
-- secrets.token_urlsafe(32) and never derived from the document id.
CREATE TABLE IF NOT EXISTS document_shares (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id BIGINT      NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    user_id     BIGINT      NOT NULL REFERENCES users (id)     ON DELETE CASCADE,
    token       TEXT        NOT NULL UNIQUE,
    label       TEXT,
    revoked     BOOLEAN     NOT NULL DEFAULT false,
    expires_at  TIMESTAMPTZ,
    view_count  INTEGER     NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_token ON document_shares (token);
CREATE INDEX IF NOT EXISTS idx_shares_document ON document_shares (document_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares (user_id, created_at DESC);

-- Document contents live in the database, not on disk.
--
-- The original design wrote uploads to storage/uploads and kept only a path
-- here. That works locally and fails on any host with an ephemeral filesystem:
-- a redeploy wipes the disk, the row survives, and every document 404s with
-- its bytes gone for good. At a 10 KB ceiling the content belongs in the row.
--
-- Nullable because rows created before this column existed have no content to
-- put in it, and their files are already unrecoverable.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content TEXT;
