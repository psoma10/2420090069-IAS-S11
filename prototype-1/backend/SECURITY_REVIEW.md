# CyberVault Backend — Security Review

Reviewed against the running application, not only the source. Every claim
below that says "verified" corresponds to a test in
`tests/integration/test_security.py`, so it stays true rather than being true
once.

**Scope:** the backend API. The frontend is a separate application and is not
covered here.

**Posture:** this is a teaching prototype. Two of its design decisions would be
wrong in production. Both are deliberate, both are stated plainly rather than
buried, and neither is presented as secure.

---

## 1. Findings

### 1.1 Fixed during review

| Severity | Finding | Resolution |
|---|---|---|
| **High** | The development server started with Flask's interactive debugger enabled. Any unhandled exception would render source, local variables and a live Python console instead of the JSON error envelope — remote code execution for anyone who could reach it, and a direct contradiction of what `ARCHITECTURE.md` §7 claimed. | `app.py` now pins `use_debugger=False` regardless of the debug flag, keeps only the auto-reloader for development, and refuses to start in development mode on a non-loopback address. Verified: a route that raises returns `{"success": false, "error": {"code": "INTERNAL_ERROR"}}` with the traceback going only to the server log. |
| **High** | The password minimum-length check was dead code — `if False:` guarded it, so a one-character password would have been accepted. | The condition was restored to `len(value) < MIN_PASSWORD_LENGTH`. Verified by `test_a_password_below_the_minimum_is_rejected`, which exists specifically so the check cannot silently die again. |
| **Medium** | `CryptoService` applied the plaintext size ceiling to ciphertext as well. Since every algorithm expands its input, the largest legal upload could be encrypted but never decrypted — the headline demonstration would have failed at 10 KB. | Ciphertext has its own ceiling sized for the worst case (SDES expands roughly ninefold). |

### 1.2 Accepted, documented, and contained

These are not defects to fix; they are the prototype's stated design. What
matters is whether their containment holds, and that was tested directly.

**The encryption key is stored with the transfer.** The receiving side must
decrypt and display the document — that is the demonstration the coursework
requires — so the key is persisted on the `transfers` row.

A real system would negotiate a session key (RSA or ECDH), transmit it out of
band, and never persist the symmetric key. This one does not.

Containment, all verified:

- The key never appears in any API response. `test_the_encryption_key_never_appears_in_any_response` asserts this across seven endpoints including the transfer detail, listing, decrypt, dashboard and activity routes.
- The column is excluded from the repository's field list, so it cannot reach a response by accident; reading it requires calling `TransferRepository.stored_key`, whose name says what it does.
- That accessor is itself owner-scoped, so one user cannot read another's key.
- No log statement in the codebase writes a key.

**Share links grant access to anyone holding them.** No authentication is
required — that is what makes the feature demonstrable in an evaluation.

Containment, all verified:

- The token is `secrets.token_urlsafe(32)`: 256 bits, from a cryptographic source, never derived from the document id and never sequential.
- Revocation and expiry are enforced *in SQL*, inside `find_by_token`, so a caller cannot forget to check them and there is no cached window in which a withdrawn link still works.
- A revoked link, an expired link and a token that never existed return byte-identical responses, so nobody can probe for links that used to work.
- The public payload carries the filename, size, content, owner display name and share metadata — and nothing else. No account details, no ciphertext, no keys, no route to the owner's other documents.

---

## 2. What was tested and held

### Authorization

The highest-value target, and the one most thoroughly probed.

- Every protected route rejects an anonymous caller with `401`. Seventeen routes are asserted individually, so adding a route without a decorator fails the suite.
- A second user attempting to read, download, decrypt, share or revoke another user's document or transfer receives `404` on all seven attack paths. The victim's data is confirmed intact afterwards.
- `404` is returned rather than `403` deliberately: a `403` would confirm that the id exists, which is itself a disclosure.
- Ownership is enforced at the **repository** layer — every lookup takes `user_id` and filters on it — so a route physically cannot forget the check.
- Listings never include another user's rows.

### Injection

- Every query in `repositories/` uses parameter placeholders. The only interpolated identifiers are column names drawn from module-level allow-lists, never from request data.
- SQL payloads in `direction`, `status`, `limit` and `offset` are inert: unrecognised filter values are ignored rather than interpolated, row counts are unchanged, and the tables still exist afterwards.
- Hostile path segments (`1 OR 1=1`, `1; DROP TABLE users`, oversized integers, null bytes) produce a clean `400`/`404`/`405` with no database error, no stack trace and no SQL text in the message.

