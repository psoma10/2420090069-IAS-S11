# Sentinel

Sentinel is an educational Intrusion Detection System (IDS) and firewall simulator. It lets you define firewall rules, designate a bastion host, generate simulated attack and benign traffic, and watch the traffic pass through a packet pipeline of firewall evaluation, signature (rule-based) detection and statistical (z-score) anomaly detection. Alerts stream to the UI in real time.

It demonstrates the network-security syllabus topics (IDS, intruders, anomaly vs. rule-based detection, firewalls, bastion hosts, viruses and worms) with a working system rather than slides. All traffic is simulated in-process; Sentinel never touches a real network interface.

## Features

- **Firewall rule manager**: ordered rules (priority, first match wins), protocol / CIDR / port-range matching, enable/disable, hit counters, default policy, and a dry-run tester.
- **Bastion host mode**: designate one host as the bastion; inbound external traffic to any other internal host is denied before rules are evaluated.
- **Traffic generator**: nine traffic types (HTTP, HTTPS, SSH login, Telnet, port scan, ping, DNS, data transfer, SYN flood) and seven one-click scenarios.
- **Rule-based IDS**: nine built-in signatures (IDS-001 to IDS-009) with tunable thresholds, windows and severities, and a per-(rule, source) alert cooldown.
- **Statistical anomaly detection**: five bucketed metrics scored by z-score against a trailing baseline, a per-source Welford running profile, configurable sigma.
- **Live alert panel**: Server-Sent Events stream with automatic polling fallback; filter, acknowledge, clear.
- **Overview dashboard**: throughput, protocol and type mix, top sources, severity breakdown.
- **Unified event stream**: one SSE connection (`/api/events`) carries typed `summary`, `alert` and `change` events; the UI refreshes from it instead of polling.
- **Investigate page**: per-IP view (`/investigate/{ip}`) with stat tiles, backed by `GET /api/investigate/{ip}`.
- **Alert actions**: Investigate and Block buttons on every alert row.
- **Command palette**: Ctrl/Cmd+K for navigation and quick actions; typing an IPv4 offers Investigate.
- **Light/dark theme toggle** (remembered across reloads) and a **Settings page** for data retention (`/api/settings`).
- **Traffic rate limiting** on the traffic endpoints, **pagination** (`offset` + `X-Total-Count`) on list endpoints, and **route code-splitting** in the frontend.
- **Threat encyclopedia and guided labs**: reference articles and exercises tied to the simulator.

## Screenshots

Placeholders; add images under `docs/img/` and reference them here.

| Page | Image |
|---|---|
| Overview | `docs/img/overview.png` |
| Firewall Rule Manager | `docs/img/firewall.png` |
| Hosts and Bastion topology | `docs/img/hosts.png` |
| Traffic Generator | `docs/img/traffic.png` |
| Alert Panel | `docs/img/alerts.png` |
| Anomaly Detector | `docs/img/anomaly.png` |

## Quick start

Prerequisites: Python 3.10+, Node.js 18+, npm.

One command (creates the backend venv, installs dependencies, starts both servers, opens the browser):

```powershell
# Windows
.\start-all.ps1
```
```bash
# Linux / macOS
./start-all.sh
```

Manual start:

```bash
# terminal 1: backend (http://localhost:48731, interactive docs at /docs)
cd backend
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1      Unix: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 48731 --reload

# terminal 2: frontend (http://localhost:48732, proxies /api to :48731)
cd frontend
npm install
npm run dev
```

The launchers use dynamic port fallback: if 48731 / 48732 are busy, the next free ports are chosen and printed (exported as `SENTINEL_API_PORT` / `SENTINEL_FE_PORT`).

The database is created and seeded on first start. Open <http://localhost:48732>.

### Docker

```bash
docker compose up --build        # UI on http://localhost:48732, API on http://localhost:48731
SENTINEL_FE_PORT=8080 SENTINEL_API_PORT=8081 docker compose up --build   # custom host ports
```

The backend container runs uvicorn on `0.0.0.0:48731` with `SENTINEL_DB=/data/sentinel.db` on the named volume `sentinel-data` (data survives `docker compose down`; add `-v` to wipe it). Logs go to `SENTINEL_LOG_DIR=/data/logs` on the same volume. The frontend is built with Node and served by nginx, which proxies `/api` to the backend with buffering off and a long read timeout so SSE works. The backend has a healthcheck on `/api/health`. Run a single backend instance.

