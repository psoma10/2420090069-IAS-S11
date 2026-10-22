#!/usr/bin/env bash
# Sentinel backend helper. Usage: ./run.sh [setup|run|test]   (default: run). PORT env overrides 48731.
set -euo pipefail
cd "$(dirname "$0")"
if [ -x .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python.exe; else PY=.venv/bin/python; fi

ensure_venv() {
  if [ ! -x .venv/bin/python ] && [ ! -x .venv/Scripts/python.exe ]; then
    python3 -m venv .venv 2>/dev/null || python -m venv .venv
    if [ -x .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python.exe; else PY=.venv/bin/python; fi
    "$PY" -m pip install -r requirements.txt
  fi
}

case "${1:-run}" in
  setup) rm -rf .venv; ensure_venv ;;
  test)  ensure_venv; "$PY" -m pytest -q ;;
  *)     ensure_venv; exec "$PY" -m uvicorn app.main:app --port "${PORT:-48731}" ;;
esac
