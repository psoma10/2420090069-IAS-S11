"""Signature (rule-based) IDS: sliding-window counters with a per-(rule, key) cooldown."""
from __future__ import annotations

from collections import deque
from typing import Any, Optional

from .db import Database
from .firewall import is_external

MB = 1024 * 1024
SENSITIVE_PORTS = {3389, 445, 3306, 5432}
WEB_PORTS = {80, 443}

# id, name, description, severity, window_seconds, threshold, category
DEFAULT_IDS_RULES: list[dict[str, Any]] = [
    dict(id="IDS-001", name="SSH brute force", severity="high", window_seconds=60, threshold=5,
         category="Authentication",
         description="5 or more failed ssh_login attempts from the same source within 60 seconds."),
    dict(id="IDS-002", name="Telnet traffic", severity="medium", window_seconds=60, threshold=None,
         category="Insecure Protocol",
         description="Any packet destined to TCP port 23 (cleartext remote login)."),
    dict(id="IDS-003", name="Port scan", severity="high", window_seconds=30, threshold=10,
         category="Reconnaissance",
         description="10 or more distinct destination ports probed by one source within 30 seconds."),
    dict(id="IDS-004", name="SYN flood", severity="critical", window_seconds=10, threshold=100,
         category="Denial of Service",
         description="100 or more SYN packets to the same destination within 10 seconds."),
    dict(id="IDS-005", name="Suspicious data exfiltration", severity="high", window_seconds=60, threshold=10,
         category="Data Exfiltration",
         description="A single transfer larger than 10 MB (threshold is in MB) to an external IP address."),
    dict(id="IDS-006", name="Blocked-traffic storm", severity="medium", window_seconds=30, threshold=20,
         category="Policy Violation",
         description="20 or more firewall-denied packets from the same source within 30 seconds."),
    dict(id="IDS-007", name="ICMP flood", severity="medium", window_seconds=10, threshold=50,
         category="Denial of Service",
         description="50 or more ICMP packets from the same source within 10 seconds."),
    dict(id="IDS-008", name="Bastion bypass attempt", severity="high", window_seconds=60, threshold=None,
         category="Access Control",
         description="An external source attempts a non-web service on an internal host that is not the bastion."),
    dict(id="IDS-009", name="Sensitive port probe", severity="medium", window_seconds=60, threshold=None,
         category="Reconnaissance",
         description="External source accessing port 3389, 445, 3306 or 5432."),
]


def seed_ids_rules(db: Database) -> None:
    with db.transaction():
        db.execute("DELETE FROM ids_rules")
        for r in DEFAULT_IDS_RULES:
            db.execute(
                "INSERT INTO ids_rules(id,name,description,severity,enabled,window_seconds,threshold,category)"
                " VALUES(?,?,?,?,1,?,?,?)",
                (r["id"], r["name"], r["description"], r["severity"], r["window_seconds"], r["threshold"],
                 r["category"]),
            )


