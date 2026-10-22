export const TYPES = [
  { key: 'http', label: 'HTTP', glyph: 'GET', tone: '--cyan', protocol: 'TCP', port: 80, portEditable: true, blurb: 'Plain web request. Cleartext, usually allowed to web servers.', ctrl: [] },
  { key: 'https', label: 'HTTPS', glyph: 'TLS', tone: '--ok', protocol: 'TCP', port: 443, portEditable: true, blurb: 'Encrypted web traffic on 443.', ctrl: [] },
  { key: 'ssh_login', label: 'SSH login', glyph: 'SSH', tone: '--violet', protocol: 'TCP', port: 22, portEditable: false, blurb: 'Login attempts. Repeated failures look like brute force.', ctrl: ['success'] },
  { key: 'telnet', label: 'Telnet', glyph: 'TEL', tone: '--sev-medium', protocol: 'TCP', port: 23, portEditable: false, blurb: 'Legacy clear-text remote shell. Always suspicious.', ctrl: [] },
  { key: 'port_scan', label: 'Port scan', glyph: 'SCN', tone: '--sev-high', protocol: 'TCP', port: null, portEditable: false, blurb: 'Probes many ports. Count is the number of ports probed.', ctrl: [], countLabel: 'Ports to probe' },
  { key: 'ping', label: 'Ping', glyph: 'ICMP', tone: '--text-1', protocol: 'ICMP', port: null, portEditable: false, blurb: 'ICMP echo requests, no ports.', ctrl: [] },
  { key: 'dns', label: 'DNS', glyph: 'DNS', tone: '--accent', protocol: 'UDP', port: 53, portEditable: false, blurb: 'Name lookups over UDP 53.', ctrl: [] },
  { key: 'data_transfer', label: 'Data transfer', glyph: 'DATA', tone: '--sev-medium', protocol: 'TCP', port: 443, portEditable: true, blurb: 'A bulk upload. Very large transfers to outside look like exfiltration.', ctrl: ['bytes'] },
  { key: 'syn_flood', label: 'SYN flood', glyph: 'SYN', tone: '--sev-critical', protocol: 'TCP', port: 80, portEditable: true, blurb: 'A burst of connection openings meant to exhaust a server.', ctrl: [], countLabel: 'SYN packets' },
]
export const typeByKey = (k) => TYPES.find((t) => t.key === k) || TYPES[0]
export const EXTERNAL_DEFAULT = '203.0.113.50'
export const INTERNAL_DEFAULT = '10.0.1.10'
