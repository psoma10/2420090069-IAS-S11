"""SQLite schema and data-access helpers (stdlib sqlite3, one shared connection guarded by an RLock)."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional, Sequence

from .clock import iso

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "sentinel.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS hosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ip TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL, is_bastion INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS firewall_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, action TEXT NOT NULL, protocol TEXT NOT NULL,
  src_ip TEXT NOT NULL, dst_ip TEXT NOT NULL, src_port TEXT NOT NULL, dst_port TEXT NOT NULL,
  priority INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, description TEXT NOT NULL DEFAULT '',
  hit_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS packets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, src_ip TEXT, dst_ip TEXT, src_port INTEGER,
  dst_port INTEGER, protocol TEXT, type TEXT, bytes INTEGER, success INTEGER, verdict TEXT,
  matched_rule_id INTEGER, matched_rule_name TEXT, reason TEXT);
CREATE INDEX IF NOT EXISTS idx_packets_ts ON packets(ts);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, source TEXT, severity TEXT, rule_id TEXT,
  title TEXT, description TEXT, src_ip TEXT, dst_ip TEXT, metric TEXT, value REAL, threshold REAL,
  acknowledged INTEGER NOT NULL DEFAULT 0, packet_id INTEGER);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ids_rules (
  id TEXT PRIMARY KEY, name TEXT, description TEXT, severity TEXT, enabled INTEGER,
  window_seconds INTEGER, threshold INTEGER, category TEXT);
"""

DEFAULT_PACKET_RETENTION = 5000
DEFAULT_ALERT_RETENTION = 1000