### Cheat sheet (Makefile-style)

| Task | Command |
|---|---|
| Install backend | `cd backend && pip install -r requirements.txt` |
| Run backend | `cd backend && uvicorn app.main:app --port 48731 --reload` |
| Run backend tests | `cd backend && python -m pytest -q` (or `npm run test:backend` from the root) |
| Run e2e tests | `npm run test:e2e` from the root (see docs/TESTING.md) |
| Start everything | `npm run dev` from the root (calls the OS-appropriate start-all script) |
| Docker | `docker compose up --build` |
| Install frontend | `cd frontend && npm install` |
| Run frontend | `cd frontend && npm run dev` |
| Production build | `cd frontend && npm run build` (output in `frontend/dist`) |
| Preview build | `cd frontend && npm run preview` |
| API smoke test | `python qa/smoke_test.py` (backend must be running) |
| Reset simulation | `curl -X POST localhost:48731/api/simulation/reset -H "Content-Type: application/json" -d '{"keep_rules":true}'` |
| Reseed defaults | `curl -X POST localhost:48731/api/simulation/seed` |
| Fresh database | stop backend, delete the `*.db` file, restart |

## Project structure

```
Sentinel/
├── README.md
├── start-all.ps1 / start-all.sh     one-command launchers (port fallback)
├── package.json                     root convenience scripts (dev, test:backend, test:e2e, build)
├── docker-compose.yml               backend + frontend (nginx) services
├── .gitignore
├── logs/                            runtime logs (git-ignored): audit.log, security.log, app.log, server output
├── output/                          screenshots and other generated artefacts (tracked)
├── qa/                              contract_tests/, smoke_test.py, run_contract_tests.ps1
├── docs/
│   ├── API_CONTRACT.md              binding API specification
│   ├── ARCHITECTURE.md              components, pipeline, data model, sequences
│   ├── USER_GUIDE.md                page walkthrough, demo script, troubleshooting
│   ├── SECURITY_CONCEPTS.md         syllabus theory mapped to the code
│   ├── TESTING.md                   test strategy and checklists
│   └── DEVELOPMENT.md               setup, conventions, extension recipes
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                  FastAPI app, CORS, router registration
│   │   ├── db.py                    SQLite access and schema
│   │   ├── models.py                Pydantic models
│   │   ├── firewall.py              rule matching, policy, bastion logic
│   │   ├── ids_rules.py             signature detection
│   │   ├── anomaly.py               statistical detection
│   │   ├── simulator.py             traffic and scenario generation
│   │   ├── alert_bus.py             SSE pub/sub
│   │   ├── audit.py                 tamper-evident audit/security logs, audit middleware
│   │   ├── clock.py                 injectable time source
│   │   └── routers/                 one module per API area
│   └── tests/                       pytest suite
└── frontend/
    ├── vite.config.js               dev server, /api proxy
    └── src/
        ├── api/client.js            fetch wrapper and endpoint functions
        ├── components/              ui/, layout/, alerts/, traffic/
        ├── pages/                   one file per route
        ├── hooks/  data/            shared hooks, static content
        └── styles/                  tokens.css, global.css
```

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, Uvicorn, Pydantic v2 |
| Persistence | SQLite via stdlib `sqlite3` |
| Analytics | NumPy, pandas |
| Frontend | React 18, React Router 6, Recharts, Vite 5 |
| Realtime | Server-Sent Events (EventSource) with polling fallback |
| Tests | pytest, httpx (FastAPI TestClient) |

## API summary

Full request/response shapes are in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). All routes are under `/api`; errors are `{"detail": "..."}`.

