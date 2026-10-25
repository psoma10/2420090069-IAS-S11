// Other malware articles. Educational, defensive content only.
export const other = [
  {
    slug: 'trojan-horse',
    title: 'Trojan Horse',
    category: 'other',
    level: 4,
    vectors: ['social', 'web', 'file'],
    summary: 'A program that appears useful or harmless but secretly contains a harmful function, relying on deception rather than self-replication.',
    overview: [
      'A Trojan horse is a program with a hidden, unintended function that is performed in addition to, or instead of, its apparent purpose. The name comes from the Greek story: the victim willingly brings it inside. A Trojan does not replicate by itself, which separates it from viruses and worms; it spreads by convincing people to install it.',
      'Trojans fall into several families depending on the payload: remote access Trojans (RATs) that give an attacker control of a computer, banking Trojans that steal credentials, downloaders and droppers that install other malware, and spyware that records activity. A modified compiler or login program that contains a backdoor is an older example of the same idea, a Trojan hidden in trusted system software.',
      'Trojans are the workhorse of cybercrime because they are cheap to distribute inside pirated software, fake updates, cracked games or malicious browser extensions. Defences therefore concentrate on trust: only install signed software from known sources, and restrict what any installed program may do.'
    ],
    traits: [
      'Disguised as legitimate or desirable software',
      'Does not self-replicate; spread by deception',
      'Typically opens a backdoor, steals data or downloads more malware',
      'Often communicates with a remote controller'
    ],
    lifecycle: [
      { name: 'Lure', text: 'The victim is persuaded to download or run a seemingly useful program.' },
      { name: 'Install', text: 'The hidden function installs itself and arranges to restart with the system.' },
      { name: 'Connect', text: 'It contacts the attacker\'s server for instructions.' },
      { name: 'Act', text: 'It steals data, logs keystrokes, or loads additional malware.' }
    ],
    spread: ['Cracked software and fake installers', 'Phishing attachments', 'Compromised update channels', 'Malicious browser extensions or mobile apps'],
    examples: [
      { name: 'Back Orifice', year: '1998', note: 'Remote administration tool abused as a backdoor Trojan.' },
      { name: 'Zeus / Zbot', year: '2007', note: 'Banking Trojan that stole online credentials and built a botnet.' },
      { name: 'Emotet', year: '2014 to 2021', note: 'Started as a banking Trojan, evolved into a malware delivery service.' }
    ],
    detection: [
      'Unknown programs with persistent start-up entries',
      'Regular beaconing traffic to unfamiliar external hosts',
      'Unexpected outbound connections on odd ports',
      'Antivirus or behavioural alerts for credential access'
    ],
    countermeasures: [
      'Install software only from trusted, signed sources',
      'Application allow-listing and least privilege',
      'Egress filtering to block command-and-control channels',
      'User education about fake updates and cracked software'
    ],
    sentinel: {
      text: 'A Trojan\'s backdoor must communicate. Egress rules and the bastion policy limit which hosts may talk to the outside, and IDS-005 flags large transfers to external IPs. The seeded rule blocking the "compromised workstation" shows containment in practice.',
      rules: ['IDS-005', 'IDS-008', 'IDS-002'],
      links: [{ to: '/hosts', label: 'Hosts and bastion' }, { to: '/firewall', label: 'Firewall' }]
    },
    related: ['botnets-ddos', 'rootkit', 'mobile-code-drive-by']
  },
  {
    slug: 'logic-bomb',
    title: 'Logic Bomb',
    category: 'other',
    level: 3,
    vectors: ['social'],
    summary: 'Code embedded in a legitimate program that stays quiet until a condition is met, then performs a damaging action.',
    overview: [
      'A logic bomb is code embedded in a legitimate program that is set to "explode" when certain conditions are met. Conditions can be the presence or absence of a file, a particular date or time, or the identity of a user. When triggered, it might alter or delete data or files, cause a machine to halt, or do other damage.',
      'Logic bombs are not self-replicating and usually spread no further than the program that contains them. They are most often planted by insiders such as developers or administrators with legitimate access, for example a routine that fires if the programmer\'s name disappears from the payroll. Because the code is part of an authorised program, it can survive for years.',
      'Defence is mainly procedural: code review, separation of duties, change control and version-control history, plus monitoring of privileged accounts. Technical monitoring cannot detect a dormant bomb; it can only detect the effect when it fires.'
    ],
    traits: [
      'Condition-triggered payload (date, event, file, user)',
      'Embedded in otherwise legitimate software',
      'Usually planted by insiders',
      'Dormant until triggered, hence hard to detect'
    ],
    lifecycle: [
      { name: 'Plant', text: 'An insider adds the hidden routine to a production program or script.' },
      { name: 'Dormant', text: 'The code checks its condition at each run and does nothing visible.' },
      { name: 'Trigger', text: 'The condition becomes true: a date, a missing record, a login by a certain user.' },
      { name: 'Detonate', text: 'Data is deleted or corrupted, or services are disrupted.' }
    ],
    spread: ['Does not spread; resides in the program where it was planted'],
    examples: [
      { name: 'Omega Engineering', year: '1996', note: 'A former network administrator\'s script deleted the company\'s critical files after a trigger date; he was convicted.' },
      { name: 'UBS PaineWebber', year: '2002', note: 'A system administrator planted a bomb on thousands of servers, set to fire on a market day; he was prosecuted.' },
      { name: 'Date-triggered viruses', year: '1990s', note: 'Michelangelo, Jerusalem and CIH used calendar dates as the trigger of their payload, a logic-bomb mechanism.' }
    ],
    detection: [
      'Code review and diff of production scripts',
      'Unexpected scheduled tasks or cron entries',
      'Integrity checking of critical programs',
      'Audit trails of who changed what'
    ],
    countermeasures: [
      'Two-person review and change control for production code',
      'Separation of duties; revoke access immediately at termination',
      'Immutable, offline backups',
      'Monitoring of privileged and departing employees'
    ],
    sentinel: {
      text: 'A logic bomb is an insider threat. Sentinel\'s alerts show effects (traffic spikes, bulk transfer) rather than the dormant code, which is why defence in depth and audit logging matter.',
      rules: ['IDS-005', 'IDS-006'],
      links: [{ to: '/alerts', label: 'Alert panel' }]
    },
    related: ['intruders', 'trojan-horse', 'intruder-classes']
  },
  {
    slug: 'rootkit',
    title: 'Rootkit',
    category: 'other',
    level: 5,
    vectors: ['social', 'file', 'web'],
    summary: 'A set of tools installed after gaining privileged access that hides the attacker\'s presence and maintains access to the system.',
    overview: [
      'A rootkit is a set of programs installed on a system to maintain covert access to that system with administrator (root) privileges while hiding evidence of its presence. It modifies the operating system or its data so that the standard tools cannot see the attacker\'s processes, files, registry keys or network connections.',
      'Rootkits are classified by where they operate. User-mode rootkits patch libraries and applications. Kernel-mode rootkits modify kernel code, system call tables or drivers, and are more powerful and harder to detect. Bootkits and firmware rootkits live in the boot process or in device firmware, surviving operating system reinstallation. A virtualised rootkit runs the system as a guest beneath itself.',
      'Because the compromised system cannot be trusted to report on itself, detection uses an outside viewpoint: scanning from trusted boot media, comparing outputs of high-level and low-level system views, memory forensics, and network monitoring. Many responders consider that a rooted machine should be rebuilt rather than cleaned.'
    ],
    traits: [
      'Hides processes, files, and connections',
      'Requires administrative or kernel-level access',
      'Provides persistent backdoor access',
      'Variants from user mode to firmware level'
    ],
    lifecycle: [
      { name: 'Gain privilege', text: 'The attacker uses an exploit, stolen credential or Trojan to obtain admin rights.' },
      { name: 'Install', text: 'The rootkit hooks system calls, replaces binaries or loads a driver.' },
      { name: 'Conceal', text: 'Queries for processes, files and ports are filtered to omit its components.' },
      { name: 'Persist', text: 'It survives reboots and provides a hidden channel back to the attacker.' }
    ],
    spread: ['Not self-spreading; installed after another compromise, often via a Trojan or an exploit'],
    examples: [
      { name: 'Sony BMG copy protection', year: '2005', note: 'A music CD DRM system installed a rootkit-like cloaking driver, exposing users to risk.' },
      { name: 'Stuxnet', year: '2010', note: 'Included rootkit components to hide its files and the industrial-controller modifications.' },
      { name: 'TDL4 / Alureon', year: '2010', note: 'A bootkit that infected the master boot record and hid a botnet agent.' }
    ],
    detection: [
      'Mismatch between API-level and raw disk or process listings',
      'Hooked system call tables found during memory analysis',
      'Unexplained outbound connections from a "clean" machine',
      'Integrity measurement failures at boot'
    ],
    countermeasures: [
      'Secure boot and measured boot with a TPM',
      'Driver signing enforcement',
      'Offline scanning and forensic memory inspection',
      'Rebuild from trusted media after confirmed compromise',
      'Network monitoring that does not trust the host'
    ],
    sentinel: {
      text: 'This is why Sentinel analyses packets at the network: a rootkit may fool the host, but its covert channel still crosses the wire. Look for beaconing, odd destination ports and bastion bypass.',
      rules: ['IDS-008', 'IDS-009', 'IDS-002'],
      links: [{ to: '/hosts', label: 'Hosts and bastion' }, { to: '/ids-rules', label: 'Detection rules' }]
    },
    related: ['stealth-virus', 'trojan-horse', 'intruder-classes']
  },
  {
    slug: 'botnets-ddos',
    title: 'Botnets and DDoS Zombies',
    category: 'other',
    level: 5,
    vectors: ['network', 'email', 'web'],
    summary: 'A botnet is a collection of compromised hosts (bots or zombies) remotely controlled to launch coordinated attacks such as DDoS.',
    overview: [
      'A bot (also called a zombie) is a compromised machine running software that lets an attacker control it remotely. A collection of bots under a common command-and-control (C2) infrastructure is a botnet. Bots are recruited by worms, Trojans and drive-by downloads, so botnets are the result rather than the means of infection.',
      'Botnets are used for distributed denial of service (DDoS), spam, credential stuffing, click fraud, proxying criminal traffic and hosting phishing. In a DDoS attack, thousands of bots send traffic to a victim at once, exhausting bandwidth (volumetric floods such as ICMP or UDP), connection tables (SYN floods), or application resources (HTTP floods). A SYN flood sends large numbers of connection requests without completing the handshake, filling the target\'s half-open connection queue.',
      'Control architectures include centralised IRC or HTTP servers, peer-to-peer designs that remove the single point of failure, and fast-flux DNS to hide servers. Defence involves cleaning bots from your network, filtering outbound abuse, absorbing attacks upstream through scrubbing services, and applying SYN cookies and rate limits.'
    ],
    traits: [
      'Hosts remotely controlled via command-and-control channels',
      'Recruited by worms, Trojans or exploits',
      'Used for DDoS, spam, fraud',
      'Attacks come from many distributed sources, hard to block by IP'
    ],
    lifecycle: [
      { name: 'Recruit', text: 'A worm or Trojan infects the host and installs a bot agent.' },
      { name: 'Rally', text: 'The bot contacts the C2 server and waits for instructions.' },
      { name: 'Command', text: 'The botmaster issues a target and an attack type.' },
      { name: 'Attack', text: 'All bots flood the victim simultaneously; the botmaster stays hidden.' }
    ],
    spread: ['Worms recruiting vulnerable servers or IoT devices', 'Trojans and malicious downloads', 'Default or weak credentials on devices'],
    examples: [
      { name: 'Storm', year: '2007', note: 'Peer-to-peer botnet spread by e-mail lures.' },
      { name: 'Mirai', year: '2016', note: 'Recruited IoT devices through default passwords and drove record-size DDoS attacks.' },
      { name: 'Conficker', year: '2008', note: 'Worm that built one of the largest botnets by exploiting a Windows service flaw.' }
    ],
    detection: [
      'Outbound floods from internal hosts',
      'Periodic beaconing to a C2 address',
      'Sudden surge of SYN, ICMP or UDP packets against a destination',
      'Hosts sending spam or probing other networks'
    ],
    countermeasures: [
      'Egress filtering and rate limiting',
      'SYN cookies, connection limits and upstream scrubbing',
      'Change default credentials, patch devices',
      'Sinkhole or block C2 domains'
    ],
    sentinel: {
      text: 'Use the "ddos" scenario to generate a SYN flood. IDS-004 (SYN flood: 100 or more SYN packets to one destination in 10 s) and IDS-007 (ICMP flood) fire, and the packets_per_sec anomaly metric jumps well above its z-score threshold.',
      rules: ['IDS-004', 'IDS-007', 'IDS-006'],
      links: [{ to: '/traffic', label: 'Traffic generator' }, { to: '/anomaly', label: 'Anomaly detector' }, { to: '/alerts', label: 'Alert panel' }]
    },
    related: ['network-scanning-worms', 'trojan-horse', 'how-sentinel-detects']
  }
];