def _rule(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["enabled"] = bool(d["enabled"])
    return d


def _host(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["is_bastion"] = bool(d["is_bastion"])
    return d


def _packet(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["ts"] = iso(d["ts"])
    d["success"] = bool(d["success"])
    d["alerts"] = []
    return d


def _alert(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d.pop("packet_id", None)
    d["ts"] = iso(d["ts"])
    d["acknowledged"] = bool(d["acknowledged"])
    return d


class Database:
    def __init__(self, path: str | Path = DEFAULT_DB_PATH) -> None:
        self.path = str(path)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self._depth = 0
        with self.lock:
            self.conn.execute("PRAGMA synchronous=OFF")
            self.conn.executescript(SCHEMA)

    # ------------------------------------------------------------------ primitives
    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self.lock:
            if self._depth == 0:
                self.conn.execute("BEGIN")
            self._depth += 1
            try:
                yield
            except BaseException:
                self._depth -= 1
                if self._depth == 0:
                    self.conn.execute("ROLLBACK")
                raise
            else:
                self._depth -= 1
                if self._depth == 0:
                    self.conn.execute("COMMIT")

    def execute(self, sql: str, params: Sequence[Any] = ()) -> sqlite3.Cursor:
        with self.lock:
            return self.conn.execute(sql, params)

    def query(self, sql: str, params: Sequence[Any] = ()) -> list[sqlite3.Row]:
        with self.lock:
            return self.conn.execute(sql, params).fetchall()

    def query_one(self, sql: str, params: Sequence[Any] = ()) -> Optional[sqlite3.Row]:
        with self.lock:
            return self.conn.execute(sql, params).fetchone()

    def scalar(self, sql: str, params: Sequence[Any] = ()) -> Any:
        row = self.query_one(sql, params)
        return row[0] if row else None

    # ------------------------------------------------------------------ settings
    def get_setting(self, key: str, default: Any) -> Any:
        row = self.query_one("SELECT value FROM settings WHERE key=?", (key,))
        return json.loads(row["value"]) if row else default

    def set_setting(self, key: str, value: Any) -> None:
        self.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", (key, json.dumps(value)))

    def get_policy(self) -> dict[str, Any]:
        p = self.get_setting("policy", {})
        return {"default_action": p.get("default_action", "deny"), "bastion_mode": bool(p.get("bastion_mode", False))}

    # ------------------------------------------------------------------ hosts
    def list_hosts(self) -> list[dict[str, Any]]:
        return [_host(r) for r in self.query("SELECT * FROM hosts ORDER BY id")]

    def get_host(self, host_id: int) -> Optional[dict[str, Any]]:
        r = self.query_one("SELECT * FROM hosts WHERE id=?", (host_id,))
        return _host(r) if r else None

    def get_bastion(self) -> Optional[dict[str, Any]]:
        r = self.query_one("SELECT * FROM hosts WHERE is_bastion=1 LIMIT 1")
        return _host(r) if r else None

    def host_by_ip(self, ip: str) -> Optional[dict[str, Any]]:
        r = self.query_one("SELECT * FROM hosts WHERE ip=?", (ip,))
        return _host(r) if r else None

    # ------------------------------------------------------------------ firewall rules
    def list_rules(self) -> list[dict[str, Any]]:
        return [_rule(r) for r in self.query("SELECT * FROM firewall_rules ORDER BY priority, id")]

    def get_rule(self, rule_id: int) -> Optional[dict[str, Any]]:
        r = self.query_one("SELECT * FROM firewall_rules WHERE id=?", (rule_id,))
        return _rule(r) if r else None

    # ------------------------------------------------------------------ packets
    def insert_packet(self, p: dict[str, Any]) -> int:
        cur = self.execute(
            "INSERT INTO packets(ts,src_ip,dst_ip,src_port,dst_port,protocol,type,bytes,success,verdict,"
            "matched_rule_id,matched_rule_name,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (p["ts"], p["src_ip"], p["dst_ip"], p["src_port"], p["dst_port"], p["protocol"], p["type"],
             p["bytes"], int(p["success"]), p["verdict"], p["matched_rule_id"], p["matched_rule_name"], p["reason"]),
        )
        return int(cur.lastrowid or 0)

    @staticmethod
    def _packet_where(verdict: str, src_ip: str, ip: str) -> tuple[str, list[Any]]:
        sql, params = " WHERE 1=1", []
        if verdict:
            sql += " AND verdict=?"
            params.append(verdict)
        if src_ip:
            sql += " AND src_ip=?"
            params.append(src_ip)
        if ip:
            sql += " AND (src_ip=? OR dst_ip=?)"
            params += [ip, ip]
        return sql, params

    def count_packets(self, verdict: str = "", src_ip: str = "", ip: str = "") -> int:
        where, params = self._packet_where(verdict, src_ip, ip)
        return int(self.scalar("SELECT COUNT(*) FROM packets" + where, params) or 0)

    def list_packets(self, limit: int = 100, verdict: str = "", src_ip: str = "", offset: int = 0,
                     ip: str = "") -> list[dict[str, Any]]:
        where, params = self._packet_where(verdict, src_ip, ip)
        sql = "SELECT * FROM packets" + where + " ORDER BY id DESC LIMIT ? OFFSET ?"
        params += [limit, offset]
        with self.lock:
            packets = [_packet(r) for r in self.conn.execute(sql, params).fetchall()]
            if packets:
                ids = [p["id"] for p in packets]
                marks = ",".join("?" * len(ids))
                by_pkt: dict[int, list[dict[str, Any]]] = {}
                for r in self.conn.execute(
                    f"SELECT * FROM alerts WHERE packet_id IN ({marks}) ORDER BY id", ids
                ).fetchall():
                    by_pkt.setdefault(r["packet_id"], []).append(_alert(r))
                for p in packets:
                    p["alerts"] = by_pkt.get(p["id"], [])
        return packets

    # ------------------------------------------------------------------ alerts
    def insert_alert(self, a: dict[str, Any], packet_id: Optional[int]) -> dict[str, Any]:
        cur = self.execute(
            "INSERT INTO alerts(ts,source,severity,rule_id,title,description,src_ip,dst_ip,metric,value,threshold,"
            "acknowledged,packet_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?)",
            (a["ts"], a["source"], a["severity"], a["rule_id"], a["title"], a["description"], a.get("src_ip"),
             a.get("dst_ip"), a.get("metric"), a.get("value"), a.get("threshold"), packet_id),
        )
        return self.get_alert(int(cur.lastrowid or 0)) or {}

    def get_alert(self, alert_id: int) -> Optional[dict[str, Any]]:
        r = self.query_one("SELECT * FROM alerts WHERE id=?", (alert_id,))
        return _alert(r) if r else None

    @staticmethod
    def _alert_where(severity: str, source: str, acknowledged: Optional[bool], ip: str) -> tuple[str, list[Any]]:
        sql, params = " WHERE 1=1", []
        if severity:
            sql += " AND severity=?"
            params.append(severity)
        if source:
            sql += " AND source=?"
            params.append(source)
        if acknowledged is not None:
            sql += " AND acknowledged=?"
            params.append(int(acknowledged))
        if ip:
            sql += " AND (src_ip=? OR dst_ip=?)"
            params += [ip, ip]
        return sql, params

    def count_alerts(self, severity: str = "", source: str = "", acknowledged: Optional[bool] = None,
                     ip: str = "") -> int:
        where, params = self._alert_where(severity, source, acknowledged, ip)
        return int(self.scalar("SELECT COUNT(*) FROM alerts" + where, params) or 0)

    def list_alerts(
        self, limit: int = 100, severity: str = "", source: str = "", acknowledged: Optional[bool] = None,
        offset: int = 0, ip: str = ""
    ) -> list[dict[str, Any]]:
        where, params = self._alert_where(severity, source, acknowledged, ip)
        params += [limit, offset]
        return [_alert(r) for r in self.query(
            "SELECT * FROM alerts" + where + " ORDER BY id DESC LIMIT ? OFFSET ?", params)]

    # ------------------------------------------------------------------ retention settings
    def get_retention(self) -> dict[str, int]:
        r = self.get_setting("retention", {})
        return {"packet_retention": int(r.get("packet_retention", DEFAULT_PACKET_RETENTION)),
                "alert_retention": int(r.get("alert_retention", DEFAULT_ALERT_RETENTION))}

    def set_retention(self, packet_retention: int, alert_retention: int) -> dict[str, int]:
        self.set_setting("retention", {"packet_retention": packet_retention, "alert_retention": alert_retention})
        self.enforce_retention()
        return self.get_retention()

    def enforce_retention(self) -> None:
        """Delete the oldest packets/alerts beyond the configured retention."""
        r = self.get_retention()
        for table, n in (("packets", r["packet_retention"]), ("alerts", r["alert_retention"])):
            self.execute(
                f"DELETE FROM {table} WHERE id <= (SELECT id FROM {table} ORDER BY id DESC LIMIT 1 OFFSET ?)", (n,))

    # ------------------------------------------------------------------ IDS rule config
    def list_ids_rules(self) -> list[dict[str, Any]]:
        out = []
        for r in self.query("SELECT * FROM ids_rules ORDER BY id"):
            d = dict(r)
            d["enabled"] = bool(d["enabled"])
            out.append(d)
        return out
