"""Audit and security logging with tamper-evident hash chains.

Everything lives in one log directory (``SENTINEL_LOG_DIR``, default ``<project root>/logs``):

* ``audit.log``    JSON Lines. One entry per mutating API request (who/what/outcome).
* ``security.log`` JSON Lines. One entry per alert raised by the detection pipeline.
* ``app.log``      human-readable application log (``sentinel.*`` loggers and uvicorn errors).

Audit and security entries are hash-chained: each carries ``seq``, ``prev`` (hash of the previous entry,
64 zeros for the first) and ``hash`` = sha256 of the canonical JSON of the entry without ``hash``. Editing,
deleting or reordering a line breaks the chain, which ``GET /api/audit/verify`` detects. Files rotate at
5 MB (5 backups); the chain continues across rotation, so a rotated-in file starts mid-chain and its first
``prev`` is trusted.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Optional

ZERO_HASH = "0" * 64
KINDS = ("audit", "security")
MAX_BYTES = 5 * 1024 * 1024
BACKUPS = 5
MAX_DETAIL_STR = 200
MAX_DETAIL_BYTES = 2048
MAX_BODY_PARSE = 64 * 1024
DEFAULT_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
_SECRET_KEYS = re.compile(r"pass(word)?|secret|token|api[_-]?key", re.I)

log = logging.getLogger("sentinel.audit")


def default_log_dir() -> Path:
    return Path(os.environ.get("SENTINEL_LOG_DIR") or DEFAULT_LOG_DIR)


def canonical(entry: dict[str, Any]) -> str:
    """Canonical JSON of an entry without its ``hash`` field (what the hash is computed over)."""
    body = {k: v for k, v in entry.items() if k != "hash"}
    return json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)


def digest(entry: dict[str, Any]) -> str:
    return hashlib.sha256(canonical(entry).encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# ---------------------------------------------------------------------- action naming
# (method, regex over the path below /api) -> action name. ``target`` group = id/name of the affected object.
_ACTIONS: list[tuple[str, re.Pattern[str], str]] = [(m, re.compile(p + r"$"), a) for m, p, a in [
    ("POST", r"/firewall/rules", "firewall.rule.create"),
    ("PUT", r"/firewall/rules/(?P<target>[^/]+)", "firewall.rule.update"),
    ("PATCH", r"/firewall/rules/(?P<target>[^/]+)/toggle", "firewall.rule.toggle"),
    ("DELETE", r"/firewall/rules/(?P<target>[^/]+)", "firewall.rule.delete"),
    ("PUT", r"/firewall/policy", "firewall.policy.update"),
    ("POST", r"/firewall/test", "firewall.test"),
    ("POST", r"/hosts", "host.create"),
    ("DELETE", r"/hosts/bastion", "host.bastion.clear"),
    ("PUT", r"/hosts/(?P<target>[^/]+)", "host.update"),
    ("DELETE", r"/hosts/(?P<target>[^/]+)", "host.delete"),
    ("POST", r"/hosts/(?P<target>[^/]+)/bastion", "host.bastion.set"),
    ("PUT", r"/ids/rules/(?P<target>[^/]+)", "ids.rule.update"),
    ("PUT", r"/anomaly/config", "anomaly.config.update"),
    ("POST", r"/anomaly/baseline", "anomaly.baseline.generate"),
    ("PUT", r"/live", "live.configure"),
    ("PUT", r"/settings", "settings.update"),
    ("POST", r"/simulation/reset", "simulation.reset"),
    ("POST", r"/simulation/seed", "simulation.seed"),
    ("POST", r"/traffic/send", "traffic.send"),
    ("POST", r"/traffic/scenario/(?P<target>[^/]+)", "traffic.scenario.run"),
    ("POST", r"/alerts/(?P<target>[^/]+)/ack", "alerts.ack"),
    ("DELETE", r"/alerts", "alerts.clear"),
]]


def describe(method: str, path: str) -> tuple[str, Optional[str]]:
    """Return ``(action, target)`` for a request. Unknown routes fall back to ``"<method>:<path>"``."""
    method = method.upper()
    rel = path[4:] if path.startswith("/api") else path
    rel = rel.rstrip("/") or "/"
    for m, rx, action in _ACTIONS:
        if m == method:
            hit = rx.match(rel)
            if hit:
                return action, hit.groupdict().get("target")
    return f"{method.lower()}:{path}", None


def summarize_body(raw: bytes) -> Optional[dict[str, Any]]:
    """Compact, size-bounded summary of a JSON request body (strings truncated, secrets masked)."""
    if not raw or not raw.strip():
        return None
    if len(raw) > MAX_BODY_PARSE:
        return {"_omitted": f"body of {len(raw)} bytes"}
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return {"_unparsed": True, "bytes": len(raw)}

    def clip(v: Any, key: str = "") -> Any:
        if key and _SECRET_KEYS.search(key):
            return "***"
        if isinstance(v, str):
            return v if len(v) <= MAX_DETAIL_STR else v[:MAX_DETAIL_STR] + "..."
        if isinstance(v, dict):
            return {str(k): clip(x, str(k)) for k, x in list(v.items())[:50]}
        if isinstance(v, list):
            return [clip(x) for x in v[:20]]
        return v

    out = clip(data) if isinstance(data, dict) else {"body": clip(data)}
    text = json.dumps(out, default=str)
    if len(text) > MAX_DETAIL_BYTES:
        return {"_truncated": True, "preview": text[:MAX_DETAIL_BYTES - 100]}
    return out


# ---------------------------------------------------------------------- chains
def _last_entry(path: Path) -> Optional[dict[str, Any]]:
    """Last parseable chain entry in a file (reads only the tail)."""
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - 65536))
            tail = f.read().decode("utf-8", "replace")
    except OSError:
        return None
    for line in reversed(tail.splitlines()):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if isinstance(e, dict) and isinstance(e.get("seq"), int) and isinstance(e.get("hash"), str):
            return e
    return None


class _Chain:
    def __init__(self, directory: Path, kind: str) -> None:
        self.kind = kind
        self.path = directory / f"{kind}.log"
        self.lock = threading.RLock()
        last = _last_entry(self.path) or _last_entry(self.path.with_name(self.path.name + ".1"))
        self.seq = last["seq"] if last else 0
        self.prev = last["hash"] if last else ZERO_HASH
        self.handler = RotatingFileHandler(self.path, maxBytes=MAX_BYTES, backupCount=BACKUPS, encoding="utf-8")
        self.handler.setFormatter(logging.Formatter("%(message)s"))
        # Not registered with logging.getLogger(): private, never propagates, one per AuditLog instance.
        self.logger = logging.Logger(f"sentinel.{kind}.chain", logging.INFO)
        self.logger.propagate = False
        self.logger.addHandler(self.handler)

    def append(self, fields: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            entry: dict[str, Any] = {"seq": self.seq + 1, "ts": _now(), "kind": self.kind, **fields,
                                     "prev": self.prev}
            entry["hash"] = digest(entry)
            self.logger.info(json.dumps(entry, separators=(",", ":"), default=str))
            self.seq, self.prev = entry["seq"], entry["hash"]
            return entry

    def lines(self) -> list[str]:
        with self.lock:
            try:
                with open(self.path, "r", encoding="utf-8", errors="replace") as f:
                    return [ln for ln in f.read().splitlines() if ln.strip()]
            except FileNotFoundError:
                return []

    def close(self) -> None:
        with self.lock:
            self.logger.removeHandler(self.handler)
            self.handler.close()


class AuditLog:
    """Owns the log directory, the two hash chains and the human-readable ``app.log``."""

    def __init__(self, log_dir: Optional[str | Path] = None) -> None:
        self.dir = Path(log_dir) if log_dir else default_log_dir()
        self.dir.mkdir(parents=True, exist_ok=True)
        self._chains = {k: _Chain(self.dir, k) for k in KINDS}
        self._app_handler: Optional[RotatingFileHandler] = None

    # ------------------------------------------------------------------ writing
    def record_request(self, *, actor: str, method: str, path: str, status: int, duration_ms: float,
                       body: bytes = b"") -> Optional[dict[str, Any]]:
        action, target = describe(method, path)
        fields: dict[str, Any] = {"actor": actor, "method": method.upper(), "path": path, "action": action,
                                  "target": target, "status": status,
                                  "outcome": "success" if status < 400 else "failure",
                                  "duration_ms": round(duration_ms, 2)}
        detail = summarize_body(body)
        if detail is not None:
            fields["detail"] = detail
        return self._safe(lambda: self._chains["audit"].append(fields))

    def security(self, alert: dict[str, Any]) -> Optional[dict[str, Any]]:
        fields = {"alert_id": alert.get("id"), "rule_id": alert.get("rule_id"), "severity": alert.get("severity"),
                  "source": alert.get("source"), "title": alert.get("title"), "src_ip": alert.get("src_ip"),
                  "dst_ip": alert.get("dst_ip")}
        return self._safe(lambda: self._chains["security"].append(fields))

    @staticmethod
    def _safe(fn: Any) -> Optional[dict[str, Any]]:
        try:
            return fn()
        except Exception:  # auditing must never break a request or the live feed
            log.exception("audit write failed")
            return None

    # ------------------------------------------------------------------ reading
    def read(self, kind: str, limit: int = 100, offset: int = 0, q: str = "") -> tuple[list[dict[str, Any]], int]:
        """Newest-first page of entries from the current file plus the total number of matches."""
        needle = q.lower()
        matched: list[dict[str, Any]] = []
        for line in reversed(self._chains[kind].lines()):
            if needle and needle not in line.lower():
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if isinstance(entry, dict):
                matched.append(entry)
        return matched[offset:offset + limit], len(matched)

    def verify(self, kind: str) -> dict[str, Any]:
        """Recompute the chain over the current file. The first line's ``prev`` and ``seq`` are trusted."""
        rows = self._chains[kind].lines()
        count, bad = len(rows), None
        prev_hash: Optional[str] = None
        prev_seq: Optional[int] = None
        for line in rows:
            try:
                e = json.loads(line)
                ok = isinstance(e, dict) and isinstance(e.get("seq"), int) and isinstance(e.get("prev"), str)
            except ValueError:
                e, ok = None, False
            if ok:
                ok = e["hash"] == digest(e) if isinstance(e.get("hash"), str) else False
            if ok and prev_hash is not None:
                ok = e["prev"] == prev_hash and e["seq"] == (prev_seq or 0) + 1
            if not ok:
                bad = e["seq"] if isinstance(e, dict) and isinstance(e.get("seq"), int) \
                    else (prev_seq + 1 if prev_seq is not None else 0)
                break
            prev_hash, prev_seq = e["hash"], e["seq"]
        return {"kind": kind, "ok": bad is None, "entries": count, "first_bad_seq": bad}

    # ------------------------------------------------------------------ app.log
    def attach_app_log(self) -> None:
        """Route ``sentinel.*`` and uvicorn error logging to ``app.log`` (idempotent per instance)."""
        if self._app_handler is not None:
            return
        h = RotatingFileHandler(self.dir / "app.log", maxBytes=MAX_BYTES, backupCount=BACKUPS, encoding="utf-8")
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s"))
        h._sentinel_app = True  # type: ignore[attr-defined]
        for name in ("sentinel", "uvicorn.error"):
            lg = logging.getLogger(name)
            for old in [x for x in lg.handlers if getattr(x, "_sentinel_app", False)]:
                lg.removeHandler(old)
                old.close()
            lg.addHandler(h)
            if name == "sentinel" and (lg.level == logging.NOTSET or lg.level > logging.INFO):
                lg.setLevel(logging.INFO)
        self._app_handler = h
        logging.getLogger("sentinel").info("Sentinel logging started (log dir: %s)", self.dir)

    def close(self) -> None:
        if self._app_handler is not None:
            for name in ("sentinel", "uvicorn.error"):
                logging.getLogger(name).removeHandler(self._app_handler)
            self._app_handler.close()
            self._app_handler = None
        for ch in self._chains.values():
            ch.close()


