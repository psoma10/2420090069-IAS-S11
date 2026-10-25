# Sentinel — API & Architecture Contract (source of truth)

Backend: FastAPI + SQLite (stdlib `sqlite3`) + numpy/pandas, port **48731**, all routes under `/api`.
Frontend: React 18 + Vite + React Router + Recharts, port **48732**, Vite proxies `/api` -> `http://localhost:48731`.
All JSON. Timestamps are ISO-8601 UTC strings (`2026-01-01T12:00:00.123Z`). Errors: `{"detail": "msg"}` with 4xx.
CORS: allow `http://localhost:48732`.

## Folder layout
```
Sentinel/
  README.md  docs/(API_CONTRACT.md, ARCHITECTURE.md, USER_GUIDE.md, AUDIT.md, SECURITY_CONCEPTS.md)
  backend/   app/(main.py, db.py, models.py, firewall.py, ids_rules.py, anomaly.py, simulator.py, audit.py, routers/...) tests/ requirements.txt
  frontend/  src/(api, components, pages, styles, data, hooks)
```

## Enumerations
- protocol: `TCP | UDP | ICMP | ANY`
- action: `allow | deny`
- severity: `low | medium | high | critical`
- alert source: `rule | anomaly | firewall`
- traffic type: `http | https | ssh_login | telnet | port_scan | ping | dns | data_transfer | syn_flood`
- host role: `bastion | web | database | ssh | workstation | external`

## Models
**FirewallRule** `{id, name, action, protocol, src_ip, dst_ip, src_port, dst_port, priority, enabled, description, hit_count, created_at}`
- `src_ip`/`dst_ip`: `"ANY"`, single IP, or CIDR. `src_port`/`dst_port`: `"ANY"`, `"80"`, or range `"1000-2000"`.
- Evaluated ascending `priority` (lower first), first match wins; no match -> default policy.

**Host** `{id, name, ip, role, is_bastion, description}`

**Packet** `{id, ts, src_ip, dst_ip, src_port, dst_port, protocol, type, bytes, success, verdict ("allowed"|"blocked"), matched_rule_id (int|null), matched_rule_name (str|null), reason, alerts: [Alert]}`

**Alert** `{id, ts, source, severity, rule_id (str e.g. "IDS-001"|"ANOM-PPS"|"FW-BLOCK"), title, description, src_ip, dst_ip, metric (str|null), value (num|null), threshold (num|null), acknowledged (bool)}`

**IdsRule** `{id ("IDS-001"), name, description, severity, enabled, window_seconds, threshold (int|null), category}`
Built-in rules (backend must implement all, seeded):
- IDS-001 SSH brute force: >=5 failed `ssh_login` from same src in 60s (high)
- IDS-002 Telnet traffic: any packet to dst port 23 (medium)
- IDS-003 Port scan: >=10 distinct dst ports from same src in 30s (high)
- IDS-004 SYN flood: >=100 SYN packets to same dst in 10s (critical)
- IDS-005 Suspicious data exfiltration: single transfer > 10 MB to external IP (high)
- IDS-006 Blocked-traffic storm: >=20 firewall-denied packets from same src in 30s (medium)
- IDS-007 ICMP flood: >=50 ICMP packets from same src in 10s (medium)
- IDS-008 Bastion bypass attempt: external src attempting non-bastion internal host (high)
- IDS-009 Sensitive port probe: access to ports 3389/445/3306/5432 from external src (medium)
Each fires at most once per (rule, src) per cooldown = its window, to avoid alert spam.

## Endpoints

### Health / simulation
- `GET /api/health` -> `{status:"ok", version, uptime_seconds}`
- `POST /api/simulation/reset` body `{keep_rules: bool=true}` -> `{ok:true}` clears packets, alerts, stats (rules/hosts kept if keep_rules)
- `POST /api/simulation/seed` -> seeds default hosts, firewall rules, baseline traffic -> `{ok:true}` (also run automatically on first start)

### Firewall
- `GET /api/firewall/rules` -> `FirewallRule[]` (sorted by priority)
- `POST /api/firewall/rules` body = FirewallRule without id/hit_count/created_at -> 201 FirewallRule (validate IPs/ports/CIDR; 422 on bad)
- `PUT /api/firewall/rules/{id}` full update -> FirewallRule
- `PATCH /api/firewall/rules/{id}/toggle` -> FirewallRule (flips enabled)
- `DELETE /api/firewall/rules/{id}` -> `{ok:true}`
- `GET /api/firewall/policy` / `PUT /api/firewall/policy` body `{default_action:"allow"|"deny", bastion_mode:bool}` -> same object. `bastion_mode` true => inbound traffic from `external` sources to any internal host that is not the bastion is denied (reason "Bastion policy"), before rules are evaluated.
- `POST /api/firewall/test` body `{src_ip,dst_ip,src_port?,dst_port,protocol}` -> `{verdict, matched_rule_id, matched_rule_name, reason}` (dry run, no side effects)
- `GET /api/firewall/stats` -> `{total_rules, enabled_rules, hits_by_rule:[{id,name,hits}], allowed, blocked}`

