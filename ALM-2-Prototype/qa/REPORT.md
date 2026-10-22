# Sentinel QA Report

## Contract tests (pytest + httpx, qa/run_contract_tests.ps1)
Result: 120 passed, 1 failed of 121 (about 10 s).

### DEF-1 (backend, medium): IDS-008 does not fire when the bypass attempt is blocked
- Repro: POST /api/simulation/reset {} then POST /api/traffic/send {"type":"http","src_ip":"203.0.113.50","dst_ip":"10.0.2.20"}
- Expected (contract: external src "attempting" non-bastion internal host): alert IDS-008 (high).
- Actual: packet blocked by default deny, alerts: []. IDS-008 only fires when the packet is allowed through (e.g. to 10.0.1.10:80). The bastion_bypass scenario still triggers it.
- Test: contract_tests/test_ids.py::test_ids_008_bastion_bypass

### Observations
- OBS-1 (backend, low): POST /api/firewall/test rejects dst_port 0 with 422 (ge=1), so ICMP cannot be dry-run naturally; ICMP packets report dst_port null. Contract silent.
- OBS-2 (backend, low): port_scan uses a fixed ordered port list rather than random distinct ports: scans of 9 then 3 probe only 9 distinct ports, so IDS-003 (>=10) does not fire. A single call of 12 does.
- OBS-3 (env): "localhost" resolves slowly on this Windows box (~2 s, tries ::1 first); runner uses 127.0.0.1.

### Covered and passing
Health; reset/seed; seed data; firewall CRUD/toggle/404/422 validation, priority first-match, disabled rules, CIDR/port-range/protocol match, dry-run no side effects, hit_count, stats, policy, bastion policy (precedence over rules); hosts CRUD and bastion set/clear; all 9 traffic types, count bounds, validation, packet filters; 7 scenarios + list; IDS-001..009 catalog and each triggered via /traffic/send (below/at threshold); scenario-to-rule mapping; cooldown dedupe (per source, cleared on reset); IDS rule update/disable/threshold; alerts filters/ack/clear; ids summary; anomaly config validation, baseline, ddos flow (anomaly:true + ANOM-* alert), sources; stats summary; SSE delivers an alert.

## E2E (Playwright, qa/e2e)
Result: 13/13 passed (about 42 s). Servers started and stopped by Playwright webServer.
- Routes /, /firewall, /hosts, /traffic, /alerts, /anomaly, /ids-rules, /encyclopedia, /encyclopedia/<first slug>, /lab, /about: heading visible, zero console errors/page errors/failed requests/API >=400.
- Unknown route shows 404 page.
- Flow: Traffic > Launch brute force > results render > Alerts shows IDS-001; API confirms.
- Screenshots: qa/e2e/screenshots/*.png

## Owners
- DEF-1, OBS-1, OBS-2: backend
- Frontend: no defects found
