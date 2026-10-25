"""Traffic generation, scenarios, and the detection pipeline:
packet -> firewall verdict -> record -> rule IDS -> anomaly IDS -> alerts (persisted + broadcast).
"""
from __future__ import annotations

import random
from typing import Any, Optional

import numpy as np

from . import firewall as fw
from .alert_bus import AlertBus, EventBus
from .audit import AuditLog
from .anomaly import AnomalyEngine
from .clock import Clock, iso
from .db import Database
from .firewall import FirewallEngine
from .ids_rules import IdsEngine, seed_ids_rules

DEFAULT_HOSTS = [
    ("bastion-gw", "10.0.0.5", "bastion", True, "Hardened SSH/VPN gateway - the only admin entry point"),
    ("web-01", "10.0.1.10", "web", False, "Public web server"),
    ("web-02", "10.0.1.11", "web", False, "Public web server (replica)"),
    ("db-01", "10.0.2.20", "database", False, "Primary database"),
    ("ssh-jump", "10.0.3.30", "ssh", False, "Developer SSH box"),
    ("ws-finance", "192.168.1.100", "workstation", False, "Finance workstation"),
    ("attacker-ext", "203.0.113.50", "external", False, "Simulated external attacker"),
    ("partner-ext", "198.51.100.7", "external", False, "Trusted external partner"),
]

# name, action, protocol, src, dst, src_port, dst_port, priority, description
DEFAULT_RULES = [
    ("Block compromised workstation", "deny", "ANY", "192.168.1.100", "ANY", "ANY", "ANY", 10,
     "Quarantine ws-finance after suspected compromise"),
    ("Block Telnet", "deny", "TCP", "ANY", "ANY", "ANY", "23", 20, "Telnet is cleartext and forbidden"),
    ("Block RDP", "deny", "TCP", "ANY", "ANY", "ANY", "3389", 30, "No remote desktop across the perimeter"),
    ("Block SMB", "deny", "TCP", "ANY", "ANY", "ANY", "445", 31, "No SMB across the perimeter"),
    ("Allow SSH to bastion", "allow", "TCP", "ANY", "10.0.0.5", "ANY", "22", 40, "Admin access via the bastion only"),
    ("Allow HTTP to web tier", "allow", "TCP", "ANY", "10.0.1.0/24", "ANY", "80", 50, "Public web"),
    ("Allow HTTPS to web tier", "allow", "TCP", "ANY", "10.0.1.0/24", "ANY", "443", 51, "Public web (TLS)"),
    ("Allow DNS", "allow", "UDP", "ANY", "ANY", "ANY", "53", 60, "Name resolution"),
    ("Allow internal ICMP", "allow", "ICMP", "10.0.0.0/8", "ANY", "ANY", "ANY", 70, "Ping from internal networks"),
]

BASELINE_RATES = {"10.0.1.10": 0.5, "192.168.1.100": 0.4, "198.51.100.7": 1.0, "203.0.113.50": 0.2}

ATTACKER, PARTNER = "203.0.113.50", "198.51.100.7"
# Extra external attackers so back-to-back demo scenarios are not swallowed by per-(rule, src) cooldowns.
FLOODER, PROBER, BYPASSER = "203.0.113.51", "203.0.113.52", "203.0.113.53"
BASTION, WEB1, WEB2, DB, JUMP, WS = "10.0.0.5", "10.0.1.10", "10.0.1.11", "10.0.2.20", "10.0.3.30", "192.168.1.100"

TYPE_DEFAULTS: dict[str, tuple[str, Optional[int]]] = {
    "http": ("TCP", 80), "https": ("TCP", 443), "ssh_login": ("TCP", 22), "telnet": ("TCP", 23),
    "port_scan": ("TCP", None), "ping": ("ICMP", None), "dns": ("UDP", 53), "data_transfer": ("TCP", 443),
    "syn_flood": ("TCP", 80),
}
INTERESTING_PORTS = [22, 23, 80, 443, 445, 3389, 3306, 5432, 21, 25, 53, 110, 135, 139, 143, 993, 1433, 5900,
                     8080, 8443]

SCENARIOS = [
    dict(name="normal", title="Normal business traffic", type_hint="http",
         description="Benign web, DNS, ping and SSH traffic across the hosts; should raise no alerts."),
    dict(name="brute_force", title="SSH brute force", type_hint="ssh_login",
         description="External attacker hammers the bastion with failed SSH logins (IDS-001, login-rate anomaly)."),
    dict(name="port_scan", title="Port scan", type_hint="port_scan",
         description="Attacker probes 40 ports on web-01 (IDS-003, IDS-006, IDS-008, IDS-009, port anomaly)."),
    dict(name="ddos", title="DDoS (SYN + ICMP flood)", type_hint="syn_flood",
         description="150 SYN packets and 60 pings at web-01 (IDS-004, IDS-006, IDS-007, packet-rate anomaly)."),
    dict(name="exfiltration", title="Data exfiltration", type_hint="data_transfer",
         description="db-01 pushes 3 x 50 MB to an external host (IDS-005, bytes-per-destination anomaly)."),
    dict(name="telnet_probe", title="Telnet probe", type_hint="telnet",
         description="Attacker tries Telnet on several internal hosts (IDS-002, IDS-008)."),
    dict(name="bastion_bypass", title="Bastion bypass", type_hint="ssh_login",
         description="Attacker tries to reach internal hosts directly instead of the bastion (IDS-008, IDS-009)."),
]


