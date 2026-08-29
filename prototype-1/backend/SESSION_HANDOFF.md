# CyberVault Backend — Session Handoff

**Status:** backend complete and running. 707 tests pass against live
PostgreSQL. The frontend is being built in a separate session against
[API_CONTRACT.md](API_CONTRACT.md).

---

## Completed

**Documentation and contracts**
- `ARCHITECTURE.md` — layering, crypto abstraction, key model, transfer state machine
- `API_CONTRACT.md` — every endpoint, request/response shape and error code
- `DATABASE_SCHEMA.md` — tables, relationships, repository interfaces
- `SECURITY_REVIEW.md` — what is defended, what was fixed, what is not defended
- `README.md` — setup, demonstration flow, security posture

**Database** — PostgreSQL on Neon. Six tables (`users`, `documents`,
`transfers`, `encryption_logs`, `activity_log`, `document_shares`). Schema
applies idempotently at startup. Connection string read from `DATABASE_URL` in
a gitignored `.env`.

**Cryptography** — Caesar, Playfair, SDES and AES-EAX, each behind a single
`CryptoService`. 571 unit tests, including textbook known-answer vectors and
mutation testing to confirm the tests detect real breakage.

**API** — 30 routes: auth, documents, algorithms, encryption preview,
transfers, share links, dashboard, server status, activity, health.

**Verified end to end** — both graded scenarios (10 KB client to server, 5 KB
server to client) recover byte-for-byte over real HTTP; wrong key, tampered
ciphertext, oversized upload and cross-user access all behave correctly.

---

## Running it

```bash
cd prototype-1/backend
./.venv/bin/python app.py      # http://127.0.0.1:5000
./.venv/bin/pytest tests/ -q   # 707 tests, ~2.5 min against remote Postgres
```

A scripted walkthrough of all 17 demonstration steps is useful before an
evaluation — it exercises register, upload, encrypt, transfer, decrypt, all
four algorithms, both error paths, share and revoke, then prints the dashboard
and activity log.

---

## Remaining

**Frontend integration.** The frontend session has the contract and was told
the server is live. Nothing is blocked on the backend, but the two have not yet
been run together. When they are, expect small mismatches in field naming
rather than structural problems.

**Nothing else is outstanding.** No half-finished modules, no skipped tests, no
TODOs left in the code.

---

## Things worth knowing

**A wrong-key attempt returns a transfer to `RECEIVED`, not `FAILED`.** This is
deliberate — the ciphertext is intact and a correct key would still work, so
the operator can retry, which is exactly the wrong-key demonstration the PRD
asks for. It does mean that after demonstrating the wrong-key error, that
transfer shows `RECEIVED` in the history rather than `COMPLETED`. Decrypt it
again with the right key if you want a clean history for screenshots.

**Playfair does not round-trip exactly, and this is correct.** The classical
algorithm discards non-letters, folds J into I and inserts fillers. The API
returns the normalized text that was actually encrypted alongside the original,
so the interface can show both. Do not "fix" this — it would stop being
Playfair.

**The SDES single-block vector is `01110101`, not `10111010`.** An earlier
instruction to the implementing agent carried a transcription error. The
implementation was verified correct against the published tables: K1 and K2
match the reference values, `IP_INV` genuinely inverts `IP`, and searching the
whole 256-value block space shows `10111010` is the image of a different input.
Worth checking against the course handout before the evaluation, since the
wrong value may have come from there.

**Two security compromises are deliberate**, documented in `ARCHITECTURE.md` §4
and `SECURITY_REVIEW.md` §1.2: the encryption key is stored with the transfer
so the receiver can decrypt, and share links grant access to anyone holding the
token. Both have tested containment. Neither should be described as secure.

**The demo needs `SECRET_KEY` set** in `.env`. Without it a random key is
generated per start and every restart logs users out mid-demonstration.

---

## Commits

| Commit | Contents |
|---|---|
| Set the backend contracts before any code | Architecture, API contract, database schema |
| Add the Caesar cipher with full character preservation | Caesar plus 351 tests |
| Add the Playfair cipher with an honest lossy round trip | Playfair plus 69 tests |
| Add AES document encryption with tamper detection | AES-EAX plus 90 tests |
| Add SDES with the full key schedule and s-box rounds | SDES plus 61 tests |
| Move the data layer onto Neon Postgres | Schema, connection pool, five repositories |
| Put every cipher behind one encryption service | Algorithm registry and `CryptoService` |
| Add account registration and sign-in | Auth service, routes, session handling |
| Accept document uploads and keep them inside the vault | Upload validation and path safety |
| Carry documents through the secure transfer flow | Transfer state machine and routes |
| Let people share a document by link | Share tokens, revocation, expiry, public route |
| Wire the backend into a running application | App factory, error handlers, end-to-end tests |
| Stop the development server exposing tracebacks | Debugger disabled, README, contract update |
| Prove the security claims with tests | 19 security tests and the review document |
