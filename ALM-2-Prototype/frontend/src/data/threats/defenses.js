// Intruder and defense articles. Educational, defensive content only.
export const defenses = [
  {
    slug: 'intruders',
    title: 'Intruders: Hackers, Criminals and Insiders',
    category: 'intruders',
    level: 4,
    vectors: ['network', 'social'],
    summary: 'Intruders are people, not programs. Their skill, motivation and access differ, and so do the patterns of behaviour a defender can detect.',
    overview: [
      'A significant security problem for networked systems is unwelcome or hostile intrusion, either from unauthorised users or from authorised users who access resources they should not. Malware is automated, but an intruder is a human adversary who adapts, so detecting intrusion means recognising patterns of behaviour rather than a single signature.',
      'Three broad groups are usually described. Hackers are motivated mainly by thrill, status or curiosity, often work alone or in loose communities, and typically probe widely for any weakness. Criminals, including organised groups, target systems for financial gain: stealing card data, identity information or intellectual property, deploying ransomware, and selling access. They are patient, specialised and share tools on underground markets. Insiders are employees, contractors or partners with legitimate access who misuse it, out of grievance, profit or negligence; they already pass authentication and know where valuable data lives, so they are the hardest to distinguish from normal users.',
      'Typical attack stages are reconnaissance (scanning and enumerating), gaining access (guessing or stealing credentials, exploiting a flaw), escalating privilege, moving laterally, and finally achieving the goal while covering tracks. Each stage produces observable traces, and a layered defence tries to catch the intruder at the earliest one.'
    ],
    traits: [
      'Human, adaptive adversaries with varying skill and motive',
      'Hackers: thrill and status; criminals: profit; insiders: privilege and grievance',
      'Follow stages from reconnaissance to covering tracks',
      'Exploit weak passwords, unpatched services and misconfigurations'
    ],
    lifecycleTitle: 'Typical intrusion stages',
    lifecycle: [
      { name: 'Reconnaissance', text: 'Ping sweeps, port scans, banner grabbing and public information gathering.' },
      { name: 'Initial access', text: 'Password guessing, stolen credentials, an exploited service or phishing.' },
      { name: 'Escalation and movement', text: 'Obtaining higher privileges and pivoting to more valuable hosts.' },
      { name: 'Objective and cleanup', text: 'Data theft or damage, then log tampering to hide.' }
    ],
    spread: ['Credential guessing and reuse', 'Exploiting exposed services', 'Social engineering', 'Abuse of legitimate access by insiders'],
    examples: [
      { name: 'Cuckoo\'s Egg intrusion', year: '1986', note: 'A system administrator traced an accounting discrepancy to a hacker moving through research networks.' },
      { name: 'Morris-era password attacks', year: '1988', note: 'Dictionary attacks on password files showed how weak passwords enable intrusion.' },
      { name: 'Insider data theft cases', year: 'various', note: 'Employees copying customer data before leaving a company.' }
    ],
    detection: [
      'Repeated failed logins from one source',
      'Scans touching many ports or hosts',
      'Logins at unusual times or places',
      'Access to resources outside a user\'s normal profile',
      'Large transfers to external addresses'
    ],
    countermeasures: [
      'Strong authentication, lockout and rate limiting',
      'Least privilege and network segmentation',
      'Bastion host for administrative access',
      'Audit logging, IDS and regular log review',
      'Insider controls: separation of duties and monitoring'
    ],
    sentinel: {
      text: 'The seeded scenarios map to intruder stages: port_scan is reconnaissance (IDS-003), brute_force is initial access (IDS-001), bastion_bypass is lateral probing (IDS-008) and exfiltration is the objective (IDS-005).',
      rules: ['IDS-001', 'IDS-003', 'IDS-005', 'IDS-008', 'IDS-009'],
      links: [{ to: '/traffic', label: 'Traffic generator' }, { to: '/lab', label: 'Guided labs' }, { to: '/ids-rules', label: 'Detection rules' }]
    },
    related: ['intruder-classes', 'intrusion-detection-concepts', 'logic-bomb']
  },
  {
    slug: 'intruder-classes',
    title: 'Intruder Classes: Masquerader, Misfeasor, Clandestine User',
    category: 'intruders',
    level: 4,
    vectors: ['social', 'network'],
    summary: 'Intrusion detection literature classifies intruders by their relation to the system: who they are, and how they obtain access.',
    overview: [
      'In the classic classification from intrusion detection research, three classes of intruders are distinguished. A masquerader is an individual who is not authorised to use the computer and who penetrates a system\'s access controls to exploit a legitimate user\'s account. A masquerader is generally an outsider. A misfeasor is a legitimate user who accesses data, programs or resources for which such access is not authorised, or who is authorised for such access but misuses his or her privileges. A misfeasor is generally an insider. A clandestine user is an individual who seizes supervisory control of the system and uses this control to evade auditing and access controls or to suppress audit collection. A clandestine user can be either an outsider or an insider.',
      'The classes matter because they imply different detection strategies. A masquerader behaves differently from the account\'s true owner: other hours, other commands, other hosts. Statistical anomaly detection with per-user profiles is well suited. A misfeasor performs actions that are permitted by credentials but outside the person\'s role; rule-based detection and policy checks are better. A clandestine user tries to blind the detector, so tamper-resistant logging, separate audit servers and integrity monitoring are needed.',
      'Real attacks often move through the classes: an external attacker first masquerades as a user, then seizes supervisory control and becomes clandestine. Defences should therefore cover all three.'
    ],
    traits: [
      'Masquerader: outsider using a stolen identity',
      'Misfeasor: insider misusing legitimate access',
      'Clandestine user: seizes control and suppresses auditing',
      'Each class suggests a different detection technique'
    ],
    lifecycle: [
      { name: 'Masquerade', text: 'An outsider guesses or steals a valid account and logs in.' },
      { name: 'Misuse', text: 'The account is used for actions outside its normal profile (or an insider oversteps).' },
      { name: 'Take control', text: 'Privilege is escalated to administrator.' },
      { name: 'Go clandestine', text: 'Audit logs are disabled or edited; backdoors keep access.' }
    ],
    spread: ['Credential theft and guessing', 'Abuse of excessive privileges', 'Privilege escalation exploits'],
    examples: [
      { name: 'Password guessing against SSH', year: 'ongoing', note: 'Continuous automated masquerade attempts against exposed servers.' },
      { name: 'Employee snooping on records', year: 'various', note: 'Authorised staff reading records unrelated to their work (misfeasance).' },
      { name: 'Log-wiping after compromise', year: 'various', note: 'Intruders clearing logs to hide, typical clandestine behaviour.' }
    ],
    detection: [
      'Login from a new location, hour or host (masquerade)',
      'Access outside role (misfeasance)',
      'Logs ending abruptly or audit service stopped (clandestine)',
      'Privilege changes outside change windows'
    ],
    countermeasures: [
      'Multi-factor authentication to blunt masquerade',
      'Role-based access control and periodic access review',
      'Remote, write-once log collection',
      'Alerting on audit configuration changes'
    ],
    sentinel: {
      text: 'IDS-001 targets masquerade attempts (repeated failed ssh_login events). The anomaly detector\'s per-source profile finds misbehaviour relative to a host\'s own baseline. The firewall and bastion policy reduce what any account can reach.',
      rules: ['IDS-001', 'IDS-008', 'IDS-009'],
      links: [{ to: '/anomaly', label: 'Anomaly detector' }, { to: '/hosts', label: 'Hosts and bastion' }]
    },
    related: ['intruders', 'intrusion-detection-concepts', 'rootkit']
  },
  {
    slug: 'intrusion-detection-concepts',
    title: 'Intrusion Detection: Statistical vs Rule-based',
    category: 'defenses',
    level: 2,
    vectors: ['network'],
    summary: 'An IDS monitors events for signs of intrusion. Anomaly detection learns normal behaviour; rule-based detection matches known bad patterns.',
    overview: [
      'An intrusion detection system (IDS) collects information from a system or network and analyses it for signs of intrusion. Network IDS (NIDS) sensors watch traffic at chosen points; host IDS (HIDS) agents watch logs, files and system calls on one machine. An intrusion prevention system (IPS) is an IDS placed in-line so that it can also block. The design assumption is that intruder behaviour is measurably different from legitimate behaviour, although the two overlap, which causes false positives (benign activity flagged) and false negatives (attacks missed).',
      'Statistical anomaly detection builds a profile of normal behaviour from collected data over a period, then applies tests to decide whether current behaviour is legitimate. Threshold detection counts events and flags a count outside bounds. Profile-based detection measures a user or host against its own history; common models are mean and standard deviation, multivariate, Markov process or time series. Its strength is that it can find novel attacks; its weakness is false positives when behaviour legitimately changes, and a long training period.',
      'Rule-based detection compares events with rules that describe known attacks (misuse or signature detection) or encodes penetration identification via expert-system rules. It is accurate for known patterns and easy to explain, but cannot find attacks that nobody wrote a rule for, and must be updated. Practical systems combine both approaches, and use audit records or native audit information as the data source.'
    ],
    traits: [
      'NIDS watches the network; HIDS watches a host',
      'Anomaly detection: learn normal behaviour, flag deviations',
      'Rule-based: match known attack patterns',
      'Trade-off between false positives and false negatives'
    ],
    lifecycleTitle: 'Detection pipeline',
    lifecycle: [
      { name: 'Collect', text: 'Capture packets, logs or audit records.' },
      { name: 'Analyse', text: 'Apply rules and statistical tests to the events.' },
      { name: 'Alert', text: 'Raise an alert with severity and context.' },
      { name: 'Respond', text: 'An analyst or an IPS blocks, isolates or tunes the system.' }
    ],
    spread: ['Not applicable: this is a defensive technology'],
    examples: [
      { name: 'Snort', year: '1998', note: 'Open-source signature-based network IDS.' },
      { name: 'Denning model', year: '1987', note: 'Influential intrusion detection model based on statistical profiles of subject behaviour.' },
      { name: 'Tripwire', year: '1992', note: 'File integrity checking tool, a form of host-based detection.' }
    ],
    detection: [
      'Counts above threshold in a time window',
      'Z-score of a metric above the sigma limit',
      'Pattern match on signature or rule',
      'Policy violation, for example traffic to a forbidden port'
    ],
    countermeasures: [
      'Combine anomaly and rule-based detection',
      'Tune thresholds to reduce false positives',
      'Keep baselines current and rules updated',
      'Correlate alerts across sources'
    ],
    sentinel: {
      text: 'Sentinel implements both families: the Detection Rules page (nine rules, window and threshold) is the rule-based IDS, and the Anomaly Detector uses z-scores over bucketed metrics. Compare alerts from each on the Alert Panel.',
      rules: ['IDS-001', 'IDS-003', 'IDS-004'],
      links: [{ to: '/ids-rules', label: 'Detection rules' }, { to: '/anomaly', label: 'Anomaly detector' }, { to: '/alerts', label: 'Alert panel' }]
    },
    related: ['intruder-classes', 'how-sentinel-detects', 'antivirus-countermeasures']
  },
  {
    slug: 'antivirus-countermeasures',
    title: 'Virus and Worm Countermeasures',
    category: 'defenses',
    level: 2,
    vectors: ['file', 'network'],
    summary: 'The ideal solution is prevention; failing that, detect, identify and remove. Antivirus software evolved through four generations.',
    overview: [
      'The ideal countermeasure against malware is prevention: do not allow it to get into the system in the first place, or block its ability to modify it. This is difficult in general, so the realistic approach is a mix of detection (determine that infection has occurred and locate the malware), identification (determine which strain it is) and removal (remove all traces and restore the system). If detection succeeds but identification or removal does not, the infected program must be discarded and a clean copy reloaded.',
      'Antivirus software has passed through four generations. The first generation, simple scanners, requires a malware signature to identify it, sometimes using wildcards, or checks for changes in program length. The second generation, heuristic scanners, uses heuristic rules, such as searching for fragments of code often associated with viruses, and integrity checking, which appends a checksum or hash to each program so a change in it reveals infection. The third generation, activity traps, are memory-resident programs that identify malware by its actions rather than its structure, for example attempts to write to an executable. The fourth generation, full-featured protection, packages a variety of antivirus techniques used in conjunction: scanning and activity-trap components together with access control that limits the ability of malware to penetrate and then update files.',
      'Two advanced techniques extend this. Generic decryption (GD) runs a suspect file in an emulated virtual machine, lets any polymorphic virus decrypt itself, and then scans the revealed body. Behavior-blocking software integrates with the operating system, monitors program behaviour in real time for malicious actions (attempts to modify files, format a disk, change settings, open network connections, mass-mail), and blocks them before they affect the system. Its disadvantage is that malicious code must be running to be seen, so some harm can occur before it is stopped. For worms specifically, add patching, segmentation, firewalls and rate limiting.'
    ],
    traits: [
      'Prevention first, then detection, identification, removal',
      'Four generations: simple, heuristic, activity trap, full-featured',
      'Generic decryption defeats polymorphic encryption',
      'Behaviour blocking sees what code does, not what it looks like'
    ],
    lifecycleTitle: 'Antivirus generations',
    lifecycle: [
      { name: '1st: Simple scanners', text: 'Signature (and wildcard) matching, program length records. Needs a known pattern.' },
      { name: '2nd: Heuristic scanners', text: 'Heuristic rules for suspicious code, plus integrity checks via checksums or hashes.' },
      { name: '3rd: Activity traps', text: 'Memory-resident; recognise malicious actions rather than structure.' },
      { name: '4th: Full-featured protection', text: 'Combine scanning, activity traps and access control in one suite.' }
    ],
    spread: ['Not applicable: defensive topic'],
    examples: [
      { name: 'Signature databases', year: '1980s onward', note: 'Vendors distribute daily pattern updates to scanners.' },
      { name: 'Generic decryption', year: '1990s', note: 'Emulation to see through polymorphic encryption.' },
      { name: 'Endpoint detection and response', year: '2010s', note: 'Modern behavioural monitoring and cloud analytics.' }
    ],
    detection: [
      'Signature match (known strains)',
      'Heuristic score of suspicious structure',
      'Hash change in monitored files',
      'Suspicious behaviour at run time'
    ],
    countermeasures: [
      'Keep operating systems and software patched',
      'Run up-to-date antivirus with real-time protection',
      'Restrict privileges; disable auto-run',
      'Maintain tested offline backups',
      'Network defences: firewall, segmentation, IDS'
    ],
    sentinel: {
      text: 'Sentinel is the network-level layer of this defence in depth. It cannot scan files, but it mirrors the same ideas: signature-like rules, behaviour-like anomaly detection, and a firewall that acts as access control.',
      rules: ['IDS-003', 'IDS-004', 'IDS-006'],
      links: [{ to: '/firewall', label: 'Firewall' }, { to: '/ids-rules', label: 'Detection rules' }]
    },
    related: ['digital-immune-system', 'polymorphic-virus', 'worms']
  },
  {
    slug: 'digital-immune-system',
    title: 'Digital Immune System',
    category: 'defenses',
    level: 2,
    vectors: ['network', 'file'],
    summary: 'A comprehensive, automated defence developed to respond to fast-spreading malware by analysing it centrally and distributing a cure globally.',
    overview: [
      'The digital immune system is an approach to malware defence pioneered at IBM and later developed further by Symantec. It was a response to the rise of internet-based propagation: viruses and worms spreading faster than humans can analyse and distribute signature updates. The aim is to provide rapid response so that malware can be stamped out almost as soon as it is introduced, and to do so automatically.',
      'The process runs in steps. A monitoring program on each client machine uses heuristics, based on system behaviour, suspicious changes to programs, or family signatures, to infer that a virus may be present, and forwards a copy of the suspect program to an administrative machine. The administrative machine encrypts the sample and sends it to a central virus analysis machine. That machine creates an environment in which the infected program can be run safely, a sandbox or emulation, and analyses it to identify the malware, producing a prescription that describes how to identify and remove it. The prescription is returned to the administrative machine, which forwards it to the infected client and to other clients in the organisation, and finally to subscribers worldwide, so that the malware can be detected before it runs elsewhere.',
      'The same ideas live on in modern cloud-based reputation services, sandbox detonation and threat intelligence sharing: observe locally, analyse centrally, and distribute protection quickly. Its success depends on speed, which is why automation is essential.'
    ],
    traits: [
      'Automated sample submission and analysis',
      'Sandbox / emulation to observe behaviour',
      'Generates a prescription (signature plus removal steps)',
      'Distributes cure globally, faster than the spread'
    ],
    lifecycleTitle: 'Digital immune system flow',
    lifecycle: [
      { name: 'Monitor', text: 'Client heuristics flag a suspicious program and forward a copy.' },
      { name: 'Collect', text: 'The administrative machine encrypts and relays the sample to central analysis.' },
      { name: 'Analyse', text: 'A sandbox runs the sample, derives a signature and a removal prescription.' },
      { name: 'Distribute', text: 'The prescription is sent to the client, the organisation and subscribers worldwide.' }
    ],
    spread: ['Not applicable: defensive topic'],
    examples: [
      { name: 'IBM digital immune system', year: '1990s', note: 'Original architecture proposal for automated malware response.' },
      { name: 'Cloud sandboxes', year: '2010s', note: 'Detonation of suspect attachments and files in the cloud.' },
      { name: 'Threat intelligence sharing', year: '2010s', note: 'Indicators distributed automatically between organisations.' }
    ],
    detection: [
      'Behaviour heuristics on endpoints',
      'Sandbox verdicts from central analysis',
      'Reputation scores and shared indicators'
    ],
    countermeasures: [
      'Enable automatic sample submission and update channels',
      'Use central logging for rapid correlation',
      'Plan and rehearse response workflows'
    ],
    sentinel: {
      text: 'Sentinel\'s alerting pipeline echoes the first steps: observe (packets), analyse (rules and z-scores), alert. In a real deployment, an alert would trigger the next stage: update rules and push them to the firewall.',
      rules: ['IDS-003', 'IDS-004'],
      links: [{ to: '/alerts', label: 'Alert panel' }, { to: '/firewall', label: 'Firewall' }]
    },
    related: ['antivirus-countermeasures', 'worms', 'intrusion-detection-concepts']
  },
  {
    slug: 'how-sentinel-detects',
    title: 'How Sentinel Detects These Threats',
    category: 'defenses',
    level: 1,
    vectors: ['network'],
    summary: 'A map from each threat class in this atlas to the Sentinel IDS rules, anomaly metrics and firewall strategy that expose or contain it.',
    overview: [
      'Sentinel is a network-level simulator, so it detects the observable network behaviour of threats rather than the files themselves. Every threat in this atlas eventually produces traffic: scanning to find victims, connections to command servers, floods, or bulk data transfer. Sentinel combines three layers. The firewall enforces policy (default deny, rules evaluated by priority with first match winning, optional bastion mode). The rule-based IDS applies nine rules, each with a threshold and a time window. The statistical anomaly IDS compares five metrics against a trailing baseline and raises an alert when the z-score exceeds sigma (default 3.0).',
      'The table below links the threat families to the layer that is most effective. Notice that the host-resident virus types are mostly out of the network IDS\'s sight, which is why endpoint antivirus remains necessary; worms, botnets and intruders, on the other hand, are loud on the network.',
      'Use the traffic generator\'s scenarios to see each mapping live: normal, brute_force, port_scan, ddos, exfiltration, telnet_probe and bastion_bypass.'
    ],
    traits: [
      'Firewall: default-deny, ordered rules, bastion mode',
      'Rule IDS: nine threshold-and-window rules (IDS-001 to IDS-009)',
      'Anomaly IDS: z-score on five metrics',
      'Scenarios let you reproduce each pattern safely'
    ],
    lifecycleTitle: 'Defence layers in Sentinel',
    lifecycle: [
      { name: 'Firewall', text: 'First match wins; default policy and bastion mode decide the rest.' },
      { name: 'Rule IDS', text: 'Counts events per source in a window and compares to a threshold.' },
      { name: 'Anomaly IDS', text: 'Compares each metric with the baseline: z = (x - mean) / std.' },
      { name: 'Alerts', text: 'Everything lands in the Alert Panel with severity and source.' }
    ],
    spread: ['Not applicable: defensive topic'],
    examples: [
      { name: 'brute_force scenario', year: 'lab', note: 'Triggers IDS-001 and the login attempts anomaly metric.' },
      { name: 'port_scan scenario', year: 'lab', note: 'Triggers IDS-003 and distinct_ports_per_src.' },
      { name: 'ddos scenario', year: 'lab', note: 'Triggers IDS-004 and packets_per_sec.' }
    ],
    detection: [
      'IDS-001 to IDS-009 rule alerts',
      'ANOM-* alerts from the anomaly detector',
      'FW-BLOCK alerts from the firewall'
    ],
    countermeasures: [
      'Add deny rules for services you do not need',
      'Turn on bastion mode so only the bastion is reachable from outside',
      'Tune sigma and rule thresholds to balance noise and sensitivity'
    ],
    sentinel: {
      text: 'Everything on this page is reproducible in the app. Start with the Traffic Generator, then watch the Alert Panel and the Anomaly Detector.',
      rules: ['IDS-001', 'IDS-002', 'IDS-003', 'IDS-004', 'IDS-005', 'IDS-006', 'IDS-007', 'IDS-008', 'IDS-009'],
      links: [{ to: '/traffic', label: 'Traffic generator' }, { to: '/alerts', label: 'Alerts' }, { to: '/lab', label: 'Guided labs' }]
    },
    table: {
      caption: 'Threat to Sentinel detection map',
      head: ['Threat', 'Network symptom', 'IDS rules', 'Anomaly metric', 'Firewall strategy'],
      rows: [
        ['Viruses (file, boot, macro)', 'Mostly host-local; later beaconing or exfiltration', 'IDS-005', 'bytes_per_dst', 'Quarantine infected host with deny rule'],
        ['Polymorphic / metamorphic / stealth', 'Same as above; signatures fail', 'IDS-005, IDS-006', 'packets_per_sec', 'Rely on behaviour, default deny'],
        ['Network scanning worms', 'Many ports and hosts, many failures', 'IDS-003, IDS-006, IDS-009', 'distinct_ports_per_src, blocked_ratio', 'Deny unused ports, segment'],
        ['E-mail worms', 'Outbound burst to many destinations', 'IDS-006', 'packets_per_sec', 'Only mail relay may send SMTP'],
        ['Ransomware worms (SMB)', 'Connections to 445 and 3389', 'IDS-009, IDS-003', 'distinct_ports_per_src', 'Deny 445 and 3389 (seeded rules)'],
        ['Botnets / DDoS', 'SYN, ICMP flood to one destination', 'IDS-004, IDS-007', 'packets_per_sec', 'Rate limit, block sources'],
        ['Trojans / rootkits', 'Covert channel, odd ports, bastion bypass', 'IDS-008, IDS-002, IDS-005', 'bytes_per_dst', 'Bastion mode, egress filtering'],
        ['Brute-force intruders', 'Repeated failed SSH logins', 'IDS-001', 'login_attempts_per_min', 'Allow SSH only to the bastion'],
        ['Exfiltrating insiders', 'Single large transfer to external IP', 'IDS-005', 'bytes_per_dst', 'Egress rules for data stores']
      ]
    },
    related: ['intrusion-detection-concepts', 'antivirus-countermeasures', 'botnets-ddos']
  }
];
