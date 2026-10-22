# Sentinel backend

FastAPI + SQLite + numpy/pandas implementation of `docs/API_CONTRACT.md` (port 48731, all routes under `/api`).

## Setup / run / test

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --port 48731   # or: .\run.ps1   /  ./run.sh
.\.venv\Scripts\python -m pytest -q                          # or: .\run.ps1 test
```

Interactive docs: <http://localhost:48731/docs>. The SQLite file is `backend/sentinel.db` (override with the
`SENTINEL_DB` env var; delete the file for a fresh start). On first start the app seeds hosts, firewall rules,
IDS config, a 5-minute statistical baseline, some normal traffic and one small Telnet-probe incident so no page is empty.

## Module map (`app/`)

| Module | Responsibility |
|---|---|
| `main.py` | `create_app()` factory, CORS (`http://localhost:48732`), 422 handler (`{"detail": "field: message"}`), lazy `app` |
| `context.py` | `AppContext` wires db, clock, bus, engines and simulator; startup seeding |
| `clock.py` | Injectable `clock()` (epoch seconds), `ManualClock` for tests, `iso()` formatter |
| `db.py` | Schema + thread-safe (RLock) sqlite3 helpers |
| `models.py` | Pydantic v2 request models and validators (IP/CIDR/port -> 422) |
| `firewall.py` | Rule matching: CIDR via `ipaddress`, port ranges, priority order, default policy, bastion policy, RFC1918 "external" check |
| `ids_rules.py` | Signature IDS (IDS-001..009): sliding windows + per-(rule, key) cooldown |
| `anomaly.py` | Bucketed series, rolling z-score (pandas/numpy), per-source Welford profiles, baseline generator |
| `simulator.py` | Packet builders, scenarios, the pipeline, seed/reset |
| `alert_bus.py` | In-process pub/sub feeding the SSE endpoint (any number of clients) |
| `routers/` | `sim`, `firewall`, `hosts`, `traffic`, `alerts`, `ids`, `anomaly`, `stats` |

Pipeline (`Simulator.process`): packet -> firewall verdict (bastion policy, then rules by priority, then default) ->
stored + added to anomaly buckets -> rule IDS (sees allowed **and** denied packets) -> `FW-BLOCK` alert for notable
blocks -> after the batch, anomaly detection on the current bucket -> alerts persisted and published on the bus.

## Signature rules

| ID | Name | Condition (default) | Severity | Window / cooldown |
|---|---|---|---|---|
| IDS-001 | SSH brute force | >= 5 failed `ssh_login` from one src | high | 60 s |
| IDS-002 | Telnet traffic | any packet to dst port 23 | medium | 60 s |
| IDS-003 | Port scan | >= 10 distinct dst ports from one src | high | 30 s |
| IDS-004 | SYN flood | >= 100 `syn_flood` packets to one dst | critical | 10 s (cooldown per dst) |
| IDS-005 | Data exfiltration | one packet/transfer > 10 MB (threshold in MB) to an external IP | high | 60 s |
| IDS-006 | Blocked-traffic storm | >= 20 firewall-denied packets from one src | medium | 30 s |
| IDS-007 | ICMP flood | >= 50 ICMP packets from one src | medium | 10 s |
| IDS-008 | Bastion bypass | external src -> internal non-bastion host on a non-web port (not 80/443) | high | 60 s |
| IDS-009 | Sensitive port probe | external src -> port 3389/445/3306/5432 | medium | 60 s |

Each rule fires at most once per (rule, src) per cooldown = its window (IDS-004: per victim). Severity, threshold,
window and enabled are editable via `PUT /api/ids/rules/{id}`. `FW-BLOCK` (source `firewall`, low) is raised only when
the deny rule's name starts with "Block" or the Bastion policy blocked it, max once per 30 s per (src, rule).

## Statistical anomaly detection

Time is cut into buckets of `bucket_seconds` (default 5 s, last 120 kept). Per bucket five metrics are computed:
`packets_per_sec`, `login_attempts_per_min` (ssh_login packets x 60/bucket), `bytes_per_dst` (bytes to the busiest
destination), `distinct_ports_per_src` (max over sources) and `blocked_ratio`.

For each point the baseline is every **earlier** bucket in the retained window (current excluded):

```
mean_t = mean(x_0 .. x_{t-1})        std_t = population std(x_0 .. x_{t-1})
z_t    = (x_t - mean_t) / max(std_t, 0.10 * |mean_t|, abs_floor)
anomaly = (t >= min_samples) and z_t > sigma        # sigma default 3.0, min_samples default 10
threshold = mean + sigma * max(std, floors)         # drawn as the line in /api/anomaly/metrics
```

`abs_floor` is about one quantum of the metric (one packet / login / port per bucket) so a flat baseline cannot
yield infinite z-scores. Computation uses `pandas` (`shift`, `expanding`) and `numpy`.

Per-source profiles keep a **Welford** running mean/std of each source's packets/sec over the buckets in which it was
active. A source is anomalous (`ANOM-SRC`) when it has >= 5 packets in the current bucket and its z > sigma. Sources
with fewer than `min_samples` of their own samples are compared with the pooled profile of all sources.
Anomaly alerts (`ANOM-PPS`, `ANOM-LOGIN`, `ANOM-BYTES`, `ANOM-PORTS`, `ANOM-BLOCK`, `ANOM-SRC`) have a 10 s cooldown per
metric/source, bypassed if the value grows > 1.5x.

`POST /api/anomaly/baseline` back-fills the buckets before "now" with Poisson-noise normal traffic (noise truncated
at +-2.5 sd so the baseline itself is never flagged). Demo flow: `reset` -> `baseline` -> scenarios.

## Tests

`pytest` covers firewall matching (priority, CIDR, ports, bastion), every IDS rule, cooldown/window expiry, z-score
maths, spike vs. baseline-noise, CRUD validation (422), scenarios -> expected alerts, the reset/baseline/ddos flow
and the SSE stream (two concurrent clients). Tests use `ManualClock` and an in-memory database.
