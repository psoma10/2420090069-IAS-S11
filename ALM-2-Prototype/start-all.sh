#!/usr/bin/env bash
# Start Sentinel backend and frontend. Defaults 48731 / 48732; if a port is taken the next free one is used.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON:-python3}"

if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "[sentinel] creating backend virtualenv"
  "$PY" -m venv "$ROOT/backend/.venv"
fi
VPY="$ROOT/backend/.venv/bin/python"
"$VPY" -m pip install --quiet --upgrade pip
"$VPY" -m pip install --quiet -r "$ROOT/backend/requirements.txt"

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "[sentinel] installing frontend dependencies"
  (cd "$ROOT/frontend" && npm install)
fi

free_port() { # free_port START [SKIP]
  "$VPY" - "$@" <<'PY'
import socket, sys
start = int(sys.argv[1]); skip = int(sys.argv[2]) if len(sys.argv) > 2 else -1
for p in range(start, start + 200):
    if p == skip: continue
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", p)); s.close(); print(p); break
    except OSError:
        s.close()
PY
}
BE_PORT=$(free_port 48731); FE_PORT=$(free_port 48732 "$BE_PORT")
[ "$BE_PORT" != 48731 ] && echo "[sentinel] 48731 busy, backend using $BE_PORT"
[ "$FE_PORT" != 48732 ] && echo "[sentinel] 48732 busy, frontend using $FE_PORT"
export SENTINEL_API_PORT="$BE_PORT" SENTINEL_FE_PORT="$FE_PORT"

cleanup() { echo; echo "[sentinel] stopping"; kill "${BE:-}" "${FE:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$ROOT/backend" && "$VPY" -m uvicorn app.main:app --port "$BE_PORT") & BE=$!
(cd "$ROOT/frontend" && npm run dev) & FE=$!

sleep 4
URL="http://localhost:$FE_PORT"
echo "[sentinel] UI: $URL   API docs: http://localhost:$BE_PORT/docs"
if command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null; then open "$URL" || true; fi
wait
