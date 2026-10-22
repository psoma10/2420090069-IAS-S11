import pytest

from app import firewall as fw
from app.firewall import evaluate


def rule(id, action="allow", protocol="TCP", src="ANY", dst="ANY", sp="ANY", dp="ANY", priority=100, enabled=True,
         name=None):
    return dict(id=id, name=name or f"r{id}", action=action, protocol=protocol, src_ip=src, dst_ip=dst,
                src_port=sp, dst_port=dp, priority=priority, enabled=enabled)


P = {"default_action": "deny", "bastion_mode": False}
PKT = dict(src_ip="1.2.3.4", dst_ip="10.0.1.10", src_port=5555, dst_port=80, protocol="TCP")


def test_cidr_and_single_ip():
    assert fw.ip_matches("10.0.1.0/24", "10.0.1.99")
    assert not fw.ip_matches("10.0.1.0/24", "10.0.2.1")
    assert fw.ip_matches("10.0.1.5", "10.0.1.5") and not fw.ip_matches("10.0.1.5", "10.0.1.6")
    assert fw.ip_matches("ANY", "8.8.8.8")


def test_port_ranges():
    assert fw.port_matches("80", 80) and not fw.port_matches("80", 81)
    assert fw.port_matches("1000-2000", 1000) and fw.port_matches("1000-2000", 2000)
    assert not fw.port_matches("1000-2000", 2001)
    assert not fw.port_matches("80", None)  # ICMP has no port
    assert fw.port_matches("ANY", None)


def test_priority_first_match_wins():
    rules = [rule(1, "deny", dp="80", priority=20), rule(2, "allow", dp="80", priority=10)]
    v = evaluate(rules, P, PKT)
    assert v.verdict == "allowed" and v.matched_rule_id == 2


def test_disabled_rule_skipped_and_default_policy():
    v = evaluate([rule(1, dp="80", enabled=False)], P, PKT)
    assert v.verdict == "blocked" and v.matched_rule_id is None and "Default policy" in v.reason
    v = evaluate([], {"default_action": "allow", "bastion_mode": False}, PKT)
    assert v.verdict == "allowed"


def test_protocol_matching():
    assert evaluate([rule(1, protocol="UDP", dp="80")], P, PKT).verdict == "blocked"
    assert evaluate([rule(1, protocol="ANY", dp="80")], P, PKT).verdict == "allowed"


def test_bastion_policy_precedes_rules():
    rules = [rule(1, dp="80")]
    pol = {"default_action": "deny", "bastion_mode": True}
    v = evaluate(rules, pol, PKT, bastion_ip="10.0.0.5")
    assert v.verdict == "blocked" and v.reason == "Bastion policy"
    # to the bastion itself: rules decide
    to_bastion = {**PKT, "dst_ip": "10.0.0.5", "dst_port": 22}
    assert evaluate([rule(1, dp="22")], pol, to_bastion, "10.0.0.5").verdict == "allowed"
    # internal source is unaffected
    assert evaluate(rules, pol, {**PKT, "src_ip": "10.0.5.5"}, "10.0.0.5").verdict == "allowed"


def test_external_check():
    for ip in ("10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "127.0.0.1"):
        assert not fw.is_external(ip)
    for ip in ("8.8.8.8", "172.32.0.1", "203.0.113.50"):
        assert fw.is_external(ip)


@pytest.mark.parametrize("bad", ["300.1.1.1", "10.0.0.0/33", "hello"])
def test_bad_ip_specs(bad):
    with pytest.raises(ValueError):
        fw.validate_ip_spec(bad)


@pytest.mark.parametrize("bad", ["0", "70000", "2000-1000", "abc", "1-2-3"])
def test_bad_port_specs(bad):
    with pytest.raises(ValueError):
        fw.validate_port_spec(bad)
