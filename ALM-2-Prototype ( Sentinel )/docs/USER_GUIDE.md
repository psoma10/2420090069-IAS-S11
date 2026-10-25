# Sentinel User Guide

## 1. Getting started

Run `start-all.ps1` (Windows) or `./start-all.sh` (Unix), or follow the manual steps in the [README](../README.md). Open <http://localhost:48732>. On first start the backend seeds eight hosts, a default rule set, the nine IDS signatures and some baseline traffic.

Default seed (see the contract for full detail):

| Host | IP | Role |
|---|---|---|
| bastion-gw | 10.0.0.5 | bastion |
| web-01 / web-02 | 10.0.1.10 / 10.0.1.11 | web |
| db-01 | 10.0.2.20 | database |
| ssh-jump (dev-box) | 10.0.3.30 | ssh |
| ws-finance | 192.168.1.100 | workstation |
| attacker-ext | 203.0.113.50 | external |
| partner-ext | 198.51.100.7 | external |

Default firewall policy: `deny`, bastion mode off. Seed rules: allow TCP 80/443 to 10.0.1.0/24; allow TCP 22 to 10.0.0.5; deny everything from 192.168.1.100 ("compromised workstation"); deny TCP 23; deny TCP 3389/445; allow UDP 53; allow ICMP from 10.0.0.0/8.

The sidebar groups the pages; the Alerts entry shows a badge with the number of unacknowledged alerts.

## 2. Page walkthrough

### Overview (`/`)
Dashboard of the whole system: totals for packets, allowed, blocked, alerts and unacknowledged alerts; throughput chart (allowed vs. blocked over the last 60 buckets); protocol and traffic-type mix; top source IPs; current bastion. Use it as the "is anything happening" page. Data comes from `GET /api/stats/summary`.

### Firewall Rule Manager (`/firewall`)
- **Rule table**: sorted by priority (lower number is evaluated first). Columns include action, protocol, source/destination address and port, hit count and enabled state.
- **Add / edit rule**: fields are name, action (allow/deny), protocol (TCP/UDP/ICMP/ANY), source and destination IP (`ANY`, an address, or CIDR such as `10.0.1.0/24`), source and destination port (`ANY`, `80`, or range `1000-2000`), priority, description. Invalid addresses or ports are rejected with a validation message.
- **Toggle / delete**: switch a rule off without deleting it, to see how verdicts change.
- **Default policy and bastion mode**: set the fall-through action and enable bastion mode.
- **Rule tester**: enter source, destination, port and protocol to see the verdict and which rule matched, without generating a packet or any alert.

### Hosts and Bastion (`/hosts`)
Topology view of the network. Add, edit or delete hosts. "Make bastion" designates a single bastion host (any previous bastion is cleared). With bastion mode on (Firewall page), external sources can only reach the bastion; traffic to other internal hosts is denied with reason "Bastion policy".

### Traffic Generator (`/traffic`)
1. Choose a traffic type (http, https, ssh_login, telnet, port_scan, ping, dns, data_transfer, syn_flood).
2. Set source IP, destination IP, and where applicable port, count (1 to 500), success flag (ssh_login) and bytes (data_transfer).
3. Send. Each packet is listed with its verdict, matching rule and any alerts it raised.
4. **Scenarios**: one click runs a burst: normal, brute_force, port_scan, ddos, exfiltration, telnet_probe, bastion_bypass.
5. A recent-packets table auto-refreshes every few seconds.

### Alert Panel (`/alerts`)
Live list of alerts, newest first, delivered over Server-Sent Events (with polling fallback). Filter by severity, source (rule, anomaly, firewall) and acknowledged state. Each alert shows severity, rule id, title, description, source and destination, and for anomaly alerts the metric, observed value and threshold. Acknowledge individual alerts or clear all.

Each alert row has **Investigate** (opens the Investigate page for the source IP) and **Block** (blocks that source) buttons. List views support paging; the total comes from the `X-Total-Count` header.

### Investigate (`/investigate/:ip`)
Per-address view with stat tiles and the recent activity of that IP. Reach it from an alert row, from the command palette (type an IPv4 address and choose Investigate), or by URL.

### Settings (`/settings`)
Holds data retention. Change the value and save; it is stored via `PUT /api/settings`. The light/dark theme toggle is remembered across reloads.

### Command palette
Press **Ctrl+K** (Cmd+K on macOS) anywhere to open the palette: type to filter pages and actions, Enter to go. Typing an IPv4 address offers Investigate. Esc closes it.

### Anomaly Detector (`/anomaly`)
Charts for five metrics: packets per second, login attempts per minute, bytes to the busiest destination, distinct ports per source, blocked ratio. Each chart shows the series, the mean and the threshold line `mean + sigma * std`; anomalous points are highlighted. A table shows per-source packets/sec profiles with z-score. Controls: sigma (1 to 6), bucket size (1 to 60 s), minimum samples, and "Generate baseline", which back-fills normal traffic so a baseline exists immediately.

### Detection Rules (`/ids-rules`)
Lists IDS-001 to IDS-009. For each you can enable or disable it and change threshold, window and severity, then re-run an attack to see the effect.

