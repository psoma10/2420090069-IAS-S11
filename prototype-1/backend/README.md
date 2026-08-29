# CyberVault — Backend

Secure client–server document exchange, built for the InSem-II cryptography
prototype. Flask, PostgreSQL (Neon) and PyCryptodome, exposed as a JSON API
that a separately-developed frontend consumes.

**Encrypt. Transfer. Verify.**

---

## What it does

A document is uploaded, encrypted with a chosen algorithm, transmitted to the
other side, decrypted there and compared against the original:

```text
CLIENT                                    SERVER
plaintext
   | encrypt
ciphertext ---------- transfer ------------> ciphertext
                                                | decrypt
                                             plaintext
```

Four algorithms are implemented. AES is the one used for real document
transfer; the other three are here because the coursework asks for them, and
each is implemented faithfully rather than approximated.

| Algorithm | Category | Round trip | Integrity |
|---|---|---|---|
| Caesar | Classical substitution | Exact | None |
| Playfair | Classical digraph | Lossy by construction | None |
| SDES | Educational block cipher | Exact | None |
| AES-EAX | Modern authenticated | Exact | Verified |

Playfair is the honest exception: the classical algorithm discards non-letters,
folds J into I and inserts padding, so the recovered text is not byte-identical
to the input. The API returns the normalized text that was actually encrypted
rather than pretending the round trip is exact.

---

## Running it

Requires Python 3.12 and a PostgreSQL connection string.

```bash
cd prototype-1/backend

python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

cp .env.example .env        # then fill in DATABASE_URL and SECRET_KEY
./.venv/bin/python app.py
```

The API is then on `http://127.0.0.1:5000`. The schema is applied
automatically at startup and is idempotent, so restarting never destroys data.

Check it is alive:

```bash
curl http://127.0.0.1:5000/api/health
```

### Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SECRET_KEY` | recommended | Signs the session cookie. Without it a random key is generated per start, so every restart logs users out. |
| `PORT` | no | Defaults to 5000 |

`.env` is gitignored and must never be committed.

---

## Tests

```bash
./.venv/bin/pytest tests/ -q          # everything
./.venv/bin/pytest tests/crypto/ -q   # the four ciphers
./.venv/bin/pytest tests/integration/ # the graded end-to-end scenarios
```

The integration tests run against the real database over real HTTP with no
mocks, including the two scenarios the prototype is assessed on: a 10 KB
document from client to server, and a 5 KB document back, each recovered and
compared byte for byte.

Each test creates its own user with a unique email, so the suite is safe to
re-run and safe to run while other work is happening on the same database.

---

## Layout

```text
app.py                 application factory, blueprints, error handlers
config.py              limits, paths, secrets from the environment

core/                  errors, response envelope, session auth, validation
crypto/                the four ciphers plus the algorithm registry
database/              connection pool and schema
repositories/          every SQL statement in the project
services/              business rules and orchestration
routes/                HTTP handlers, deliberately thin
tests/                 unit, document, and end-to-end suites
```

Requests flow strictly downward — `routes` → `services` → `repositories` →
`database`. A route never touches SQL, and never imports a cipher module
directly; it goes through `CryptoService`. The reasoning is in
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layering, crypto abstraction, key model, transfer state machine |
| [API_CONTRACT.md](API_CONTRACT.md) | Every endpoint, request and response shape, error code |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Tables, relationships, repository interfaces |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | What is defended, what is not, and why |

---

## Security posture, stated plainly

This is a teaching prototype, and two decisions would be wrong in production.
Both are deliberate, both are documented, and neither is hidden:

**The encryption key travels with the transfer and is stored.** The receiving
side has to decrypt and display the document — that is the demonstration the
coursework asks for — and the key has to come from somewhere. A real system
would negotiate a session key and never persist the symmetric one. What *is*
enforced: the key never appears in an API response, never reaches a log, and is
readable only by the owning user's session.

**A share link grants access to anyone holding it.** No login is required,
which is what makes it demonstrable. The token is therefore 256 bits of
`secrets` randomness, never derived from the document id, and revocation and
expiry are checked in SQL on every view.

What is genuinely defended: passwords are PBKDF2-SHA256 hashes, never returned
or logged; sessions are cleared before login to prevent fixation; every
document and transfer lookup is filtered by owner at the data layer, so a route
cannot forget the check; uploaded filenames never reach the filesystem and the
resolved path is verified to sit inside the upload directory; every query is
parameterized; and unexpected errors are logged server-side but reported
generically, so stack traces and internal paths never reach a client.

Full detail in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