### Hosts / Bastion
- `GET /api/hosts` -> `Host[]`; `POST /api/hosts` (201); `PUT /api/hosts/{id}`; `DELETE /api/hosts/{id}`
- `POST /api/hosts/{id}/bastion` -> Host (makes this host the single bastion; clears others; role becomes `bastion`)
- `DELETE /api/hosts/bastion` -> `{ok:true}` removes bastion designation

### Traffic simulation
- `POST /api/traffic/send` body `{type, src_ip, dst_ip, dst_port?, protocol?, count=1 (1..500), success?: bool, bytes?: int}` -> `{packets: Packet[], summary:{total, allowed, blocked, alerts}}`
  - type defaults: http->TCP/80, https->TCP/443, ssh_login->TCP/22 (`success` default false), telnet->TCP/23, port_scan->TCP random distinct ports (count = number of ports probed), ping->ICMP, dns->UDP/53, data_transfer->TCP/443 with `bytes`, syn_flood->TCP/80 SYN.
- `POST /api/traffic/scenario/{name}` name in `normal | brute_force | port_scan | ddos | exfiltration | telnet_probe | bastion_bypass` -> same response shape. (`normal` produces benign traffic across hosts.)
- `GET /api/traffic/packets?limit=100&verdict=&src_ip=` -> `Packet[]` newest first
- `GET /api/traffic/scenarios` -> `[{name,title,description,type_hint}]`

### IDS
- `GET /api/alerts?limit=100&severity=&source=&acknowledged=` -> `Alert[]` newest first
- `GET /api/alerts/stream` -> Server-Sent Events, each event `data: <Alert JSON>`; frontend must fall back to polling `GET /api/alerts?limit=50` every 2s if EventSource errors.
- `POST /api/alerts/{id}/ack` -> Alert; `DELETE /api/alerts` -> `{ok:true}` clear all
- `GET /api/ids/rules` -> `IdsRule[]`; `PUT /api/ids/rules/{id}` body `{enabled, threshold?, window_seconds?, severity?}` -> IdsRule
- `GET /api/ids/summary` -> `{total, by_severity:{low,medium,high,critical}, by_source:{rule,anomaly,firewall}, top_sources:[{ip,count}], last_hour_series:[{ts,count}]}`

### Statistical anomaly detection
Bucketed time series (default `bucket_seconds=5`, keep last 120 buckets). Metrics:
`packets_per_sec`, `login_attempts_per_min`, `bytes_per_dst` (bytes to the busiest destination), `distinct_ports_per_src`, `blocked_ratio`.
Detection: z = (x - mean) / std over a trailing baseline (excluding current bucket, min 10 buckets; std floored at small epsilon); anomaly when `z > sigma` (default 3.0). Also per-source-IP packets/sec profile (running mean/std via Welford) -> anomaly alert `ANOM-SRC`.
- `GET /api/anomaly/metrics?window=60` -> `{sigma, bucket_seconds, metrics:[{key,label,unit,points:[{ts,value,z,anomaly}],mean,std,threshold,latest}]}` where `threshold = mean + sigma*std`
- `GET /api/anomaly/sources` -> `[{ip, mean_pps, std_pps, last_pps, z, anomalous, samples}]`
- `GET /api/anomaly/config` / `PUT /api/anomaly/config` body `{sigma (1..6), bucket_seconds (1..60), min_samples}`
- `POST /api/anomaly/baseline` body `{minutes:int=5}` -> generates back-dated normal traffic buckets so baseline exists -> `{ok:true, buckets}`

### Stats (dashboard)
- `GET /api/stats/summary` -> `{packets_total, allowed, blocked, alerts_total, alerts_unacked, rules_total, hosts_total, bastion: Host|null, by_protocol:{TCP,UDP,ICMP}, by_type:{...}, top_sources:[{ip,count}], throughput:[{ts,allowed,blocked}] (last 60 buckets)}`

## Seed data (backend)
Hosts: 10.0.0.5 `bastion-gw` (bastion), 10.0.1.10 `web-01` (web), 10.0.1.11 `web-02`, 10.0.2.20 `db-01` (database), 10.0.3.30 `ssh-jump`/`dev-box` (ssh), 192.168.1.100 `ws-finance` (workstation), 203.0.113.50 `attacker-ext` (external), 198.51.100.7 `partner-ext` (external).
Rules (default policy `deny`, bastion_mode false): allow TCP 80/443 ANY->10.0.1.0/24; allow TCP 22 ANY->10.0.0.5; deny ANY 192.168.1.100 -> ANY ("Block compromised workstation"); deny TCP 23 ANY->ANY; deny TCP 3389/445 ANY->ANY; allow UDP 53; allow ICMP from 10.0.0.0/8.
"External" = not in RFC1918 (10/8, 172.16/12, 192.168/16) and not loopback.