class IdsEngine:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._events: dict[tuple[str, str], deque[tuple[float, Any]]] = {}
        self._last: dict[tuple[str, str], float] = {}
        self.rules: dict[str, dict[str, Any]] = {}
        self.reload()

    def reload(self) -> None:
        if not self.db.list_ids_rules():
            seed_ids_rules(self.db)
        self.rules = {r["id"]: r for r in self.db.list_ids_rules()}

    def reset(self) -> None:
        self._events.clear()
        self._last.clear()

    # ------------------------------------------------------------------ helpers
    def _window(self, rule: dict[str, Any], key: str, ts: float, item: Any) -> deque[tuple[float, Any]]:
        dq = self._events.setdefault((rule["id"], key), deque())
        dq.append((ts, item))
        cutoff = ts - rule["window_seconds"]
        while dq and dq[0][0] < cutoff:
            dq.popleft()
        return dq

    def _cooled(self, rule: dict[str, Any], key: str, ts: float) -> bool:
        """True when the rule may fire for ``key`` (and records the firing)."""
        k = (rule["id"], key)
        last = self._last.get(k)
        if last is not None and ts - last < rule["window_seconds"]:
            return False
        self._last[k] = ts
        return True

    # ------------------------------------------------------------------ evaluation
    def evaluate(self, p: dict[str, Any], bastion_ip: Optional[str] = None) -> list[dict[str, Any]]:
        """Run every enabled rule against a packet dict; returns alert dicts (without id)."""
        out: list[dict[str, Any]] = []
        ts, src, dst = p["ts"], p["src_ip"], p["dst_ip"]
        for rule in self.rules.values():
            if not rule["enabled"]:
                continue
            hit = getattr(self, "_" + rule["id"].replace("-", "_").lower())(rule, p, bastion_ip)
            if hit is None:
                continue
            key, desc, metric, value, thr = hit
            if not self._cooled(rule, key, ts):
                continue
            out.append(dict(ts=ts, source="rule", severity=rule["severity"], rule_id=rule["id"], title=rule["name"],
                            description=desc, src_ip=src, dst_ip=dst, metric=metric, value=value, threshold=thr))
        return out

    def _ids_001(self, r, p, _b):
        if p["type"] != "ssh_login" or p["success"]:
            return None
        dq = self._window(r, p["src_ip"], p["ts"], 1)
        if len(dq) >= r["threshold"]:
            return (p["src_ip"], f"{len(dq)} failed SSH logins from {p['src_ip']} in {r['window_seconds']}s "
                    f"(last target {p['dst_ip']}).", "failed_logins", len(dq), r["threshold"])

    def _ids_002(self, r, p, _b):
        if p["dst_port"] == 23:
            return (p["src_ip"], f"Telnet (TCP/23) traffic {p['src_ip']} -> {p['dst_ip']}; credentials travel in cleartext.",
                    "dst_port", 23, None)

    def _ids_003(self, r, p, _b):
        if p["dst_port"] is None:
            return None
        dq = self._window(r, p["src_ip"], p["ts"], p["dst_port"])
        distinct = len({x for _, x in dq})
        if distinct >= r["threshold"]:
            return (p["src_ip"], f"{p['src_ip']} probed {distinct} distinct ports in {r['window_seconds']}s.",
                    "distinct_ports", distinct, r["threshold"])

    def _ids_004(self, r, p, _b):
        if p["type"] != "syn_flood":
            return None
        dq = self._window(r, p["dst_ip"], p["ts"], 1)
        if len(dq) >= r["threshold"]:
            # Cooldown is keyed on the victim: a flood from many sources must raise one alert.
            return (p["dst_ip"], f"{len(dq)} SYN packets to {p['dst_ip']} in {r['window_seconds']}s "
                    f"(latest source {p['src_ip']}).", "syn_per_window", len(dq), r["threshold"])

    def _ids_005(self, r, p, _b):
        if p["bytes"] > r["threshold"] * MB and is_external(p["dst_ip"]):
            return (p["src_ip"], f"{p['bytes'] / MB:.1f} MB sent {p['src_ip']} -> external {p['dst_ip']}.",
                    "bytes", p["bytes"], r["threshold"] * MB)

    def _ids_006(self, r, p, _b):
        if p["verdict"] != "blocked":
            return None
        dq = self._window(r, p["src_ip"], p["ts"], 1)
        if len(dq) >= r["threshold"]:
            return (p["src_ip"], f"{len(dq)} firewall-denied packets from {p['src_ip']} in {r['window_seconds']}s.",
                    "blocked_packets", len(dq), r["threshold"])

    def _ids_007(self, r, p, _b):
        if p["protocol"] != "ICMP":
            return None
        dq = self._window(r, p["src_ip"], p["ts"], 1)
        if len(dq) >= r["threshold"]:
            return (p["src_ip"], f"{len(dq)} ICMP packets from {p['src_ip']} in {r['window_seconds']}s.",
                    "icmp_packets", len(dq), r["threshold"])

    def _ids_008(self, r, p, bastion_ip):
        if not is_external(p["src_ip"]) or is_external(p["dst_ip"]) or p["dst_ip"] == bastion_ip:
            return None
        host = self.db.host_by_ip(p["dst_ip"])
        if p["dst_port"] in WEB_PORTS and host and host["role"] == "web":
            return None  # published web services on web-role hosts are reachable without the bastion
        return (p["src_ip"], f"External {p['src_ip']} contacted internal {p['dst_ip']}:{p['dst_port']} "
                f"directly instead of going through the bastion ({bastion_ip or 'none configured'}).",
                "dst_port", p["dst_port"], None)

    def _ids_009(self, r, p, _b):
        if p["dst_port"] in SENSITIVE_PORTS and is_external(p["src_ip"]):
            return (p["src_ip"], f"External {p['src_ip']} accessed sensitive port {p['dst_port']} on {p['dst_ip']}.",
                    "dst_port", p["dst_port"], None)
