// Virus family articles. Educational, defensive content only.
export const viruses = [
  {
    slug: 'computer-viruses',
    title: 'Computer Viruses',
    category: 'viruses',
    level: 3,
    vectors: ['file', 'removable', 'email'],
    summary: 'A virus is a piece of software that infects other programs by embedding a copy of itself, and needs a host plus human action to spread.',
    overview: [
      'A computer virus is a program that can infect other programs by modifying them so that they include a (possibly evolved) copy of the virus. Like its biological namesake it cannot reproduce on its own: it needs a host, such as an executable, a document or a boot sector, and it runs only when that host is executed or opened. The infected host is then used to infect further hosts.',
      'A virus has two conceptual parts. The infection mechanism (the infection vector) is the means by which it finds new targets and replicates. The payload is whatever else it does, which may be nothing, may be a prank, or may be destructive or data stealing. A trigger decides when the payload runs, for example a date, a counter or the presence of a particular file.',
      'Because a virus relies on a user or a system process to run the carrier, the classic spreading channels were floppy disks and shared executables, later e-mail attachments and shared documents, and today removable USB media and trojanised downloads. This dependence on a host is the central difference between viruses and worms.'
    ],
    traits: [
      'Needs a host file, document or boot area to live in',
      'Spreads only when the infected host is run or opened',
      'Has an infection mechanism, a trigger and a payload',
      'May hide itself with encryption, mutation or stealth techniques',
      'Usually leaves signs: changed file sizes, hashes, timestamps'
    ],
    lifecycleTitle: 'Four phases of a virus lifetime',
    lifecycle: [
      { name: 'Dormant phase', text: 'The virus is idle. It waits for an event such as a date, the presence of another program or disk usage crossing a threshold. Not all viruses have this stage.' },
      { name: 'Propagation phase', text: 'The virus places an identical copy of itself into other programs or into certain system areas of the disk. Each infected program now carries the virus and will propagate it in turn.' },
      { name: 'Triggering phase', text: 'The virus is activated to perform the function it was built for. The trigger may be a system event such as a count of copies the virus has made.' },
      { name: 'Execution phase', text: 'The payload runs. It can be harmless, like a message on screen, or damaging, like destroying files or installing a backdoor.' }
    ],
    spread: [
      'Executing an infected program from a download, share or removable disk',
      'Opening an infected document that carries active macros',
      'Booting a machine from an infected disk or USB device',
      'Copying infected files across network shares by a user'
    ],
    examples: [
      { name: 'Brain', year: '1986', note: 'Often cited as the first PC virus; a boot sector infector for floppy disks.' },
      { name: 'Jerusalem', year: '1987', note: 'File infector that triggered on Friday the 13th and deleted programs run on that day.' },
      { name: 'Michelangelo', year: '1991', note: 'Boot sector virus with a date trigger (6 March) that overwrote disk data.' },
      { name: 'CIH / Chernobyl', year: '1998', note: 'Windows file infector with a destructive payload that attacked firmware and disks.' }
    ],
    detection: [
      'Unexpected changes in executable size, checksum or modification time',
      'Programs that load slowly, crash or behave oddly',
      'Unusual disk activity or new files that nobody created',
      'Antivirus signature hits on a known byte pattern'
    ],
    countermeasures: [
      'Prevention: use trusted software sources, disable auto-run, apply least privilege',
      'Detection: signature and heuristic scanning, integrity checking of executables',
      'Identification and removal: clean the host or restore from known-good backups',
      'Keep scanners updated; unpatched definitions are blind to new strains'
    ],
    sentinel: {
      text: 'Pure viruses spread inside a host and are mostly invisible on the wire, so Sentinel focuses on what they do afterwards: calling home, scanning, or exfiltrating. A compromised workstation can be quarantined with a deny rule, as in the seeded "Block compromised workstation" firewall rule.',
      rules: ['IDS-005', 'IDS-006'],
      links: [{ to: '/firewall', label: 'Firewall rules' }, { to: '/ids-rules', label: 'Detection rules' }]
    },
    related: ['file-infector-virus', 'worms', 'antivirus-countermeasures']
  },
  {
    slug: 'file-infector-virus',
    title: 'File Infector Virus',
    category: 'viruses',
    level: 3,
    vectors: ['file', 'removable'],
    summary: 'Attaches its code to executable files so that the virus runs whenever the infected program is launched.',
    overview: [
      'A file infector (also called a parasitic virus) is the most traditional form of virus. It attaches itself to an executable file, then replicates when the infected program runs, searching for other executables to infect. The original program usually still works so that the user notices nothing.',
      'There are several insertion strategies. A prepending virus puts its code before the host code; an appending virus places it at the end and changes the entry point to jump to it first; a cavity virus uses unused padding inside the file so the size does not change. After the virus body finishes, it hands control back to the original program.',
      'Because the host file changes, file infectors are the classic target of integrity checking. A hash of a clean executable will no longer match after infection, which is why file integrity monitors and checksum-based scanners remain useful today.'
    ],
    traits: [
      'Modifies executable files (EXE, COM, DLL, scripts)',
      'Returns control to the host so the program still works',
      'Often infects every program it can reach each time it runs',
      'Insertion styles: prepending, appending, cavity'
    ],
    lifecycle: [
      { name: 'Host runs', text: 'The user launches an infected program and the virus code gets control first.' },
      { name: 'Search', text: 'The virus enumerates directories for uninfected executables, checking for its own marker.' },
      { name: 'Infect', text: 'It writes its body into each target and patches the entry point.' },
      { name: 'Hand back', text: 'It passes control to the original code, so the user sees normal behaviour.' }
    ],
    spread: ['Sharing infected programs', 'Pirated or cracked software', 'Shared network drives with writable executables'],
    examples: [
      { name: 'Jerusalem', year: '1987', note: 'Appended itself to COM and EXE files and re-infected on every run.' },
      { name: 'CIH', year: '1998', note: 'Wrote itself into spare gaps of Windows executables, so file size stayed unchanged.' },
      { name: 'Sality', year: '2003', note: 'Long-lived polymorphic file infector that also built a botnet.' }
    ],
    detection: [
      'Hash mismatch against a known-good baseline',
      'Executables with unexpected size or modification date',
      'Entry point outside the normal code section',
      'Antivirus signature or heuristic alerts'
    ],
    countermeasures: [
      'File integrity monitoring with signed baselines',
      'Code signing and application allow-listing',
      'Restrict write access to program directories',
      'Restore infected executables from clean backups rather than trusting disinfection'
    ],
    sentinel: {
      text: 'A file infector acts locally, but infected hosts later show network symptoms. Watch for abnormal outbound bytes and denied-traffic storms from a single host.',
      rules: ['IDS-005', 'IDS-006'],
      links: [{ to: '/anomaly', label: 'Anomaly detector' }, { to: '/alerts', label: 'Alert panel' }]
    },
    related: ['computer-viruses', 'polymorphic-virus', 'stealth-virus']
  },
  {
    slug: 'boot-sector-virus',
    title: 'Boot Sector Virus',
    category: 'viruses',
    level: 3,
    vectors: ['boot', 'removable'],
    summary: 'Infects the master boot record or boot sector, loading before the operating system and spreading through bootable media.',
    overview: [
      'A boot sector virus infects the master boot record (MBR) or the volume boot record of a disk. The firmware reads this tiny region first when a machine starts, so the virus runs before the operating system and before any antivirus has loaded. It typically moves the original boot code elsewhere on the disk, installs itself in memory, and then chains to the real boot code.',
      'These viruses dominated the floppy disk era because people routinely left an infected disk in the drive at power-on. Once resident, the virus infects every new disk that is inserted. Modern firmware features such as Secure Boot, which verifies signed bootloaders, make classic boot infections far harder, although bootkits that target UEFI components still exist.',
      'Cleaning is delicate: rewriting the MBR can fix the infection, but if the virus encrypted or moved data, a rebuild from backup is safer.'
    ],
    traits: [
      'Executes before the operating system',
      'Resides in the first sector of a disk or partition',
      'Spreads via bootable removable media',
      'Often hooks BIOS disk interrupts to hide'
    ],
    lifecycle: [
      { name: 'Boot', text: 'A computer starts from an infected disk and the firmware runs the boot sector.' },
      { name: 'Go resident', text: 'The virus copies itself to memory and hooks disk services.' },
      { name: 'Infect media', text: 'Each disk accessed afterwards has its boot sector overwritten with the virus.' },
      { name: 'Chain boot', text: 'The saved original boot code runs so the system starts normally.' }
    ],
    spread: ['Booting from an infected floppy or USB disk', 'Sharing bootable media', 'Leaving media in the drive at power-on'],
    examples: [
      { name: 'Brain', year: '1986', note: 'Early boot sector virus that replaced the volume label of floppies.' },
      { name: 'Stoned', year: '1987', note: 'Widespread floppy virus that displayed the message "Your PC is now Stoned!".' },
      { name: 'Michelangelo', year: '1991', note: 'Date-triggered variant of Stoned that corrupted disk data.' }
    ],
    detection: [
      'MBR checksum differing from a known-good copy',
      'Reduced available memory at boot',
      'Boot failures or unexpected boot messages',
      'Boot-time scanners reporting modified sectors'
    ],
    countermeasures: [
      'Enable Secure Boot and firmware write protection',
      'Disable booting from removable media',
      'Scan media before use and keep a rescue disk',
      'Back up and verify the MBR'
    ],
    sentinel: {
      text: 'Boot infection is a host-level event that a network IDS cannot see directly. Sentinel illustrates the layered approach: firewall deny rules and anomaly detection catch what the infected host does next.',
      rules: ['IDS-006'],
      links: [{ to: '/hosts', label: 'Hosts and bastion' }]
    },
    related: ['multipartite-virus', 'stealth-virus', 'rootkit']
  },
  {
    slug: 'macro-virus',
    title: 'Macro Virus',
    category: 'viruses',
    level: 3,
    vectors: ['email', 'file'],
    summary: 'Written in the macro language of document applications, it spreads inside data files and is platform-independent.',
    overview: [
      'A macro virus is written in the scripting language embedded in applications such as word processors and spreadsheets. Macros automate repetitive tasks, but many applications allowed them to run automatically when a document was opened. A macro virus exploits this: it lives in a document template, copies itself into other documents, and uses the application itself to spread.',
      'Macro viruses became the most common threat of the late 1990s for three reasons. They are platform independent, since any system that runs the application is affected. They infect documents rather than executable code, and users share documents freely. And they are easy to write because the macro languages are high level.',
      'The risk dropped when vendors disabled macros by default and added warning prompts, and when Office files began to be blocked from the internet. Yet macro-laden attachments are still used in phishing campaigns, relying on social engineering to convince a user to click "Enable content".'
    ],
    traits: [
      'Infects data files, not compiled executables',
      'Platform independent across systems running the application',
      'Often runs automatically when a document opens',
      'Spread through e-mail attachments and file shares'
    ],
    lifecycle: [
      { name: 'Open', text: 'A user opens a document and enables macros.' },
      { name: 'Auto-run', text: 'An automatic macro runs and finds the global template.' },
      { name: 'Infect', text: 'The macro copies itself into the template so every new document is infected.' },
      { name: 'Payload', text: 'It may display a message, alter text, or fetch further malware.' }
    ],
    spread: ['E-mail attachments', 'Shared network documents', 'Downloaded templates'],
    examples: [
      { name: 'Concept', year: '1995', note: 'First widespread Word macro virus; harmless but showed the idea worked.' },
      { name: 'Melissa', year: '1999', note: 'Word macro virus that also mailed itself to the first 50 contacts, blurring virus and worm.' },
      { name: 'Emotet documents', year: '2014 onward', note: 'Macro documents used as the first stage of a large malware-delivery operation.' }
    ],
    detection: [
      'Documents containing macros from unexpected senders',
      'Template files changing without user action',
      'Mail gateways flagging macro-enabled attachments',
      'Office applications spawning command interpreters'
    ],
    countermeasures: [
      'Disable macros by default; allow only digitally signed ones',
      'Block macro-enabled attachments at the mail gateway',
      'User awareness training against "enable content" prompts',
      'Keep office software updated'
    ],
    sentinel: {
      text: 'A macro virus that mails itself shows up as a burst of outbound mail traffic. Anomaly detection on packets per second or distinct destinations would raise it above baseline.',
      rules: ['IDS-006'],
      links: [{ to: '/anomaly', label: 'Anomaly detector' }]
    },
    related: ['email-worms', 'computer-viruses', 'trojan-horse']
  },
  {
    slug: 'polymorphic-virus',
    title: 'Polymorphic Virus',
    category: 'viruses',
    level: 4,
    vectors: ['file', 'email'],
    summary: 'Mutates its appearance on every infection, typically by encrypting its body with a changing key, to defeat signature scanners.',
    overview: [
      'A polymorphic virus changes its byte pattern each time it replicates, so no single signature matches all copies. A common design encrypts the main body with a random key and prefixes a small decryptor. A mutation engine rewrites the decryptor for each copy, using different but equivalent instructions, junk code and register substitutions.',
      'Because the decrypted body is identical in memory, defenders adapted. Generic decryption (GD) technology lets a scanner run the suspect code in a safe emulated environment, waiting until the virus decrypts itself, and then applies signatures to the revealed body. This is the approach of third-generation scanning.',
      'Polymorphism is an arms-race technique: it raises the cost of detection but also leaves its own signs, such as self-modifying code and unusual decryption loops, which heuristic engines look for.'
    ],
    traits: [
      'Encrypted body with a variable decryptor',
      'Every copy has a different byte sequence',
      'Uses a mutation engine to generate new decryptors',
      'Underlying behaviour stays the same'
    ],
    lifecycle: [
      { name: 'Decrypt', text: 'The small decryptor stub restores the virus body in memory.' },
      { name: 'Run', text: 'The body executes and searches for targets.' },
      { name: 'Mutate', text: 'A new random key and new decryptor code are generated.' },
      { name: 'Re-encrypt and infect', text: 'The body is encrypted with the new key and written to the new host.' }
    ],
    spread: ['Same routes as the underlying file or macro virus'],
    examples: [
      { name: '1260 / V2PX', year: '1990', note: 'Among the first viruses to use polymorphic encryption.' },
      { name: 'Dark Avenger Mutation Engine (MtE)', year: '1992', note: 'A toolkit that made polymorphism easy for virus writers and spurred scanners to adopt emulation.' },
      { name: 'Virut', year: '2006', note: 'Polymorphic file infector linked to a botnet.' }
    ],
    detection: [
      'Emulation-based generic decryption revealing a constant body',
      'Heuristics for decryptor-like loops and self-modifying code',
      'Behavioural monitoring of what the code does after launch'
    ],
    countermeasures: [
      'Use scanners with code emulation or sandboxing',
      'Behavior-blocking and allow-listing, which ignore byte patterns',
      'Cloud reputation and frequent engine updates'
    ],
    sentinel: {
      text: 'Signature matching, the way IDS rules match known patterns, struggles with changing code. Sentinel pairs rule-based detection with statistical anomaly detection for exactly this reason: behaviour is harder to disguise than bytes.',
      rules: ['IDS-003', 'IDS-005'],
      links: [{ to: '/ids-rules', label: 'Detection rules' }, { to: '/anomaly', label: 'Anomaly detector' }]
    },
    related: ['metamorphic-virus', 'stealth-virus', 'antivirus-countermeasures']
  },
  {
    slug: 'metamorphic-virus',
    title: 'Metamorphic Virus',
    category: 'viruses',
    level: 4,
    vectors: ['file'],
    summary: 'Rewrites its entire code on each infection, with no constant decrypted body, making both signatures and emulation hard.',
    overview: [
      'A metamorphic virus goes beyond polymorphism. Instead of encrypting a constant body, it rewrites its own code every generation: instructions are reordered, replaced by equivalent ones, padded with junk, or even translated through an internal intermediate form and regenerated. As a result, successive generations may share no common byte sequence at all, even when decrypted.',
      'This is substantially harder to write than a polymorphic virus, since the virus must carry or contain a code analyser and transformer that preserves its own functionality. For defenders, it means that neither signatures nor decrypt-and-scan will work. Detection falls back on emulation, semantic analysis, heuristics that examine the structure of programs, and behaviour.',
      'Metamorphic viruses remain a research favourite and are rare in the wild, but they illustrate the limits of purely pattern-based defence.'
    ],
    traits: [
      'No constant virus body, even after decryption',
      'Self-rewriting engine alters instructions and layout',
      'Each generation is functionally equivalent but structurally unique',
      'Larger and more complex than polymorphic viruses'
    ],
    lifecycle: [
      { name: 'Disassemble', text: 'The virus analyses its own code into an internal form.' },
      { name: 'Transform', text: 'It applies substitutions, reordering and junk insertion.' },
      { name: 'Reassemble', text: 'It emits a new, different but equivalent version.' },
      { name: 'Infect', text: 'The new generation is written into the target.' }
    ],
    spread: ['Same carriers as file infectors'],
    examples: [
      { name: 'Zmist', year: '2001', note: 'Notable for "code integration": it disassembled its host and wove itself into the code.' },
      { name: 'Simile / Etap', year: '2002', note: 'Complex metamorphic virus with a large morphing engine.' },
      { name: 'Evol', year: '2000', note: 'An early metamorphic Windows virus.' }
    ],
    detection: [
      'Static analysis of control flow rather than bytes',
      'Emulation to observe run-time behaviour',
      'Machine-learning classifiers of instruction statistics'
    ],
    countermeasures: [
      'Behavioural detection and sandbox analysis',
      'Application allow-listing',
      'Defence in depth: network IDS plus endpoint controls'
    ],
    sentinel: {
      text: 'When code never looks the same, watch what it does. Anomaly detection compares metrics such as packets per second against a learned baseline using z-scores, independent of any signature.',
      rules: ['IDS-003', 'IDS-004'],
      links: [{ to: '/anomaly', label: 'Anomaly detector' }]
    },
    related: ['polymorphic-virus', 'stealth-virus', 'antivirus-countermeasures']
  },
  {
    slug: 'stealth-virus',
    title: 'Stealth Virus',
    category: 'viruses',
    level: 4,
    vectors: ['file', 'boot'],
    summary: 'Hides its presence from the user and from antivirus software by intercepting system calls and lying about files.',
    overview: [
      'A stealth virus is explicitly designed to hide from detection. Typical techniques intercept operating system calls, so that when a scanner or a directory listing asks about an infected file, the virus returns the original size, timestamp or even the original clean bytes. A boot virus might return the saved original boot sector when anyone reads sector zero.',
      'Stealth is a property rather than a family: file infectors, boot sector viruses and rootkit-like malware can all employ it. It can be combined with compression tricks to keep file size unchanged, or with encryption so that its body is not visible.',
      'The defence is to examine the system from outside the infected environment. Booting from trusted media, using a scanner that reads raw disk data, or comparing hashes calculated by an independent trusted system will reveal differences that the live system conceals.'
    ],
    traits: [
      'Hooks system calls to falsify what is reported',
      'Presents the original size and content of infected files',
      'Often memory resident',
      'Can be combined with polymorphism'
    ],
    lifecycle: [
      { name: 'Go resident', text: 'Loads in memory and hooks file and disk APIs.' },
      { name: 'Intercept', text: 'Requests for infected objects are answered with clean-looking data.' },
      { name: 'Infect quietly', text: 'New files are infected without changing the reported size.' },
      { name: 'Persist', text: 'Stays hidden while the payload waits for its trigger.' }
    ],
    spread: ['Same carriers as the base virus'],
    examples: [
      { name: 'Frodo (4096)', year: '1989', note: 'A classic DOS stealth virus that hid its size increase.' },
      { name: 'Brain', year: '1986', note: 'Redirected reads of the boot sector to a saved clean copy.' },
      { name: 'Tequila', year: '1991', note: 'Combined stealth with multipartite spread.' }
    ],
    detection: [
      'Cross-view analysis: compare high-level and raw disk listings',
      'Out-of-band scanning from clean boot media',
      'Memory scanning for hooked interrupts or API tables'
    ],
    countermeasures: [
      'Boot from trusted media for scanning',
      'Hardware-based integrity measurement (secure and measured boot)',
      'Hash baselines kept on read-only or remote storage'
    ],
    sentinel: {
      text: 'A host can lie about itself but not about the packets it sends. Network-level detection in Sentinel observes traffic independent of the endpoint.',
      rules: ['IDS-006', 'IDS-008'],
      links: [{ to: '/traffic', label: 'Traffic generator' }]
    },
    related: ['rootkit', 'polymorphic-virus', 'boot-sector-virus']
  },
  {
    slug: 'multipartite-virus',
    title: 'Multipartite Virus',
    category: 'viruses',
    level: 4,
    vectors: ['boot', 'file', 'removable'],
    summary: 'Infects both boot sectors and executable files, so removing only one infection lets the other re-infect.',
    overview: [
      'A multipartite virus uses more than one infection method. The usual combination is a boot sector infection together with file infection. When an infected program runs, it also writes itself to the boot sector; when the machine boots from that disk, the virus loads into memory and then infects programs.',
      'This dual nature makes cleaning harder. If an administrator removes the file infections but leaves the boot sector copy, the virus will return at next boot, and the reverse is also true. Antivirus software must therefore clean every location in a coordinated way.',
      'The class showed early that malware benefits from multiple propagation paths, an idea that matured in worms that use several vulnerabilities, shares and mail at once.'
    ],
    traits: [
      'Two or more infection vectors',
      'Re-infects cleaned areas from the remaining one',
      'Often combined with stealth techniques',
      'Harder to eradicate completely'
    ],
    lifecycle: [
      { name: 'Run a file', text: 'The infected program runs and installs the virus in memory.' },
      { name: 'Infect boot area', text: 'The virus writes itself into the boot sector.' },
      { name: 'Infect more files', text: 'While resident it infects executables as they are used.' },
      { name: 'Reboot', text: 'Next start loads the boot copy, restoring the cycle.' }
    ],
    spread: ['Infected files', 'Infected bootable media'],
    examples: [
      { name: 'Tequila', year: '1991', note: 'Infected the MBR and executables, with stealth and polymorphism.' },
      { name: 'Invader', year: '1992', note: 'DOS multipartite virus infecting files and boot records.' },
      { name: 'Ghostball', year: '1989', note: 'Often credited as the first multipartite virus.' }
    ],
    detection: [
      'Both MBR and executable integrity checks failing',
      'Re-appearance of infection after cleaning',
      'Boot-time and file-level scanning in combination'
    ],
    countermeasures: [
      'Clean boot area and files in a single procedure from clean media',
      'Rebuild from verified backups',
      'Layered defences: file integrity plus boot protections'
    ],
    sentinel: {
      text: 'Multiple vectors call for multiple controls. Sentinel layers a firewall, rule-based IDS and anomaly IDS so that evading one layer does not evade all.',
      rules: ['IDS-003', 'IDS-006'],
      links: [{ to: '/firewall', label: 'Firewall' }, { to: '/ids-rules', label: 'IDS rules' }]
    },
    related: ['boot-sector-virus', 'file-infector-virus', 'stealth-virus']
  }
];