## Frontend routes
`/` Overview · `/firewall` Rule Manager · `/hosts` Hosts & Bastion (topology) · `/traffic` Traffic Generator · `/alerts` Alert Panel · `/anomaly` Anomaly Detector · `/ids-rules` Detection Rules · `/encyclopedia` Threat Encyclopedia (+ `/encyclopedia/:slug`) · `/lab` Guided Labs · `/about` About & Docs
Shared frontend foundation already provided: `src/api/client.js`, `src/styles/tokens.css`, `src/App.jsx` routes. Do not rewrite these; extend only in your owned files.

## Backend decisions (appended by backend implementation)
- Validation errors (422) return `{"detail": "<field>: <message>; ...", "errors": [...]}` (detail is always a string).
- `POST /api/simulation/reset` with `keep_rules=false` also deletes firewall rules and hosts (use `/simulation/seed` to restore defaults). `seed` is idempotent: it wipes and recreates hosts, rules, policy, IDS config, baseline and a little back-dated traffic (incl. one Telnet-probe incident from 203.0.113.52 so alert pages are not empty).
- Seed rules (priority): 10 Block compromised workstation, 20 Block Telnet, 30 Block RDP, 31 Block SMB, 40 Allow SSH to bastion, 50 Allow HTTP, 51 Allow HTTPS, 60 Allow DNS (UDP 53), 70 Allow internal ICMP (10.0.0.0/8). Seed host `ssh-jump` = 10.0.3.30.
- Ports are strings in rules (`"ANY"`, `"80"`, `"1000-2000"`); numeric input is accepted and normalised. ICMP packets have `dst_port: null`.
- Bastion policy only applies when a bastion host exists. External -> internal traffic to the bastion itself is judged by the rules. Removing/replacing a bastion demotes the old one to role `ssh`.
- Duplicate host IP -> 409. Unknown ids -> 404.
- IDS sees every packet, including firewall-denied ones. IDS-008 ignores web ports 80/443 (published services). IDS-005 threshold is in MB (default 10 = 10*1024*1024 bytes). IDS-004 cooldown is per victim dst. `threshold` in `PUT /api/ids/rules/{id}` is ignored for rules whose threshold is null.
- `FW-BLOCK` alerts: only when the denying rule name starts with "Block" or reason is "Bastion policy"; at most once per 30 s per (src, rule).
- Anomaly alert `src_ip`/`dst_ip` are the busiest source/destination of the current bucket. `ANOM-*` rule ids: PPS, LOGIN, BYTES, PORTS, BLOCK, SRC. `std` returned by `/api/anomaly/metrics` is the floored std used for `threshold`. `window` is in seconds. Changing `bucket_seconds` clears buckets and regenerates a 5-minute baseline.
- Scenarios use different external attackers so back-to-back runs are not suppressed by cooldowns: brute_force/port_scan/exfiltration -> 203.0.113.50 (attacker-ext), ddos 203.0.113.51, telnet_probe .52, bastion_bypass .53 (not seeded hosts, but external).
- `GET /api/alerts/stream` also accepts an undocumented `?limit=N` (close after N events; used by tests). `rules_total` in stats = firewall rules count. Packet `success` is forced `false` for blocked packets.
- DB path: `backend/sentinel.db`, override via `SENTINEL_DB`.
- (QA fixes) IDS-008 now also fires for denied attempts; the 80/443 exemption applies only when the destination is a known `web`-role host. `POST /api/firewall/test` accepts `dst_port` 0 or omitted (treated as no port, for ICMP). `port_scan` probes random distinct ports (first one is a random sensitive port 3389/445/3306/5432) from the simulator's seedable RNG.

## Realtime events, investigation, settings, pagination, rate limits (v1.1 additions)

