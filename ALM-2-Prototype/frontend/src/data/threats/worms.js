// Worm family articles. Educational, defensive content only.
export const worms = [
  {
    slug: 'worms',
    title: 'Worms',
    category: 'worms',
    level: 5,
    vectors: ['network', 'email'],
    summary: 'A worm is self-contained malware that replicates itself across networks by itself, with no host program and often no user action.',
    overview: [
      'A computer worm is a program that actively seeks out more machines to infect, and each infected machine then serves as an automated launching pad for attacks on others. Unlike a virus, a worm needs no host file and no human to run it. It exploits software vulnerabilities, weak credentials or user trust in network services to copy itself and start itself on the next machine.',
      'Typical worm propagation has three steps. First it finds targets, by scanning addresses, reading address books or following trust relationships. Second it gains access, by exploiting a flaw or tricking a user. Third it transfers and starts a copy of itself. Because each new victim becomes a new source, spread is exponential at first, then slows as vulnerable hosts are exhausted, giving the characteristic S-shaped infection curve.',
      'Worms are dangerous even without a payload: the traffic of replication alone can saturate links and crash routers. Modern worms combine fast propagation with payloads such as backdoors, botnet agents, data wipers or ransomware.'
    ],
    traits: [
      'Self-replicating and self-propagating over networks',
      'No host program needed; exists as a standalone process or service',
      'Exploits vulnerabilities, weak passwords or e-mail trust',
      'Exponential growth until vulnerable hosts run out',
      'Can saturate bandwidth with scanning traffic alone'
    ],
    lifecycleTitle: 'Worm propagation cycle',
    lifecycle: [
      { name: 'Target discovery', text: 'Scans address ranges, reads address books, or uses lists of hosts to find victims.' },
      { name: 'Exploitation', text: 'Uses a vulnerability, a weak credential or a deceptive message to gain code execution.' },
      { name: 'Replication', text: 'Transfers a copy of itself to the victim and starts it, with no help from the user.' },
      { name: 'Payload and repeat', text: 'Delivers its payload, and the new host starts discovering further targets.' }
    ],
    spread: [
      'Network scanning of vulnerable services (random, local-subnet or hit-list)',
      'E-mail with self-attached or linked copies',
      'Network shares and trust relationships (remote login, file sharing)',
      'Removable media with auto-run, and instant messaging links'
    ],
    examples: [
      { name: 'Morris Worm', year: '1988', note: 'First major internet worm; exploited several Unix services and slowed a large part of the early internet.' },
      { name: 'Code Red', year: '2001', note: 'Random-scanning worm that exploited a web server flaw and ran a DoS payload.' },
      { name: 'SQL Slammer', year: '2003', note: 'A single small UDP packet; saturated links worldwide within minutes.' },
      { name: 'WannaCry', year: '2017', note: 'Ransomware with a network worm component.' }
    ],
    detection: [
      'Surges of outbound connections to many different hosts',
      'Large numbers of failed connections to closed ports',
      'Many hosts showing the same new traffic pattern at the same time',
      'Saturated links or crashing network devices'
    ],
    countermeasures: [
      'Patch management; most worms exploit known, patched flaws',
      'Network segmentation and host firewalls that deny unneeded inbound services',
      'Egress filtering and rate limiting of scanning behaviour',
      'IDS/IPS signatures plus anomaly detection of scanning',
      'Quarantine infected hosts quickly'
    ],
    sentinel: {
      text: 'Scanning is the worm fingerprint. Run the "port_scan" and "ddos" scenarios in the traffic generator to see how IDS-003 and IDS-004 react, and how a firewall deny-by-default policy blocks most probes.',
      rules: ['IDS-003', 'IDS-004', 'IDS-006', 'IDS-009'],
      links: [{ to: '/traffic', label: 'Traffic generator' }, { to: '/ids-rules', label: 'Detection rules' }, { to: '/firewall', label: 'Firewall' }]
    },
    related: ['computer-viruses', 'network-scanning-worms', 'email-worms']
  },
  {
    slug: 'email-worms',
    title: 'E-mail and Mass-mailing Worms',
    category: 'worms',
    level: 4,
    vectors: ['email', 'social'],
    summary: 'Spread by mailing copies of themselves to address-book contacts, relying on the recipient trusting the sender.',
    overview: [
      'Mass-mailing worms propagate through electronic mail. After infection, the worm harvests addresses from the local mail client, address book or documents and sends itself, usually as an attachment or link, to each. Messages come from a trusted contact and carry an enticing subject, so recipients open them. Some worms carry their own mail engine (SMTP client) so they do not depend on a particular program.',
      'The spread is fast because humans are the delivery mechanism and the social graph is dense. The cost is also seen at mail servers: queues overflow, and mailboxes fill with duplicates. In many outbreaks the mail infrastructure itself had to be shut down until filters were deployed.',
      'Defences are a mix of technology and behaviour: attachment filtering, scanning at the gateway, outbound rate limits, and user training. These worms show that a social engineering component can be as effective as a technical exploit.'
    ],
    traits: [
      'Uses address books and mail systems as the propagation graph',
      'Attached or linked executable or script, often disguised by double extension',
      'Social engineering lures: love letters, invoices, shipping notices',
      'Can overwhelm mail servers with volume'
    ],
    lifecycle: [
      { name: 'Receive', text: 'The user receives a message from a known contact with an inviting subject.' },
      { name: 'Open', text: 'Opening the attachment or link runs the worm.' },
      { name: 'Harvest', text: 'It collects addresses from the mail client and local files.' },
      { name: 'Mail out', text: 'It sends copies to every address, starting the next wave.' }
    ],
    spread: ['Attachments with double extensions', 'Links to malicious downloads', 'Forged sender addresses'],
    examples: [
      { name: 'Melissa', year: '1999', note: 'Word macro that mailed itself to the first 50 entries of the address book; forced some mail systems offline.' },
      { name: 'ILOVEYOU (Love Bug)', year: '2000', note: 'VBScript worm with the subject "ILOVEYOU"; mailed itself to all Outlook contacts and overwrote files. Spread globally within hours.' },
      { name: 'Mydoom', year: '2004', note: 'Fast-spreading mass-mailer that also installed a backdoor and launched a DDoS attack.' }
    ],
    detection: [
      'Spike in outbound SMTP traffic from a single workstation',
      'Many identical messages with the same attachment',
      'Mail queue growth and bounce messages for unknown recipients',
      'Gateway scanner hits on script attachments'
    ],
    countermeasures: [
      'Strip or quarantine executable and script attachments',
      'Show full file extensions so that double extensions are visible',
      'Outbound rate limits on SMTP for workstations',
      'Block direct SMTP from user hosts; force mail through a relay',
      'Awareness training'
    ],
    sentinel: {
      text: 'A mass-mailing host sends an abnormal number of packets to many destinations. Packets-per-second z-scores and the per-source profile (ANOM-SRC) highlight the host, while the firewall can block direct outbound mail with a deny rule.',
      rules: ['IDS-006'],
      links: [{ to: '/anomaly', label: 'Anomaly detector' }, { to: '/firewall', label: 'Firewall rules' }]
    },
    related: ['macro-virus', 'worms', 'trojan-horse']
  },
  {
    slug: 'network-scanning-worms',
    title: 'Network and Scanning Worms',
    category: 'worms',
    level: 5,
    vectors: ['network'],
    summary: 'Probe address space for vulnerable services and copy themselves directly to victims, spreading at machine speed.',
    overview: [
      'A network (or scanning) worm finds victims by probing addresses and ports and attacks services that contain a known vulnerability. No human is involved, so spread is limited only by bandwidth, scanning strategy and the number of vulnerable hosts. Target selection strategies include random scanning, local-subnet preference (hosts nearby are likely to be similar and reachable), permutation scanning (so that probes avoid repeating), and hit lists prepared in advance.',
      'The Morris worm of 1988 exploited several flaws: a buffer overflow in the finger service, the debug mode in sendmail, and dictionary attacks on passwords together with trust relationships between hosts. A coding error made it re-infect already infected machines, which caused load to climb until systems were unusable. Code Red (2001) targeted a buffer overflow in a web server component and chose addresses at random. SQL Slammer (2003) fitted in a single UDP packet of about 376 bytes, so a host could send probes as fast as its link allowed; it reached most vulnerable hosts within roughly ten minutes and congested networks around the world.',
      'Scanning traffic has a distinctive shape: many destinations or ports, many failures, and a high rate. This is exactly what network IDS sensors look for.'
    ],
    traits: [
      'Active target discovery by scanning',
      'Exploits a specific network service flaw',
      'No user interaction needed',
      'Speed depends on scanning strategy and packet size'
    ],
    lifecycle: [
      { name: 'Scan', text: 'Generates addresses and probes ports; most probes fail.' },
      { name: 'Exploit', text: 'Sends a crafted request to a vulnerable service and gains code execution.' },
      { name: 'Copy', text: 'Downloads or pushes its full body onto the host.' },
      { name: 'Scan again', text: 'The new host starts scanning, doubling the infected population.' }
    ],
    spread: ['Random IP scanning', 'Subnet-local scanning', 'Hit lists and permutation scanning'],
    examples: [
      { name: 'Morris Worm', year: '1988', note: 'Used several Unix flaws; one fault made it replicate excessively and overload hosts.' },
      { name: 'Code Red', year: '2001', note: 'Infected hundreds of thousands of web servers within hours; defaced pages and attempted a DoS against a fixed address.' },
      { name: 'SQL Slammer', year: '2003', note: 'One UDP packet to port 1434; bandwidth-limited rather than latency-limited growth.' },
      { name: 'Blaster', year: '2003', note: 'Exploited an RPC service on port 135.' }
    ],
    detection: [
      'One source touching many distinct destination ports or hosts',
      'High ratio of denied or failed connections',
      'Sudden rise in packets per second across the network',
      'Traffic on ports of services normally unused'
    ],
    countermeasures: [
      'Prompt patching of exposed services',
      'Default-deny firewall and closing unused ports',
      'Rate limiting and connection-failure throttling for hosts',
      'Network segmentation to limit lateral spread',
      'Ingress filtering of known worm ports'
    ],
    sentinel: {
      text: 'Perfect match for IDS-003 (port scan: 10 or more distinct destination ports in 30 s), IDS-006 (blocked-traffic storm) and the "distinct_ports_per_src" anomaly metric. Try the port_scan scenario.',
      rules: ['IDS-003', 'IDS-006', 'IDS-009', 'IDS-007'],
      links: [{ to: '/traffic', label: 'Traffic generator' }, { to: '/alerts', label: 'Alerts' }, { to: '/anomaly', label: 'Anomaly detector' }]
    },
    related: ['worms', 'ransomware-worms', 'intrusion-detection-concepts']
  },
  {
    slug: 'mobile-code-drive-by',
    title: 'Mobile Code and Drive-by Downloads',
    category: 'worms',
    level: 3,
    vectors: ['web', 'social'],
    summary: 'Code that travels from a remote system to run on a local one, abused through web pages that infect visitors without any download click.',
    overview: [
      'Mobile code refers to programs such as scripts, macros and applets that are transmitted from a remote system and executed on a local one, usually with little or no explicit user action. Legitimate uses are common (JavaScript, WebAssembly, Office macros). It becomes a threat when the execution environment is flawed or too permissive, so that the code can escape its sandbox or when it is delivered as a vehicle for a worm, virus or trojan.',
      'A drive-by download occurs when merely visiting a web page causes malware to be installed. The attacker either compromises a legitimate site or buys advertising space, and the page contains script that probes the browser and its plugins for known vulnerabilities, then silently delivers an exploit. Because the user did nothing unusual, the technique has been a major infection vector for exploit kits and botnets.',
      'Defences focus on shrinking the attack surface: keep browsers patched, remove unnecessary plugins, apply site isolation and sandboxing, block known malicious domains and scripts, and restrict what mobile code can do through content security policies and code signing.'
    ],
    traits: [
      'Executes automatically when content is viewed',
      'Delivered via compromised sites, malicious ads or phishing links',
      'Targets unpatched browsers and plugins',
      'Often the first stage of a multi-step infection'
    ],
    lifecycle: [
      { name: 'Lure', text: 'The victim visits a legitimate but compromised page or is redirected from an advertisement.' },
      { name: 'Fingerprint', text: 'Script checks the browser, plugin versions and operating system.' },
      { name: 'Exploit', text: 'A matching vulnerability is used to run code outside the sandbox.' },
      { name: 'Install', text: 'A loader fetches the real malware such as a trojan or bot agent.' }
    ],
    spread: ['Compromised websites', 'Malicious advertising (malvertising)', 'Phishing links', 'Rogue plugins and extensions'],
    examples: [
      { name: 'Exploit kits (Angler, RIG)', year: '2010s', note: 'Commercial toolkits that automated fingerprinting and exploitation of visitors.' },
      { name: 'Malvertising campaigns', year: '2010s', note: 'Ad networks delivered exploit pages to visitors of major news sites.' },
      { name: 'Java applet attacks', year: '2012-2013', note: 'Browser plugins that ran mobile code were widely exploited before being phased out.' }
    ],
    detection: [
      'Browser spawning unexpected child processes',
      'Redirect chains through unfamiliar domains',
      'Outbound connection to a never-seen server right after browsing',
      'Web filter or reputation service alerts'
    ],
    countermeasures: [
      'Patch browsers and remove unneeded plugins',
      'Sandboxing and site isolation',
      'DNS and web filtering, ad blocking',
      'Content Security Policy for sites you operate',
      'Run with a non-administrator account'
    ],
    sentinel: {
      text: 'Sentinel is a network-level tool: it cannot see inside a browser, but it can enforce egress policy. Denying unneeded outbound ports and spotting unusual data_transfer sizes limits what a drive-by loader can do next.',
      rules: ['IDS-005', 'IDS-006'],
      links: [{ to: '/firewall', label: 'Firewall rules' }]
    },
    related: ['trojan-horse', 'botnets-ddos', 'worms']
  },
  {
    slug: 'ransomware-worms',
    title: 'Ransomware Worms',
    category: 'worms',
    level: 5,
    vectors: ['network', 'email'],
    summary: 'Combine a worm propagation engine with file encryption and extortion, as in the WannaCry outbreak of 2017.',
    overview: [
      'Ransomware encrypts a victim\'s files, or locks the system, and demands payment for the key. On its own it requires a delivery method such as a phishing e-mail. A ransomware worm adds a propagation engine so that one infection spreads across the network without user action, multiplying the damage and the pressure on the victim.',
      'WannaCry (May 2017) is the standard case study. It exploited a flaw in the Windows SMBv1 file-sharing protocol (patched by Microsoft two months earlier, bulletin MS17-010) to spread among machines reachable on TCP port 445, installed a backdoor component, encrypted files and displayed a ransom note requesting Bitcoin. It also scanned random internet addresses. It infected hundreds of thousands of systems in about 150 countries, including parts of the UK health service. A hard-coded "kill switch" domain, when registered by a researcher, halted much of the spread. NotPetya (June 2017) used similar propagation but behaved as a destructive wiper disguised as ransomware.',
      'The lessons are practical: unpatched legacy services, flat internal networks, and lack of tested offline backups turn a single infection into an organisation-wide outage.'
    ],
    traits: [
      'Worm propagation plus encryption payload',
      'Targets file-sharing protocols such as SMB (port 445)',
      'Extortion note with cryptocurrency payment demand',
      'Can be destructive even when payment is made'
    ],
    lifecycle: [
      { name: 'Entry', text: 'A first host is infected by phishing or an exposed service.' },
      { name: 'Spread', text: 'The worm component scans the local network and internet for vulnerable SMB services.' },
      { name: 'Encrypt', text: 'Files are encrypted and a ransom note is displayed.' },
      { name: 'Extort', text: 'Payment is demanded; meanwhile the cycle repeats on neighbouring hosts.' }
    ],
    spread: ['SMB exploit on port 445', 'Phishing as initial access', 'Stolen administrative credentials'],
    examples: [
      { name: 'WannaCry', year: '2017', note: 'SMBv1 exploit plus ransomware; stopped partly by a kill-switch domain.' },
      { name: 'NotPetya', year: '2017', note: 'Spread through SMB and credential theft; wiped data despite ransom note.' },
      { name: 'Ryuk / modern ransomware crews', year: '2018 onward', note: 'Manual lateral movement followed by mass encryption.' }
    ],
    detection: [
      'Bursts of connections to TCP port 445 across many hosts',
      'Mass file renames or entropy rise in file contents',
      'Shadow copy deletion',
      'Access attempts to sensitive ports from outside'
    ],
    countermeasures: [
      'Patch quickly; disable SMBv1',
      'Block port 445 at the perimeter and segment internal networks',
      'Offline and immutable backups, tested restores',
      'Least privilege and application allow-listing',
      'Incident response plan to isolate infected hosts fast'
    ],
    sentinel: {
      text: 'The seeded firewall denies TCP 3389 and 445 from everywhere, and IDS-009 raises an alert on sensitive port probes (3389/445/3306/5432) from external sources. A scanning wave also triggers IDS-003 and the anomaly metrics.',
      rules: ['IDS-009', 'IDS-003', 'IDS-006', 'IDS-008'],
      links: [{ to: '/firewall', label: 'Firewall rules' }, { to: '/ids-rules', label: 'Detection rules' }, { to: '/lab', label: 'Guided labs' }]
    },
    related: ['network-scanning-worms', 'worms', 'antivirus-countermeasures']
  }
];
