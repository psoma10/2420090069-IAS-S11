# Sentinel QA

- `contract_tests/` - pytest + httpx suite validating every endpoint in `docs/API_CONTRACT.md` against a running backend (`BASE_URL`, default `http://localhost:48731`).
- `e2e/` - Playwright smoke tests (screenshots in `e2e/screenshots/`).
- `REPORT.md` - latest results and defects.

## Run contract tests
    powershell -File qa\run_contract_tests.ps1        # creates qa/.venv, starts backend if down, runs, stops it
or manually:

    python -m venv qa/.venv; qa/.venv/Scripts/pip install -r qa/requirements.txt
    BASE_URL=http://localhost:48731 qa/.venv/Scripts/python -m pytest qa/contract_tests

Tests call `/api/simulation/reset` before each test (destructive to sim state; rules are kept).

## E2E
    cd qa/e2e; npm install; npx playwright install chromium; npx playwright test
Playwright starts backend (48731) and `npm run dev` (48732) itself (reuses them if already running).
