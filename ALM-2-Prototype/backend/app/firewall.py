"""Firewall rule matching: CIDR, port ranges, priority order, default policy and bastion policy."""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Optional

RFC1918 = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]


# --------------------------------------------------------------------------- validation
def validate_ip(value: str) -> str:
    """Single IP address (v4/v6)."""
    try:
        return str(ipaddress.ip_address(str(value).strip()))
    except ValueError:
        raise ValueError(f"'{value}' is not a valid IP address") from None


def validate_ip_spec(value: str) -> str:
    """``ANY``, a single IP or a CIDR block."""
    v = str(value).strip()
    if v.upper() == "ANY":
        return "ANY"
    try:
        ipaddress.ip_network(v, strict=False)
    except ValueError:
        raise ValueError(f"'{value}' is not 'ANY', a valid IP address or a valid CIDR (e.g. 10.0.1.0/24)") from None
    return v


def validate_port_spec(value: Any) -> str:
    """``ANY``, a port ``80`` or a range ``1000-2000`` (1..65535)."""
    v = str(value).strip()
    if v.upper() == "ANY":
        return "ANY"
    parts = v.split("-")
    try:
        if len(parts) not in (1, 2) or not all(p.strip().isdigit() for p in parts):
            raise ValueError
        nums = [int(p) for p in parts]
        if any(n < 1 or n > 65535 for n in nums):
            raise ValueError
        if len(nums) == 2 and nums[0] > nums[1]:
            raise ValueError
    except ValueError:
        raise ValueError(f"'{value}' is not 'ANY', a port 1-65535 or a range like 1000-2000 (low <= high)") from None
    return "-".join(str(n) for n in nums)


def is_external(ip: str) -> bool:
    """External = not RFC1918 and not loopback."""
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return not (a.is_loopback or any(a in n for n in RFC1918))


# --------------------------------------------------------------------------- matching
@lru_cache(maxsize=1024)
def _net(spec: str) -> Any:
    return ipaddress.ip_network(spec, strict=False)


def ip_matches(spec: str, ip: Optional[str]) -> bool:
    if spec.upper() == "ANY":
        return True
    if not ip:
        return False
    try:
        return ipaddress.ip_address(ip) in _net(spec)
    except ValueError:
        return False


def port_matches(spec: str, port: Optional[int]) -> bool:
    if spec.upper() == "ANY":
        return True
    if port is None:
        return False
    if "-" in spec:
        lo, hi = spec.split("-")
        return int(lo) <= port <= int(hi)
    return int(spec) == port


def rule_matches(rule: dict[str, Any], pkt: dict[str, Any]) -> bool:
    proto = rule["protocol"]
    if proto != "ANY" and proto != pkt["protocol"]:
        return False
    return (
        ip_matches(rule["src_ip"], pkt["src_ip"])
        and ip_matches(rule["dst_ip"], pkt["dst_ip"])
        and port_matches(rule["src_port"], pkt.get("src_port"))
        and port_matches(rule["dst_port"], pkt.get("dst_port"))
    )


@dataclass
class Verdict:
    verdict: str  # "allowed" | "blocked"
    matched_rule_id: Optional[int]
    matched_rule_name: Optional[str]
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "matched_rule_id": self.matched_rule_id,
            "matched_rule_name": self.matched_rule_name,
            "reason": self.reason,
        }


def sort_rules(rules: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rules, key=lambda r: (r["priority"], r["id"]))


def evaluate(
    rules: Iterable[dict[str, Any]],
    policy: dict[str, Any],
    pkt: dict[str, Any],
    bastion_ip: Optional[str] = None,
) -> Verdict:
    """Decide a packet's fate. ``rules`` may be unsorted; disabled rules are skipped."""
    if policy.get("bastion_mode") and bastion_ip:
        if is_external(pkt["src_ip"]) and not is_external(pkt["dst_ip"]) and pkt["dst_ip"] != bastion_ip:
            return Verdict("blocked", None, None, "Bastion policy")
    for r in sort_rules(rules):
        if not r.get("enabled", True):
            continue
        if rule_matches(r, pkt):
            allowed = r["action"] == "allow"
            return Verdict(
                "allowed" if allowed else "blocked",
                r["id"],
                r["name"],
                f"Matched rule '{r['name']}' ({r['action']})",
            )
    default = policy.get("default_action", "deny")
    return Verdict("allowed" if default == "allow" else "blocked", None, None, f"Default policy: {default}")


class FirewallEngine:
    """DB-backed wrapper: loads rules/policy/bastion and records hit counts."""

    def __init__(self, db: Any) -> None:
        self.db = db

    def snapshot(self) -> tuple[list[dict[str, Any]], dict[str, Any], Optional[str]]:
        bastion = self.db.get_bastion()
        return self.db.list_rules(), self.db.get_policy(), bastion["ip"] if bastion else None

    def dry_run(self, pkt: dict[str, Any]) -> Verdict:
        rules, policy, bastion_ip = self.snapshot()
        return evaluate(rules, policy, pkt, bastion_ip)