# ---------------------------------------------------------------------- ASGI middleware
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


class AuditMiddleware:
    """Pure-ASGI middleware: audits every mutating ``/api`` request (except ``/api/audit*``).

    The request body is buffered (to summarise it) and replayed so the route still receives it.
    """

    def __init__(self, app: Any, audit: AuditLog) -> None:
        self.app, self.audit = app, audit

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        path = scope.get("path", "")
        if (scope["type"] != "http" or scope["method"] not in MUTATING or not path.startswith("/api")
                or path.startswith("/api/audit")):
            await self.app(scope, receive, send)
            return

        chunks: list[bytes] = []
        disconnect: Optional[dict[str, Any]] = None
        while True:
            msg = await receive()
            if msg["type"] != "http.request":
                disconnect = msg
                break
            chunks.append(msg.get("body", b""))
            if not msg.get("more_body", False):
                break
        body = b"".join(chunks)
        replayed = False

        async def replay() -> dict[str, Any]:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return disconnect if disconnect is not None else await receive()

        status = 500

        async def capture(message: dict[str, Any]) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        started = time.perf_counter()
        try:
            await self.app(scope, replay, capture)
        finally:
            try:
                client = scope.get("client")
                self.audit.record_request(actor=client[0] if client else "unknown", method=scope["method"],
                                          path=path, status=status,
                                          duration_ms=(time.perf_counter() - started) * 1000, body=body)
            except Exception:
                log.exception("audit middleware failed")