class Simulator:
    def __init__(self, db: Database, fw_engine: FirewallEngine, ids: IdsEngine, anomaly: AnomalyEngine,
                 bus: AlertBus, clock: Clock, seed: Optional[int] = None,
                 events: Optional[EventBus] = None, audit: Optional[AuditLog] = None) -> None:
        self.db, self.fw, self.ids, self.anomaly, self.bus, self.clock = db, fw_engine, ids, anomaly, bus, clock
        self.events = events
        self.audit = audit  # optional security log; every raised alert is written to it
        self.rng = random.Random(seed)
        self.np_rng = np.random.default_rng(seed)
        self._fw_alert_last: dict[tuple[str, str], float] = {}

    # ------------------------------------------------------------------ packet building
    def _spec(self, type_: str, src: str, dst: str, dst_port: Optional[int] = None, protocol: Optional[str] = None,
              success: Optional[bool] = None, nbytes: Optional[int] = None) -> dict[str, Any]:
        proto, port = TYPE_DEFAULTS[type_]
        if dst_port is not None:
            port = dst_port
        if protocol and protocol != "ANY":
            proto = protocol
        if proto == "ICMP":
            port = None
        if nbytes is None:
            nbytes = {"data_transfer": 5_000_000, "syn_flood": 60, "port_scan": 60, "ping": 84, "dns": 90,
                      "ssh_login": 400, "telnet": 120}.get(type_) or self.rng.randint(300, 2500)
        if success is None:
            success = type_ not in ("ssh_login", "port_scan")
        return dict(src_ip=src, dst_ip=dst, src_port=self.rng.randint(32768, 60999), dst_port=port,
                    protocol=proto, type=type_, bytes=int(nbytes), success=success)

    def build_send(self, type_: str, src: str, dst: str, count: int, dst_port: Optional[int] = None,
                   protocol: Optional[str] = None, success: Optional[bool] = None,
                   nbytes: Optional[int] = None) -> list[dict[str, Any]]:
        if type_ == "port_scan":
            # Random distinct ports; the first is a random sensitive port (IDS-009 bait).
            pool = list(range(1, 1025)) if count <= 1000 else list(range(1, 65536))
            ports = [self.rng.choice([3389, 445, 3306, 5432])]
            ports += self.rng.sample([p for p in pool if p != ports[0]], count - 1)
            self.rng.shuffle(ports)
            return [self._spec("port_scan", src, dst, dst_port=p, protocol=protocol, success=success, nbytes=nbytes)
                    for p in ports]
        return [self._spec(type_, src, dst, dst_port, protocol, success, nbytes) for _ in range(count)]

    def build_scenario(self, name: str) -> list[dict[str, Any]]:
        s, r = self._spec, self.rng
        if name == "normal":
            specs = [s("https", PARTNER, WEB1) for _ in range(2)] + [s("http", PARTNER, WEB2)]
            specs += [s("ssh_login", PARTNER, BASTION, success=True), s("dns", WEB1, WEB2), s("dns", DB, BASTION),
                      s("ping", BASTION, WEB1), s("ping", BASTION, DB), s("http", WEB1, WEB2),
                      s("http", WEB1, JUMP)]  # default-deny block (not 'notable', so no FW alert)
            r.shuffle(specs)
            return specs
        if name == "brute_force":
            return [s("ssh_login", ATTACKER, BASTION, success=False) for _ in range(12)]
        if name == "port_scan":
            return self.build_send("port_scan", ATTACKER, WEB1, 40)
        if name == "ddos":
            return ([s("syn_flood", FLOODER, WEB1) for _ in range(150)] + [s("ping", FLOODER, WEB1)
                                                                              for _ in range(60)])
        if name == "exfiltration":
            return [s("data_transfer", DB, ATTACKER, nbytes=50 * 1024 * 1024) for _ in range(3)]
        if name == "telnet_probe":
            return [s("telnet", PROBER, h) for h in (WEB1, DB, JUMP) for _ in range(2)]
        if name == "bastion_bypass":
            return ([s("ssh_login", BYPASSER, h, success=False) for h in (JUMP, DB, WEB1) for _ in range(2)]
                    + [s("https", BYPASSER, DB, dst_port=p) for p in (3306, 5432, 3389)])
        raise KeyError(name)

    # ------------------------------------------------------------------ pipeline
    def process(self, specs: list[dict[str, Any]], ts: Optional[float] = None,
                evaluate_anomaly: bool = True) -> list[dict[str, Any]]:
        """Run packets through firewall + IDS + anomaly detection. Returns Packet dicts (alerts embedded)."""
        results: list[dict[str, Any]] = []
        fresh_alerts: list[dict[str, Any]] = []
        with self.db.transaction():
            rules, policy, bastion_ip = self.fw.snapshot()
            hits: dict[int, int] = {}
            for spec in specs:
                t = ts if ts is not None else self.clock()
                v = fw.evaluate(rules, policy, spec, bastion_ip)
                pkt = {**spec, "ts": t, **v.as_dict()}
                if v.verdict == "blocked":
                    pkt["success"] = False
                if v.matched_rule_id is not None:
                    hits[v.matched_rule_id] = hits.get(v.matched_rule_id, 0) + 1
                pkt["id"] = self.db.insert_packet(pkt)
                self.anomaly.record(t, pkt)
                found = self.ids.evaluate(pkt, bastion_ip)
                fwa = self._firewall_alert(pkt)
                if fwa:
                    found.append(fwa)
                pkt_out = {**pkt, "ts": iso(t), "alerts": []}
                for a in found:
                    saved = self.db.insert_alert(a, pkt["id"])
                    pkt_out["alerts"].append(saved)
                    fresh_alerts.append(saved)
                results.append(pkt_out)
            for rid, n in hits.items():
                self.db.execute("UPDATE firewall_rules SET hit_count = hit_count + ? WHERE id=?", (n, rid))
            if evaluate_anomaly and results:
                for a in self.anomaly.detect():
                    saved = self.db.insert_alert(a, results[-1]["id"])
                    results[-1]["alerts"].append(saved)
                    fresh_alerts.append(saved)
            self.db.enforce_retention()
        for a in fresh_alerts:
            self.bus.publish(a)
            if self.events is not None:
                self.events.publish("alert", a)
            if self.audit is not None:
                self.audit.security(a)
        return results

    def _firewall_alert(self, p: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Low-severity FW-BLOCK alert, only for notable blocks and at most once per 30 s per (src, reason)."""
        if p["verdict"] != "blocked":
            return None
        name = p["matched_rule_name"] or ""
        if not (name.lower().startswith("block") or p["reason"] == "Bastion policy"):
            return None
        key = (p["src_ip"], name or p["reason"])
        last = self._fw_alert_last.get(key)
        if last is not None and p["ts"] - last < 30:
            return None
        self._fw_alert_last[key] = p["ts"]
        what = name or p["reason"]
        return dict(ts=p["ts"], source="firewall", severity="low", rule_id="FW-BLOCK",
                    title=f"Firewall blocked traffic: {what}",
                    description=f"{p['protocol']} {p['src_ip']} -> {p['dst_ip']}:{p['dst_port']} denied ({p['reason']}).",
                    src_ip=p["src_ip"], dst_ip=p["dst_ip"], metric=None, value=None, threshold=None)

    # ------------------------------------------------------------------ lifecycle
    def reset(self, keep_rules: bool = True) -> None:
        with self.db.transaction():
            self.db.execute("DELETE FROM packets")
            self.db.execute("DELETE FROM alerts")
            self.db.execute("UPDATE firewall_rules SET hit_count=0")
            if not keep_rules:
                self.db.execute("DELETE FROM firewall_rules")
                self.db.execute("DELETE FROM hosts")
        self.ids.reset()
        self.anomaly.reset()
        self._fw_alert_last.clear()

    def baseline(self, minutes: int) -> int:
        with self.db.lock:
            return self.anomaly.generate_baseline(minutes, self.np_rng, BASELINE_RATES)

    def seed(self) -> None:
        """Default hosts, rules, policy, IDS config, baseline + a little back-dated traffic and one incident."""
        self.reset(keep_rules=False)
        now = self.clock()
        with self.db.transaction():
            for name, ip, role, bast, desc in DEFAULT_HOSTS:
                self.db.execute("INSERT INTO hosts(name,ip,role,is_bastion,description) VALUES(?,?,?,?,?)",
                                (name, ip, role, int(bast), desc))
            for name, action, proto, src, dst, sp, dp, prio, desc in DEFAULT_RULES:
                self.db.execute(
                    "INSERT INTO firewall_rules(name,action,protocol,src_ip,dst_ip,src_port,dst_port,priority,enabled,"
                    "description,hit_count,created_at) VALUES(?,?,?,?,?,?,?,?,1,?,0,?)",
                    (name, action, proto, src, dst, sp, dp, prio, desc, iso(now)))
            self.db.set_setting("policy", {"default_action": "deny", "bastion_mode": False})
            seed_ids_rules(self.db)
        self.ids.reload()
        self.baseline(5)
        for offset, scenario in ((120, "normal"), (90, "telnet_probe"), (80, "normal"), (45, "normal")):
            self.process(self.build_scenario(scenario), ts=now - offset, evaluate_anomaly=False)