| ID | Detects | Default |
|---|---|---|
| IDS-001 | SSH brute force | 5 failed logins from one source in 60 s |
| IDS-002 | Telnet traffic | any packet to port 23 |
| IDS-003 | Port scan | 10 distinct ports from one source in 30 s |
| IDS-004 | SYN flood | 100 SYN to one destination in 10 s |
| IDS-005 | Data exfiltration | single transfer over 10 MB to an external IP |
| IDS-006 | Blocked-traffic storm | 20 firewall-denied packets from one source in 30 s |
| IDS-007 | ICMP flood | 50 ICMP from one source in 10 s |
| IDS-008 | Bastion bypass attempt | external source targeting a non-bastion internal host |
| IDS-009 | Sensitive port probe | external access to 3389, 445, 3306, 5432 |

### Threat Encyclopedia (`/encyclopedia`, `/encyclopedia/:slug`)
Reference articles on the threats Sentinel models (and on viruses and worms), each linking to the relevant page or scenario.

### Guided Labs (`/lab`)
Step-by-step exercises that tell you what to configure, which traffic to send and what to observe.

### About (`/about`)
Project description, documentation pointers and syllabus mapping.

## 3. Ten-minute demo script (viva / presentation)

Prepare: start the app, open Overview. Optionally `POST /api/simulation/reset` for a clean slate (Alerts, packets cleared; rules kept).

| Time | Action | What to say |
|---|---|---|
| 0:00 | Overview | "Sentinel simulates a small network. Packets go firewall, then signature IDS, then statistical IDS, then alerts." Show the architecture pipeline diagram in `docs/ARCHITECTURE.md` if asked. |
| 1:00 | Firewall page | Show first-match ordering and default deny. Use the tester: 203.0.113.50 to 10.0.1.10 port 80 TCP is allowed (rule), port 3389 is denied. Toggle the HTTP rule off, retest, toggle back. |
| 2:30 | Traffic: normal | Run scenario `normal`. Overview throughput moves; no alerts. "Benign traffic stays quiet." |
| 3:30 | Rule-based IDS | Run `brute_force`. Open Alerts: IDS-001 appears live. Open the alert: five failed logins in 60 s. Explain signature detection and the cooldown. |
| 5:00 | Port scan | Run `port_scan`: IDS-003, plus IDS-006 as the firewall denies probes. Explain that the firewall blocks but the IDS still sees. |
| 6:00 | Detection Rules | Lower IDS-001 threshold to 3, rerun a smaller brute force, show it fires. "Thresholds trade false positives for false negatives." |
| 7:00 | Anomaly | Anomaly page: click "Generate baseline", then run `ddos`. Packets/sec crosses the threshold line; ANOM-* alert in Alerts. Work the z-score on the whiteboard: baseline mean 20, std 4, observed 60 gives z = 10 > 3. Contrast with a novel attack that no signature covers. |
| 8:30 | Bastion | Hosts page: designate 10.0.0.5 as bastion, enable bastion mode on Firewall. Run `bastion_bypass`: denied with "Bastion policy" and IDS-008 fires. Explain single hardened choke point. |
| 9:30 | Wrap-up | Overview summary, Encyclopedia for viruses and worms, limitations (simulated, stateless). Take questions. |

Likely viva questions are answered in [SECURITY_CONCEPTS.md](SECURITY_CONCEPTS.md).

## 4. Troubleshooting

- **Ports**: if 48731 / 48732 are busy the launchers pick the next free ports and print them; use the URL shown.
- **Docker**: `docker compose up --build`, then open <http://localhost:48732>. Override host ports with `SENTINEL_FE_PORT` / `SENTINEL_API_PORT`.
- **Traffic requests rejected**: traffic sending is rate limited; wait a moment and retry.

| Symptom | Cause and fix |
|---|---|
| UI loads but every page shows an error or empty data | Backend not running or not on port 48731. Start it; check <http://localhost:48731/api/health>. |
| `ECONNREFUSED` or proxy errors in the Vite console | Same as above; the Vite dev server proxies `/api` to `localhost:48731`. |
| port 48731 or 48732 already in use | Stop the other process, or run uvicorn on another port and change the proxy target in `frontend/vite.config.js`. |
| `python` not found, or venv creation fails | Install Python 3.10+. On Windows use `py -m venv`. On Debian/Ubuntu install `python3-venv`. |
| PowerShell blocks `start-all.ps1` | `powershell -ExecutionPolicy Bypass -File .\start-all.ps1`, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `permission denied` for `start-all.sh` | `chmod +x start-all.sh`. |
| Alerts do not appear live | SSE blocked by a proxy or the backend restarted. The panel falls back to polling every 2 s; reload the page to reconnect. |
| Anomaly charts empty or never flag anything | Not enough buckets (minimum 10). Use "Generate baseline", wait a few buckets, then send the attack. |
| Anomaly alert fires on normal traffic | Baseline too flat or sigma too low; raise sigma or regenerate baseline. |
| Same attack gives only one alert | Cooldown: each (rule, source) fires once per window. Wait for the window or change the source IP. |
| Nothing is blocked after enabling bastion mode | Bastion mode needs a designated bastion host and an external source targeting a non-bastion internal host. |
| Rule save returns 422 | Invalid IP/CIDR or port/range (for example `999.1.1.1`, `80-`, `2000-1000`). |
| Want a clean start | `POST /api/simulation/reset` (keep rules) or stop the backend, delete the `*.db` file and restart to reseed. |
