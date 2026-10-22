# Sentinel — Audit Summary

## Verification results
| Check | Result |
|---|---|
| Backend unit/integration tests (`backend`, pytest) | 74 passed |
| Contract tests (`qa/contract_tests`, 121 tests, every endpoint, IDS-001..009, SSE) | 121 passed (after fixes) |
| Browser smoke tests (`qa/e2e`, Playwright, all routes + brute-force flow) | 13/13 passed (run before the backend fixes below) |
| Frontend production build (`vite build`) | succeeds |

## Defects found by QA and resolved
| ID | Issue | Resolution |
|---|---|---|
| DEF-1 | IDS-008 (bastion bypass) did not fire for blocked attempts to non-web hosts on ports 80/443 | Port 80/443 exemption now limited to known `web`-role hosts |
| OBS-1 | `/api/firewall/test` rejected `dst_port: 0` (ICMP) | Port 0 or omitted accepted |
| OBS-2 | `port_scan` reused a fixed port list, so repeated scans missed IDS-003 | Random distinct ports from a seedable RNG |

## Known limitations / follow-ups
- Not verified: the 13 browser tests were not rerun after the backend fixes, and no human has reviewed the UI visually. Treat the screenshots in `qa/e2e/screenshots/` as the visual check.
- Frontend bundle is about 709 kB (single chunk); route-level code splitting would remove the Vite size warning.
- Running the same attack scenario twice inside its cooldown window (30–60 s) raises few new alerts for that source. This is by design (alert de-duplication).
- `ddos` scenario's ICMP portion also triggers IDS-008 (pings to a non-bastion host from outside).
- The alert timeline shows counts per minute only; the contract's `last_hour_series` has no severity breakdown.
- Simulation only: no real packets are inspected, and the tool must not be used as a production IDS.

## Documentation audit
Docs were written against the contract and the backend files as they existed mid-build. After the final backend changes, re-read `README.md`, `docs/DEVELOPMENT.md` and `docs/ARCHITECTURE.md` for file names if modules are renamed. The authoritative behaviour record is the "Backend decisions" section of `docs/API_CONTRACT.md`.
