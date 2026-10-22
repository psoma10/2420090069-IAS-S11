"""End-to-end smoke test against a running Sentinel backend (stdlib only).

Usage:  python qa/smoke_test.py [base_url]     (default http://localhost:48731)
Exit code 0 = all checks passed.
"""
import json
import sys
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:48731").rstrip("/")
failures = 0


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b"null")


def check(name, cond):
    global failures
    print(("PASS  " if cond else "FAIL  ") + name)
    if not cond:
        failures += 1


check("health ok", call("GET", "/api/health")["status"] == "ok")
call("POST", "/api/simulation/reset", {"keep_rules": True})
call("POST", "/api/simulation/seed")
check("seeded hosts", len(call("GET", "/api/hosts")) >= 8)
check("seeded ids rules (9)", len(call("GET", "/api/ids/rules")) >= 9)

t = call("POST", "/api/firewall/test", {"src_ip": "203.0.113.50", "dst_ip": "10.0.1.10",
                                         "dst_port": 80, "protocol": "TCP"})
check("firewall dry-run allows web traffic", t["verdict"] == "allowed")

r = call("POST", "/api/traffic/send", {"type": "ssh_login", "src_ip": "203.0.113.50",
                                        "dst_ip": "10.0.0.5", "count": 6})
check("send returns packets", r["summary"]["total"] == 6)
alerts = call("GET", "/api/alerts?limit=50")
check("SSH brute force raised IDS-001", any(a["rule_id"] == "IDS-001" for a in alerts))

call("POST", "/api/traffic/scenario/port_scan")
check("port scan raised IDS-003",
      any(a["rule_id"] == "IDS-003" for a in call("GET", "/api/alerts?limit=100")))

call("POST", "/api/anomaly/baseline", {"minutes": 5})
m = call("GET", "/api/anomaly/metrics?window=60")
check("anomaly metrics present", len(m["metrics"]) == 5)

s = call("GET", "/api/stats/summary")
check("stats consistent", s["packets_total"] == s["allowed"] + s["blocked"])

bad = None
try:
    call("POST", "/api/firewall/rules", {"name": "x", "action": "allow", "protocol": "TCP",
                                         "src_ip": "999.1.1.1", "dst_ip": "ANY",
                                         "src_port": "ANY", "dst_port": "80",
                                         "priority": 1, "enabled": True, "description": ""})
except urllib.error.HTTPError as e:
    bad = e.code
check("invalid IP rejected with 422", bad == 422)

print(f"\n{failures} failure(s)")
sys.exit(1 if failures else 0)
