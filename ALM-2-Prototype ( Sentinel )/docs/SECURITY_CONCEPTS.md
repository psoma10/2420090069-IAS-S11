# Security Concepts and Where They Appear in Sentinel

This document explains the syllabus topics and ties each one to the implementation. Terminology follows the classic treatment in Stallings, *Cryptography and Network Security / Computer Security: Principles and Practice* (intrusion detection, firewalls, malicious software).

Contents: 1 Intruders · 2 Intrusion detection systems · 3 Statistical anomaly detection · 4 Rule-based detection · 5 Firewalls · 6 Bastion host · 7 Viruses and worms · 8 Syllabus map

---

## 1. Intruders and their classes

An **intruder** is an entity that gains, or attempts to gain, unauthorized access to a system, or exceeds the access it was granted. Anderson's 1980 report (the origin of intrusion detection) classifies them by their relation to the system:

| Class | Definition | Typical behaviour | Detection angle |
|---|---|---|---|
| **Masquerader** | An outsider (not authorized) who penetrates access controls and uses a legitimate user's account | Logs in with stolen or guessed credentials; unusual hours, locations, volumes | Behavioural/statistical deviation from the account's profile; brute-force signatures |
| **Misfeasor** | A legitimate user who accesses resources they are not authorized for, or misuses authorized access | Insider reading data outside role, bulk copying | Policy rules, data-volume anomalies |
| **Clandestine user** | Someone who seizes supervisory (root) control and uses it to evade auditing and access control or to suppress audit collection | Disables logging, hides activity | Hard to detect from the target alone; needs independent monitoring |

Intruder skill also ranges from script-using novices ("script kiddies") to criminal groups and state-sponsored actors; skilled intruders probe quietly, novices tend to be noisy and are easily caught by signatures.

**Where in Sentinel**

- Masquerader / external attacker: `brute_force` scenario (IDS-001), `port_scan` (IDS-003), `bastion_bypass` (IDS-008). The seeded host `attacker-ext` (203.0.113.50) plays this role.
- Misfeasor / insider: `exfiltration` scenario (IDS-005) and the compromised workstation `ws-finance` (192.168.1.100) blocked by a seeded rule.
- Clandestine user: discussed in the Encyclopedia; Sentinel does not simulate log tampering, which is a stated limitation.

---

## 2. Intrusion detection systems (IDS)

An **intrusion detection system** monitors events in a system or network and signals when it sees evidence of intrusion. The rationale: if an intrusion is detected quickly enough, damage can be limited, and the existence of detection deters intruders; the collected data also improves prevention.

### Classification
- **Host-based IDS (HIDS)**: monitors characteristics of a single host (system calls, logs, file integrity). Sees what happened on the machine; blind to other hosts.
- **Network-based IDS (NIDS)**: monitors traffic across network segments. Sees many hosts; blind to encrypted payloads and local activity.
- **Detection approach**: *signature/rule-based* (misuse detection) versus *anomaly detection*. Hybrid systems combine both.
- **Response**: passive (alert) versus active (block); an active IDS is an IPS.

### Architecture (distributed IDS)
Sensors/agents collect events, a central manager correlates them, and an analyst consoles view alerts. Key evaluation measures:

- **True positive**: attack, alert. **False positive**: benign, alert. **False negative**: attack, no alert. **True negative**: benign, no alert.
- Tuning thresholds trades false positives against false negatives; no setting eliminates both.

### Base-rate fallacy
If intrusions are rare, even a detector with a low false-positive rate generates mostly false alarms, because benign events vastly outnumber attacks. Practical IDS design therefore needs very low false-positive rates, plus alert cooldown/aggregation.

**Where in Sentinel:** Sentinel is a network IDS operating on simulated packets. `ids_rules.py` is the misuse detector, `anomaly.py` is the anomaly detector, alerts flow through the Alert Panel. The per-(rule, source) cooldown is alert aggregation; editing thresholds on the Detection Rules page demonstrates the false-positive / false-negative trade-off. Because Sentinel only alerts (it does not block based on IDS output), it behaves as a passive IDS; the firewall is the only enforcement point.

---

## 3. Statistical anomaly detection

**Idea:** build a profile of normal behaviour from observed data and flag events that deviate significantly. It can detect previously unseen attacks but yields more false positives and needs a representative training period.

Two classic approaches:
1. **Threshold detection**: count occurrences of an event type in an interval; alert above a fixed bound. Crude, because "normal" varies by user and time.
2. **Profile-based detection**: characterise each subject's past behaviour (mean, variance, Markov model, time series) and alert on deviation.

Sentinel uses the **mean and standard deviation (Gaussian) model**: for a metric with trailing samples x1..xn,

