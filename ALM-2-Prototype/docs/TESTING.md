# Testing

## 1. Strategy

| Layer | Tool | Location | Scope | Needs running server |
|---|---|---|---|---|
| Unit / component (backend) | pytest | `backend/tests/` | Firewall matching, IDS rules, anomaly math, DB access, routers via FastAPI `TestClient` | No |
| Contract (black box) | pytest + httpx | `qa/contract_tests/` | Every endpoint in `docs/API_CONTRACT.md`: shapes, enums, status codes, validation | Yes (port 48731) |
| Smoke | stdlib script | `qa/smoke_test.py` | One end-to-end path: seed, send traffic, alerts, anomaly, validation | Yes |
| UI end-to-end | Playwright | `qa/e2e/` (see `qa/README.md`) | Page loads, key flows, screenshots | Yes (both servers) |
| Manual | checklist below | n/a | Visual, SSE behaviour, demo path | Yes |

Principles:

- **Deterministic time.** Engine code takes an injectable clock (`app/clock.py`, `ManualClock.advance(seconds)`), so sliding windows, cooldowns and bucket boundaries are tested without sleeping.
- **Contract first.** Tests assert the contract, not the implementation; a failing contract test means either the code or the contract is wrong, and the contract is updated first.
- **Isolation.** Backend tests use a temporary SQLite database. Contract tests call `POST /api/simulation/reset` before each test (destructive to simulation state; rules are kept).
- **Pure logic is tested directly** (rule matching, CIDR and port-range parsing, z-score, Welford), integration paths through `TestClient`.

## 2. What must be covered

| Area | Cases |
|---|---|
| Firewall | First match by ascending priority; disabled rule skipped; CIDR containment edge (network and broadcast addresses); port range inclusive bounds; protocol `ANY`; default policy both ways; bastion mode precedence; invalid IP/CIDR/port -> 422; `hit_count` increments; dry-run has no side effects |
| IDS rules | Each of IDS-001..009 fires at exactly the threshold and not at threshold minus one; window expiry; cooldown suppresses a second alert, then re-arms; disabled rule silent; updated threshold/window take effect; per-source isolation |
| Anomaly | z-score against known series (see worked example in SECURITY_CONCEPTS.md: mean 20, std 1.897, x=60 gives z of about 21.1); current bucket excluded from baseline; fewer than `min_samples` buckets gives no anomaly; flat series with std floor; Welford equals batch mean/variance; sigma and bucket config bounds validated |
| Traffic | Per-type defaults (ports/protocol); `count` bounds 1..500; scenarios return the contract shape; summary totals add up |
| Alerts | Newest first; filters; ack; clear; SSE emits an event for a new alert; fallback list endpoint |
| Stats | `packets_total == allowed + blocked`; throughput length at most 60 |

## 3. Running the tests

### Backend unit and integration tests
```bash
cd backend
python -m venv .venv                      # once
# Windows: .venv\Scripts\Activate.ps1     Unix: source .venv/bin/activate
pip install -r requirements.txt           # includes pytest and httpx
python -m pytest -q                       # all tests
python -m pytest tests/test_firewall.py -q          # one file
python -m pytest -k "brute or cooldown" -q          # by keyword
python -m pytest -x --lf                  # stop at first failure, rerun last failed
```

### Contract tests (against a running backend)
Windows, handles venv and backend lifecycle for you:
```powershell
powershell -File qa\run_contract_tests.ps1
powershell -File qa\run_contract_tests.ps1 -BaseUrl http://localhost:48731 -PytestArgs "-k","firewall"
```
Manual / Unix:
```bash
python -m venv qa/.venv
qa/.venv/bin/pip install -r qa/requirements.txt       # Windows: qa\.venv\Scripts\pip
cd qa && BASE_URL=http://localhost:48731 .venv/bin/python -m pytest contract_tests
```

### Smoke test
```bash
python qa/smoke_test.py                    # or: python qa/smoke_test.py http://localhost:48731
```
Prints PASS/FAIL per check and exits non-zero on any failure. It resets the simulation first.

### End-to-end tests (Playwright)
```bash
cd qa/e2e && npm install && npx playwright install chromium   # first time
npm test                                                      # or: npm run test:e2e from the repo root
```
Specs live in `qa/e2e/tests` (`smoke.spec.js` plus palette, investigate, settings/theme and alert-action specs). The config starts the servers if they are not running (`reuseExistingServer`). Override targets with env vars: `BASE_URL` (frontend, default `http://127.0.0.1:48732`), `SENTINEL_FE_PORT`, `SENTINEL_API_PORT` / `API_URL` (backend, default 48731).

### Frontend build check
```bash
cd frontend && npm run build               # fails on import or syntax errors
```

## 4. Manual QA checklist

Start with a fresh reset (`POST /api/simulation/reset`). Tick each item.

**Startup**
- [ ] `start-all` script creates the venv, installs dependencies, serves UI on 48732 and API on 48731
- [ ] `http://localhost:48731/api/health` returns `status: ok`; `/docs` loads
- [ ] First start seeds 8 hosts, rules, 9 IDS rules

**Firewall**
- [ ] Rules sorted by priority; add a rule with CIDR and port range; saved and shown
- [ ] Invalid IP or port shows an error and does not save
- [ ] Toggle and delete work; hit counts rise after traffic
- [ ] Tester: 203.0.113.50 to 10.0.1.10 TCP 80 allowed; TCP 23 denied
- [ ] Changing default policy changes the verdict of unmatched traffic

**Hosts / bastion**
- [ ] Add, edit and delete host; only one bastion at a time; removing bastion works
- [ ] Bastion mode on: external to non-bastion denied with "Bastion policy"; external to bastion follows rules

**Traffic and IDS**
- [ ] Each of the 9 traffic types sends and shows per-packet verdicts; count 500 accepted, 501 rejected
- [ ] `brute_force` raises IDS-001; `port_scan` IDS-003 (and IDS-006); `ddos` IDS-004 and an anomaly alert (after baseline); `exfiltration` IDS-005; `telnet_probe` IDS-002; `bastion_bypass` IDS-008
- [ ] `normal` raises no high-severity alerts
- [ ] Repeating an attack inside the window does not duplicate the alert

**Alerts**
- [ ] New alert appears without refresh; sidebar badge updates
- [ ] Severity/source/acknowledged filters; acknowledge; clear all
- [ ] Stop backend: UI shows a degraded state and recovers when backend returns; with SSE blocked, polling still updates

**Anomaly**
- [ ] "Generate baseline" fills charts; threshold line equals mean + sigma * std
- [ ] Changing sigma moves the line; spike beyond it is highlighted
- [ ] Per-source table shows z-scores

**General UI**
- [ ] All sidebar routes load; unknown route shows Not Found
- [ ] No console errors during the demo script in USER_GUIDE.md
- [ ] Layout acceptable at 1280 px and at narrow (mobile) width; keyboard navigation reaches controls
- [ ] Production build (`npm run build`) succeeds

## 5. Reporting defects

Record: page or endpoint, steps, expected versus actual, response body or console error, and whether the contract or the implementation is at fault.