| Area | Endpoints |
|---|---|
| Health / simulation | `GET /health`, `POST /simulation/reset`, `POST /simulation/seed` |
| Firewall | `GET/POST /firewall/rules`, `PUT/DELETE /firewall/rules/{id}`, `PATCH /firewall/rules/{id}/toggle`, `GET/PUT /firewall/policy`, `POST /firewall/test`, `GET /firewall/stats` |
| Hosts / bastion | `GET/POST /hosts`, `PUT/DELETE /hosts/{id}`, `POST /hosts/{id}/bastion`, `DELETE /hosts/bastion` |
| Traffic | `POST /traffic/send`, `POST /traffic/scenario/{name}`, `GET /traffic/packets`, `GET /traffic/scenarios` |
| Alerts / IDS | `GET /alerts`, `GET /alerts/stream` (SSE), `POST /alerts/{id}/ack`, `DELETE /alerts`, `GET /ids/rules`, `PUT /ids/rules/{id}`, `GET /ids/summary` |
| Anomaly | `GET /anomaly/metrics`, `GET /anomaly/sources`, `GET/PUT /anomaly/config`, `POST /anomaly/baseline` |
| Dashboard | `GET /stats/summary` |
| Events | `GET /events` (SSE; typed `summary`, `alert`, `change` events) |
| Investigate | `GET /investigate/{ip}` |
| Settings | `GET/PUT /settings` (retention) |
| Live traffic | `GET /live`, `PUT /live` (see below) |
| Audit | `GET /audit?kind=audit\|security&limit&offset&q` (newest first, `X-Total-Count`), `GET /audit/verify?kind=` (hash-chain check) |

**Live traffic.** A background thread keeps the simulation moving: benign traffic plus a randomly chosen attack every so often. It starts with the server unless the environment variable `SENTINEL_LIVE=0` is set. `PUT /live` accepts `enabled` (bool), `rate` (benign packets/s, 0.2 to 20) and `attack_interval` (mean seconds between attacks, 0 = never, max 3600); `GET /live` returns those plus read-only `running`, `packets`, `attacks`, `last_attack` and `queued`.

**Audit logging.** All logs go to one folder, `logs/` (override with `SENTINEL_LOG_DIR`): `audit.log` (every mutating API call: actor, action, target, outcome, request summary), `security.log` (one line per alert raised) and `app.log` (application log). The first two are JSON Lines, rotate at 5 MB (5 backups) and are hash-chained, so `GET /api/audit/verify` reports `ok: false` and the `first_bad_seq` if a line was edited or removed. The launchers also write `backend.log`, `backend.err.log`, `frontend.log` and `frontend.err.log` there. Nothing runtime is written to the project root.

List endpoints accept `offset` and return the total in the `X-Total-Count` header. Traffic endpoints are rate limited.


## Syllabus coverage

| Syllabus topic | Where in Sentinel |
|---|---|
| Intrusion detection systems | Alert Panel, Detection Rules, `ids_rules.py`, `anomaly.py` |
| Intruders and their classes | Traffic scenarios, Encyclopedia |
| Statistical anomaly detection | Anomaly Detector page, `anomaly.py` (z-score, Welford per-source profile) |
| Rule-based detection | Detection Rules page, `ids_rules.py` (IDS-001 to IDS-009) |
| Firewalls | Firewall Manager, `firewall.py` (packet filtering, default policy, ordering) |
| Bastion host | Hosts and Bastion page, bastion policy in `firewall.py` |
| Viruses and worms | Encyclopedia, Labs (reference material; no malware is simulated) |

See [`docs/SECURITY_CONCEPTS.md`](docs/SECURITY_CONCEPTS.md) for the theory.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [User guide](docs/USER_GUIDE.md) · [Security concepts](docs/SECURITY_CONCEPTS.md) · [Testing](docs/TESTING.md) · [Development](docs/DEVELOPMENT.md) · [API contract](docs/API_CONTRACT.md)

## Limitations

- Traffic is synthetic. There is no packet capture, deep packet inspection, TCP state tracking or payload analysis; "SYN" and "failed login" are attributes of simulated packets.
- The firewall is a stateless packet filter (priority ordered, first match wins); no connection tracking, NAT or application-layer filtering.
- Anomaly baselines are short (120 buckets) and need warm-up; regenerate with `POST /api/anomaly/baseline`.
- Detection state (sliding windows, cooldowns) is process-local; run a single backend worker.
- No authentication or multi-user support. Intended for local use; do not expose it to a network.
- Thresholds are illustrative, not tuned for production traffic.

## License

MIT. Provided for educational use, without warranty. Add a `LICENSE` file with the standard MIT text, your name and the year before distributing.