- mean = (1/n) * sum(xi)
- std = sqrt( (1/n) * sum((xi - mean)^2) )
- z = (x - mean) / std

A value more than *k* standard deviations above the mean is anomalous. For roughly normal data about 99.7% of observations lie within 3 sigma, so k = 3 gives a false-positive rate near 0.13% per one-sided observation (Chebyshev's inequality guarantees at most 1/k^2, about 11%, for any distribution).

### Worked example

Packets-per-second sampled in the last 10 five-second buckets: 18, 22, 20, 19, 21, 23, 17, 20, 22, 18.

1. mean = (18+22+20+19+21+23+17+20+22+18) / 10 = 200 / 10 = **20**
2. squared deviations: 4, 4, 0, 1, 1, 9, 9, 0, 4, 4, sum = 36
3. variance = 36 / 10 = 3.6, std = sqrt(3.6) = **1.90**
4. threshold at sigma = 3: 20 + 3 * 1.90 = **25.7** pps
5. Next bucket observed x = 60: z = (60 - 20) / 1.90 = **21.1** > 3, so anomaly (ANOM-PPS style alert; metric = 60, threshold = 25.7).
6. Observed x = 24: z = 2.1 < 3, normal.

The baseline excludes the current bucket: otherwise the spike would raise the mean and std it is being compared to, masking itself. A minimum of 10 buckets and a std floor prevent undefined or wildly unstable z-scores.

### Per-source profiling (Welford)
For each source IP Sentinel keeps a running mean and variance of its packets/sec using **Welford's online algorithm**: for each new value x, `n += 1; delta = x - mean; mean += delta / n; M2 += delta * (x - mean); variance = M2 / n`. It is O(1) memory per source and avoids the numerical instability of summing squares. A source whose rate is far above its own history raises `ANOM-SRC`.

### Strengths and limits
Detects novel behaviour (a DDoS with no signature); but a patient attacker can "train" the baseline upward slowly, the model assumes unimodal behaviour, and the training data may already contain attacks.

**Where in Sentinel:** Anomaly Detector page; `backend/app/anomaly.py`; five metrics (`packets_per_sec`, `login_attempts_per_min`, `bytes_per_dst`, `distinct_ports_per_src`, `blocked_ratio`); `GET /api/anomaly/metrics` returns per-point `z` and `anomaly`, and `threshold = mean + sigma * std`. Sigma is configurable (1 to 6) via `PUT /api/anomaly/config`; `POST /api/anomaly/baseline` generates normal history for demonstrations.

---

## 4. Rule-based detection (misuse / signature detection)

**Idea:** encode known attack patterns or violations of policy as rules; raise an alert when observed events match. Rules may be signatures (a pattern for a known attack) or heuristics (counts over a window, for example "5 failed logins in a minute"). Rule-based penetration identification in the literature (for example Stallings' discussion of the IDES/NIDES family and expert systems) uses rules on audit records.

| Property | Rule-based | Anomaly-based |
|---|---|---|
| Needs prior attack knowledge | Yes | No |
| Detects novel attacks | Poorly | Yes |
| False positives | Low if rules are precise | Higher |
| Explainability | High (names the rule) | Medium (a statistic) |
| Maintenance | Rules must be updated | Baseline must be retrained |

**Where in Sentinel:** `backend/app/ids_rules.py`, Detection Rules page. Nine rules, each with `window_seconds`, `threshold`, `severity` and an enabled flag, using sliding-window counters keyed by source (or destination for SYN flood):

- IDS-001 SSH brute force (>= 5 failed `ssh_login` / 60 s), IDS-002 Telnet, IDS-003 port scan (>= 10 distinct ports / 30 s), IDS-004 SYN flood (>= 100 SYN / 10 s), IDS-005 exfiltration (> 10 MB to external), IDS-006 blocked-traffic storm, IDS-007 ICMP flood, IDS-008 bastion bypass, IDS-009 sensitive port probe.

The cooldown (one alert per rule and source per window) models alert suppression. Running the same attack against the anomaly detector and the rules side by side shows the complementary strengths.

---

## 5. Firewalls

A **firewall** is a choke point between a trusted internal network and an untrusted one that enforces a security policy on the traffic crossing it. Design goals (Stallings): all traffic must pass through it; only authorized traffic, as defined by local policy, is allowed; the firewall itself is immune to penetration. Techniques: service control, direction control, user control, behaviour control.

### Types
| Type | Operates on | Behaviour | Weakness |
|---|---|---|---|
| **Packet-filtering** | Network/transport headers: IPs, ports, protocol, flags | Ordered rule list; default discard or forward; stateless | No context; vulnerable to IP spoofing, tiny-fragment attacks; no application awareness |
| **Stateful inspection** | Headers plus a connection table | Allows return traffic only for established connections | More memory/CPU; still no payload understanding |
| **Application-level gateway (proxy)** | Application protocol content | Client talks to proxy, proxy opens second connection; can filter commands, users | Slower; one proxy per protocol |
| **Circuit-level gateway** | TCP connection (relays between two TCP connections) | Checks session legitimacy, then relays bytes | No payload inspection |

### Policy and rule evaluation
- **Default policy**: *default deny* (discard what is not explicitly permitted) is safer than *default allow*.
- Rules are evaluated in order; **first match wins**, so order matters: put specific rules above general ones.
- Limits of firewalls: cannot stop insider attacks, traffic that bypasses it, or malware carried in permitted traffic.

**Where in Sentinel:** Firewall Manager page and `backend/app/firewall.py` implement a **stateless packet-filtering firewall**: match on protocol, source/destination address (exact or CIDR), source/destination port (exact or range), ascending `priority`, first match wins, otherwise the default policy (seeded as `deny`). Hit counters show which rules do the work. The **dry-run tester** (`POST /api/firewall/test`) shows the verdict and matching rule without side effects. Stateful, proxy and circuit-level types are described here but not implemented.

---

## 6. Bastion host

A **bastion host** is a system identified by the administrator as a critical strong point in the network's security: a hardened host exposed to the untrusted network, typically serving as the platform for an application-level or circuit-level gateway. Characteristics (Stallings): runs a secure version of the OS; only essential services installed (for example proxy applications); may require additional authentication before granting access; each proxy is small, independent, with no disk access other than reading its configuration; extensive audit logging; each proxy is independent so a failed one does not compromise others. Related architectures: screened host (packet filter plus bastion), dual-homed bastion, screened subnet / DMZ.

**Where in Sentinel:** Hosts and Bastion page; `POST /api/hosts/{id}/bastion` (single bastion at a time). With `bastion_mode` enabled in the firewall policy, any packet from an external source to an internal host that is not the bastion is denied with reason "Bastion policy" before rule evaluation, modelling the rule "the bastion is the only door". IDS-008 flags attempts to bypass it. The seeded bastion is `bastion-gw` (10.0.0.5), which also has the only inbound SSH allow rule.

---

## 7. Viruses and worms

**Malware** is software designed to damage, disrupt or gain unauthorized access. Two propagating classes:

| | Virus | Worm |
|---|---|---|
| Needs host program | Yes, attaches to executable or document | No, standalone program |
| Spreads by | User action: running an infected file | Actively over the network, exploiting vulnerabilities or weak credentials |
| Speed | Slow, human-paced | Can be exponential (for example Morris 1988, Code Red, Slammer) |

**Virus life cycle:** dormant, propagation (copies itself into other programs), triggering, execution. **Virus types:** parasitic, memory-resident, boot sector, stealth, polymorphic, metamorphic, macro. **Worm life cycle:** probing (target discovery, often by scanning), exploitation, replication, payload. Worm propagation models show an early exponential phase followed by saturation as vulnerable hosts are exhausted.

**Countermeasures:** prevention (patching, least privilege, user education), detection, identification, removal; generations of antivirus (simple scanners, heuristic scanners, activity traps, full-featured protection). Network defenses: ingress/egress filtering, blocking unused ports, IDS detecting scan and propagation signatures, segmentation.

**Where in Sentinel:** Sentinel does not simulate malware. It models the *network symptoms* of worm-like behaviour: the `port_scan` scenario is the probing phase (IDS-003, IDS-009 for sensitive ports such as 445 and 3389, as used by SMB worms), the seeded deny rules for TCP 23/445/3389 are containment measures, and the compromised-workstation rule (`ws-finance`) shows host isolation. Encyclopedia articles and Labs cover the theory.

---

## 8. Syllabus map

| Syllabus topic | Section here | Sentinel feature | Code |
|---|---|---|---|
| Intruders, classes | 1 | Scenarios, seeded hosts | `simulator.py` |
| IDS (HIDS/NIDS, architecture) | 2 | Alert pipeline, Alert Panel | `ids_rules.py`, `anomaly.py`, `routers/` alerts |
| Statistical anomaly detection | 3 | Anomaly Detector | `anomaly.py` |
| Rule-based detection | 4 | Detection Rules | `ids_rules.py` |
| Firewalls (types, policy) | 5 | Firewall Manager | `firewall.py` |
| Bastion host | 6 | Hosts and Bastion, bastion mode | `firewall.py`, hosts router |
| Viruses and worms | 7 | Encyclopedia, scan scenarios | `frontend/src/pages/Encyclopedia.jsx` |
