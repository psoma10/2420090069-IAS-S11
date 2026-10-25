import { getThreat } from '../../data/threats.js'
// Explanations and response guidance for every detection rule, plus "Try it" recipes.
export const RULE_INFO = {
  'IDS-001': {
    meaning: 'Many failed SSH logins from one source in a short window: the signature of password guessing (brute force) or credential stuffing.',
    response: 'Block the source IP, enforce key-based auth, add lockouts, and check whether any attempt eventually succeeded.',
  },
  'IDS-002': {
    meaning: 'Telnet (port 23) sends credentials and data in clear text. Any use is a policy violation and a sign of legacy or malicious activity.',
    response: 'Disable telnet, replace it with SSH, and deny port 23 at the perimeter. Investigate the originating host.',
  },
  'IDS-003': {
    meaning: 'One source probing many distinct ports quickly: reconnaissance to map which services are exposed before an attack.',
    response: 'Block the scanner, verify only intended ports are exposed, and watch for follow-up exploitation attempts.',
  },
  'IDS-004': {
    meaning: 'A burst of SYN packets at one destination. A SYN flood exhausts the connection table so legitimate clients cannot connect.',
    response: 'Enable SYN cookies and rate limiting, block or throttle the sources, and consider upstream DDoS mitigation.',
  },
  'IDS-005': {
    meaning: 'An unusually large single transfer to an external address: a typical pattern for data exfiltration after a breach.',
    response: 'Identify the host and user, inspect the destination, cut the session, and determine which data left the network.',
  },
  'IDS-006': {
    meaning: 'A source keeps hitting the firewall and getting denied. It is probing for something that is allowed, or malware is trying to phone home.',
    response: 'Identify what the source is trying to reach, then block it earlier or isolate the host if it is internal.',
  },
  'IDS-007': {
    meaning: 'A flood of ICMP echo requests from one source: a ping flood used for denial of service or noisy network mapping.',
    response: 'Rate limit ICMP, block the source, and allow only the ICMP types you need.',
  },
  'IDS-008': {
    meaning: 'An external source tried to reach an internal host directly instead of going through the bastion. This is the very path a bastion policy exists to close.',
    response: 'Confirm bastion mode is on, block the source, and review how it learned about the internal host.',
  },
  'IDS-009': {
    meaning: 'An external source touched a sensitive service port (RDP 3389, SMB 445, MySQL 3306, Postgres 5432). Those should never be internet-facing.',
    response: 'Deny these ports at the edge, patch the services, and check for any successful connections.',
  },
  'ANOM-SRC': {
    meaning: 'A single source sent traffic far above its own learned rate (z-score beyond the sigma threshold).',
    response: 'Check whether the host is legitimately busy, otherwise rate limit or block it.',
  },
  'FW-BLOCK': {
    meaning: 'The firewall denied a packet according to a rule or the default policy.',
    response: 'Usually working as intended. If a legitimate flow is blocked, review the matched rule.',
  },
}

// Rule id -> Encyclopedia article slug (only linked when the slug exists in data/threats)
export const RULE_ARTICLE = {
  'IDS-001': 'intruders',
  'IDS-002': 'intrusion-detection-concepts',
  'IDS-003': 'network-scanning-worms',
  'IDS-004': 'botnets-ddos',
  'IDS-005': 'intruder-classes',
  'IDS-006': 'intrusion-detection-concepts',
  'IDS-007': 'botnets-ddos',
  'IDS-008': 'intruders',
  'IDS-009': 'intruder-classes',
  'ANOM-SRC': 'how-sentinel-detects',
}

export function ruleArticle(id) {
  const slug = RULE_ARTICLE[id] || (id && id.startsWith('ANOM-') ? 'how-sentinel-detects' : null)
  return slug && getThreat(slug) ? slug : null
}

export function ruleInfo(id) {
  if (RULE_INFO[id]) return RULE_INFO[id]
  if (id && id.startsWith('ANOM-')) {
    return {
      meaning: 'A traffic metric left its statistical baseline: the latest value is more than sigma standard deviations above the recent mean.',
      response: 'Open the Anomaly Detector, look at the metric, and decide whether it is a flash crowd or an attack.',
    }
  }
  return { meaning: 'No additional description available for this rule.', response: 'Review the source and destination hosts.' }
}

// Seed hosts used for example attacks
export const ATTACKER = '203.0.113.50'
export const PARTNER = '198.51.100.7'
export const WEB = '10.0.1.10'
export const DB = '10.0.2.20'
export const BASTION = '10.0.0.5'

// Example attack per IDS rule: either a send payload or a named scenario
export const RULE_EXAMPLES = {
  'IDS-001': { text: '6 failed SSH logins from the attacker to the bastion.', send: { type: 'ssh_login', src_ip: ATTACKER, dst_ip: BASTION, count: 6, success: false } },
  'IDS-002': { text: 'A telnet connection to a web server.', send: { type: 'telnet', src_ip: ATTACKER, dst_ip: WEB, count: 1 } },
  'IDS-003': { text: 'The attacker probes 15 distinct ports on web-01.', send: { type: 'port_scan', src_ip: ATTACKER, dst_ip: WEB, count: 15 } },
  'IDS-004': { text: '150 SYN packets in a burst at web-01.', send: { type: 'syn_flood', src_ip: ATTACKER, dst_ip: WEB, count: 150 } },
  'IDS-005': { text: 'The exfiltration scenario: a very large transfer to an external partner address.', scenario: 'exfiltration' },
  'IDS-006': { text: '25 telnet packets that the firewall keeps denying.', send: { type: 'telnet', src_ip: ATTACKER, dst_ip: WEB, count: 25 } },
  'IDS-007': { text: '60 pings from the attacker to web-01.', send: { type: 'ping', src_ip: ATTACKER, dst_ip: WEB, count: 60 } },
  'IDS-008': { text: 'The bastion bypass scenario: an external host going straight to an internal box.', scenario: 'bastion_bypass' },
  'IDS-009': { text: 'The attacker tries RDP (3389) on the database host.', send: { type: 'https', src_ip: ATTACKER, dst_ip: DB, dst_port: 3389, protocol: 'TCP', count: 1 } },
}
