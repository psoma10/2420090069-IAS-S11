# Development Guide

## 1. Setup

Prerequisites: Python 3.10+, Node.js 18+ with npm. Git is optional.

### Windows (PowerShell)
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --port 48731 --reload
```
```powershell
cd frontend
npm install
npm run dev
```
If activation is blocked: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### Linux / macOS
```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && uvicorn app.main:app --port 48731 --reload
# second terminal
cd frontend && npm install && npm run dev
```

Or run `start-all.ps1` / `start-all.sh` from the repository root. Interactive API docs: <http://localhost:48731/docs>.

Ports: backend 48731, frontend 48732. The Vite dev server proxies `/api` to `http://localhost:48731`; the backend also allows CORS from `http://localhost:48732`.

### Root scripts and Docker

From the repository root: `npm run dev` (runs the OS-appropriate start-all script), `npm run test:backend`, `npm run test:e2e`, `npm run build`. The root `package.json` has no dependencies.

`docker compose up --build` runs the stack in containers (`backend/Dockerfile`, `frontend/Dockerfile` + `frontend/nginx.conf`). The DB path comes from `SENTINEL_DB` (volume `sentinel-data`). Host ports: `SENTINEL_API_PORT` / `SENTINEL_FE_PORT`. Launchers fall back to the next free port when the defaults are busy.

## 2. Repository conventions

- **The contract is the source of truth.** `docs/API_CONTRACT.md` defines endpoints, models and enums. Change the contract first, then backend, then frontend, then tests and docs, in one change set.
- **Backend**
  - Routers are thin: validate, delegate, serialize. Detection and policy logic lives in `firewall.py`, `ids_rules.py`, `anomaly.py`, `simulator.py` as plain functions/classes testable without HTTP.
  - Never read the system time directly in engines; use the injected clock (`app/clock.py`).
  - Pydantic v2 models in `models.py` mirror the contract. Errors are `{"detail": "msg"}` with 4xx; validation failures are 422.
  - Timestamps leave the API as ISO-8601 UTC with milliseconds and `Z`.
  - Raw SQL via stdlib `sqlite3`; use parameterised queries only (never string-format values).
  - Type hints on public functions; docstring states the rule being implemented.
- **Frontend**
  - Network calls go through `src/api/client.js` only. Do not call `fetch` from components.
  - One file per route in `src/pages/`; shared widgets in `src/components/ui/` (exported from `index.js`); colours and spacing from `src/styles/tokens.css`, never hard-coded.
  - Handle loading, empty and error states on every data-bound view.
  - Realtime: use `EventSource` and fall back to polling on error; de-duplicate by id.
- **Commits / PRs**: small, one concern each, imperative subject line (for example `Add IDS-010 DNS tunnelling rule`). Include tests and doc updates with the change.
- **Do not commit**: `node_modules`, `.venv`, `dist`, `*.db`, `__pycache__`, `.tmp-build-*` (see `.gitignore`).

### Contributing
1. Open an issue or note describing the change and which contract sections it touches.
2. Branch, implement, add tests (`docs/TESTING.md`).
3. Run `python -m pytest -q` in `backend/`, `qa/smoke_test.py` against a running backend, and `npm run build` in `frontend/`.
4. Update README or docs when behaviour, endpoints or setup change.
5. Submit with a description of what changed and how it was verified.

## 3. Recipes

### 3.1 Add a field to firewall rules (example: `log: bool`)
1. **Contract**: add `log` to the `FirewallRule` model and to the POST/PUT bodies in `docs/API_CONTRACT.md`, with default.
2. **DB** (`db.py`): add the column to `CREATE TABLE firewall_rules` and a safe migration for existing databases (`ALTER TABLE ... ADD COLUMN log INTEGER NOT NULL DEFAULT 0`, guarded by a check of `PRAGMA table_info`); update seed data if relevant.
3. **Model** (`models.py`): add the field with a default and validation to the create/update and response models.
4. **Logic** (`firewall.py`): use the field where it takes effect; keep matching pure.
5. **Router**: ensure insert, update and row-to-model mapping carry the field.
6. **Frontend**: add the input in the rule form (`FirewallManager.jsx`) and a column in the table; send it from `client.js` calls.
7. **Tests**: model validation, persistence round-trip, behaviour; update contract tests.
8. **Docs**: README/USER_GUIDE field list.

### 3.2 Add an IDS rule (example: IDS-010)
1. **Contract**: add the rule id, description, default threshold, window, severity to the built-in list.
2. **Seed** (`db.py` / seed function): insert the row into `ids_rules` so it appears on first start and after reseed.
3. **Detector** (`ids_rules.py`): implement the check against the sliding window store, keyed like the others (usually source IP). Return an `Alert` with `source="rule"`, `rule_id="IDS-010"`, severity from the stored rule (so edits apply), and respect `enabled`, `threshold`, `window_seconds` and the per-(rule, source) cooldown equal to the window.
4. **Scenario** (optional, `simulator.py`): add or extend a scenario that triggers it, and register it in `GET /api/traffic/scenarios`.
5. **Frontend**: the Detection Rules page renders from `GET /api/ids/rules`, so usually nothing is needed; add alert wording to `components/alerts/alertInfo.js` and an Encyclopedia entry if appropriate.
6. **Tests**: fires at threshold, not at threshold minus one; window expiry; cooldown; disabled; use `ManualClock`.
7. **Docs**: rule table in USER_GUIDE.md and SECURITY_CONCEPTS.md.

### 3.3 Add a frontend page
1. Create `frontend/src/pages/MyPage.jsx` exporting a default component; use shared `ui` components and token styles.
2. Add API functions to `src/api/client.js` (do not rewrite existing ones).
3. Register the route in `src/App.jsx` (`<Route path="my-page" element={<MyPage />} />`).
4. Add a nav entry in `components/layout/Shell.jsx` (label, icon, optional key).
5. If it needs new endpoints, follow the contract-first flow (section 2).
6. Add it to the contract's frontend routes list, USER_GUIDE.md and the manual checklist in TESTING.md.

### 3.4 Add a backend endpoint
Contract entry, Pydantic request/response models, router function in the matching `routers/` module (register in `main.py` if new), logic in a domain module, contract test, client function.

## 4. Debugging tips
- Inspect the database: `sqlite3 <file>.db ".tables"`; delete the file to reseed.
- Watch the SSE stream: `curl -N http://localhost:48731/api/alerts/stream`.
- Reproduce time-dependent bugs with `ManualClock` rather than `sleep`.
- Use <http://localhost:48731/docs> to call endpoints interactively.