### `GET /api/events` (Server-Sent Events)
One stream for everything. Each message is `event: <type>\ndata: <json>\n\n`; a `: connected` comment is sent first and `: keepalive` every 15 s while idle. Optional `?limit=N` closes the stream after N events (tests). The server stops cleanly when the client disconnects.
- `summary`: same JSON as `GET /api/stats/summary`. Sent immediately on connect, then whenever it changed, at most once per second.
- `alert`: the Alert object (same shape as `/api/alerts/stream` items), sent when created.
- `change`: `{"entity": "hosts"|"rules"|"policy"|"packets"|"alerts"|"reset"|"settings"}` published after any mutation: host add/edit/delete/bastion -> `hosts`; firewall rule create/update/toggle/delete -> `rules`; policy update -> `policy`; traffic send/scenario -> `packets` (+ `rules` because hit counts change, + `alerts` if alerts were raised); alert ack/clear -> `alerts`; `simulation/reset` and `simulation/seed` -> `reset`; `PUT /api/settings` -> `settings` (+ `packets`, `alerts` since pruning may occur).
`GET /api/alerts/stream` is unchanged (backward compatible).

### `GET /api/investigate/{ip}`
`{ip, host: Host|null, first_seen, last_seen (ISO|null), totals:{packets, allowed, denied, alerts}, packets: Packet[] (last 100 with the IP as src or dst, newest first), alerts: Alert[] (last 50 involving the IP, newest first), rules_hit: [{rule: FirewallRule, hits}] (most hits first), top_peers: [{ip, packets}] (max 5)}`. `denied` counts `blocked` packets. Unknown IP -> 200 with zero totals, `host: null`, `first_seen`/`last_seen` null and empty lists. Malformed IP -> 422 `{"detail": "ip: ..."}`.

### `GET /api/settings` / `PUT /api/settings`
`{packet_retention: int (default 5000, 100..100000), alert_retention: int (default 1000, 50..50000)}`. Persisted in SQLite. `PUT` accepts either or both fields (omitted keeps the current value) and returns the full object; out-of-range or non-integer values -> 422 in the standard format. Oldest packets/alerts beyond the limits are pruned when new rows are written and immediately on `PUT`. This replaces the old fixed 20000-packet cap.

### Pagination
`GET /api/alerts` and `GET /api/traffic/packets` accept `offset` (>= 0, default 0) in addition to `limit` (1..1000, default 100). The body is still a plain list; the response header `X-Total-Count` holds the number of rows matching the filters (ignoring limit/offset) and is exposed to browsers via CORS.

### Rate limiting
`POST /api/traffic/send` and `POST /api/traffic/scenario/{name}` share a per-client-IP token bucket (20 requests/second, burst 40). When exhausted: `429 {"detail": "Too many requests: ..."}` with `Retry-After: 1`. Other endpoints are not limited.


## Audit log (v1.2 addition)
Mutating requests (`POST/PUT/PATCH/DELETE` under `/api`, except `/api/audit*`) and every raised alert are written to hash-chained JSON Lines files in the log directory (`SENTINEL_LOG_DIR`, default `<project>/logs`): `audit.log` and `security.log`. Each entry has `seq` (monotonic from 1), `ts`, `kind`, `prev` (hash of the previous entry, 64 zeros for the first) and `hash` (sha256 hex of the canonical JSON, `sort_keys` and compact separators, of the entry without `hash`). Files rotate at 5 MB with 5 backups; the chain continues across rotation.

### `GET /api/audit`
Query: `kind` = `audit` (default) | `security`; `limit` 1..1000 (default 100); `offset` >= 0; `q` case-insensitive substring over the raw JSON line. Returns an array of entries, **newest first**, read from the current file; the match count (ignoring limit/offset) is in the `X-Total-Count` header. Unknown `kind` -> 422.
- audit entry: `{seq, ts, kind:"audit", actor (client IP), method, path, action ("firewall.rule.create", "firewall.rule.update", "alerts.clear", "simulation.reset", "live.configure", ...; unknown routes: "post:/api/x"), target (id/name from the path or null), status, outcome ("success" if status < 400 else "failure"), duration_ms, detail? (request JSON body summary: strings cut to 200 chars, about 2 KB max, omitted when there is no body), prev, hash}`
- security entry: `{seq, ts, kind:"security", alert_id, rule_id, severity, source, title, src_ip, dst_ip, prev, hash}`

### `GET /api/audit/verify`
Query: `kind` as above. Recomputes the chain over the current file and returns `{kind, ok: bool, entries: int, first_bad_seq: int|null}`. The first line's `prev`/`seq` are trusted, so a file that starts mid-chain after rotation verifies. Editing a line reports that line's `seq`; deleting a line reports the `seq` of the line after the gap. An empty or missing file is `ok: true` with `entries: 0`.

### `GET /api/live` / `PUT /api/live`
`{enabled: bool, rate: float (0.2..20 benign packets/s), attack_interval: int (0..3600 mean seconds between attacks, 0 = never), running: bool, ticks, packets, attacks, last_attack: string|null, last_attack_at: float|null, queued: int}`. `PUT` accepts any of `enabled`, `rate`, `attack_interval` (the others are read-only) and returns the full object. The background thread starts with the server unless `SENTINEL_LIVE=0`.