### Authentication

- Passwords are hashed with PBKDF2-SHA256 via Werkzeug. No response contains `password_hash`, and no log line contains a password.
- `session.clear()` runs before a new user id is set, so a session fixed before login does not survive it.
- Login failures are indistinguishable: unknown email and wrong password return the same status and the same message, and the unknown-email path still performs a hash comparison so response timing does not leak account existence.
- The session cookie is signed; a tampered cookie is rejected.
- Logging out ends the session immediately.
- `current_user()` re-reads the user on every request, so a deleted account stops working at once rather than living on inside a valid cookie.

### File handling

- Client-supplied filenames never reach the filesystem. The stored name is generated server-side, and the resolved path is then checked to sit inside the upload directory — two independent layers, so a bypass of the first still fails closed.
- Traversal attempts (`../../../etc/passwd`, Windows separators, absolute paths, doubled-up sequences) are either rejected or stored safely inside the upload directory.
- Size limits are enforced per direction (10 KB client to server, 5 KB server to client), and both boundaries are tested at the exact byte.
- Non-`.txt` extensions, empty files and byte sequences that fail UTF-8 decoding are all rejected with distinct error codes.

### Cryptography

- AES uses EAX, an authenticated mode, with a fresh random nonce per encryption. Two encryptions of the same plaintext under the same key produce different ciphertexts.
- A failed authentication tag check raises rather than returning plaintext. Tampering was tested at every byte offset of both the tag region and the ciphertext body.
- Wrong key, corrupted ciphertext and corrupted tag all produce an identical `DECRYPTION_FAILED` response. This is deliberate: distinguishing them would hand an attacker an oracle.
- Keys are generated with `Crypto.Random.get_random_bytes`, not `random`.
- The cipher modules were mutation-tested during development: deliberately introduced bugs (dropping the integrity check, reusing the nonce, swapping s-box addressing) each caused test failures, confirming the tests detect real breakage rather than passing incidentally.

### Error handling

- Unhandled exceptions log a traceback server-side and return a generic `INTERNAL_ERROR`. Verified directly: the exception message, the internal file path and the traceback are all absent from the response body.
- Flask's own `404`, `405` and oversized-upload responses are converted to the same JSON envelope, so a client never has to parse an HTML error page.
- Malformed JSON, wrong content types, JSON arrays where objects are expected, and form-encoded bodies were probed against multiple routes: none leaked a traceback, a library name, a filesystem path or SQL text.
- Form-encoded bodies are refused on state-changing routes, which is the CSRF defence in the absence of a token: a cross-origin HTML form cannot drive this API.

---

## 3. Known limitations

Honest about what this prototype does not do, rather than implying otherwise.

| Limitation | Consequence | Why it is acceptable here |
|---|---|---|
| No key exchange | The symmetric key is stored server-side | The demonstration requires the receiver to decrypt; documented in `ARCHITECTURE.md` §4 |
| No rate limiting | Login and share-link endpoints can be hammered | Single-user local prototype; a real deployment needs throttling on `/api/auth/login` and `/api/share/{token}` |
| `SESSION_COOKIE_SECURE = False` | Cookies would travel over plain HTTP | Development serves over HTTP; must be `True` behind TLS |
| Documents stored unencrypted at rest | Filesystem access reveals plaintext | Encryption here demonstrates transfer confidentiality, not storage-at-rest |
| No audit trail for share views beyond a counter | Cannot identify who opened a link | Anonymous access is the point of the feature |
| No account lockout | Password guessing is unthrottled | Out of scope for the prototype; pairs with the rate-limiting gap |

---

## 4. Recommendations before any real deployment

1. Set `SECRET_KEY` from a secret manager and `SESSION_COOKIE_SECURE = True` behind TLS.
2. Rate-limit `/api/auth/login`, `/api/auth/register` and `/api/share/{token}`.
3. Replace the stored-key model with proper key exchange, and stop persisting symmetric keys.
4. Encrypt documents at rest, or store only ciphertext.
5. Add account lockout or progressive delays after repeated login failures.
6. Serve behind a production WSGI server rather than Werkzeug's development server.

None of these are required for the prototype's stated scope. All of them would
be required before anything real was entrusted to it.

---

## 5. Reproducing this review

```bash
cd prototype-1/backend
./.venv/bin/pytest tests/integration/test_security.py -v
```

The full suite, including the end-to-end transfer scenarios:

```bash
./.venv/bin/pytest tests/ -q
```
