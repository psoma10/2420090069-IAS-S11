export const FIREWALL_TYPES = [
  {
    id: 'packet-filter',
    name: 'Packet-filtering firewall',
    layer: 'Network / Transport (L3-L4)',
    icon: 'filter',
    summary: 'Applies a rule set to each IP packet individually, using source and destination address, ports, protocol and sometimes interface.',
    how: 'Rules are checked in order; the first match decides to forward or discard. If nothing matches, the default policy (discard or forward) applies. Each packet is judged alone, with no memory of earlier packets. This is the model Sentinel\'s Firewall Manager implements.',
    pros: ['Simple and very fast', 'Transparent to users and applications', 'Cheap; built into routers'],
    cons: ['Cannot inspect payload or application data', 'Does not track connections, so spoofing and fragment tricks are possible', 'Rule sets get hard to manage; no user authentication'],
    attacks: 'IP address spoofing, source routing, tiny fragment attacks',
    use: 'Edge routers, basic perimeter filtering, ingress/egress filters'
  },
  {
    id: 'stateful',
    name: 'Stateful inspection firewall',
    layer: 'Transport (L4), session-aware',
    icon: 'table',
    summary: 'Adds a table of active connections, so that a packet is allowed if it belongs to an established, expected session.',
    how: 'Tracks TCP handshake and sequence state, and UDP or ICMP pseudo-sessions. Only the first packet is checked against the full rule set; replies matching a table entry are allowed automatically. Unsolicited inbound packets are dropped.',
    pros: ['Stronger than stateless filtering at similar speed', 'Return traffic rules are automatic', 'Can resist many scanning and spoofing techniques'],
    cons: ['State table can be exhausted by floods (SYN flood)', 'Still limited insight into application content', 'More memory and CPU than packet filters'],
    attacks: 'State exhaustion (DoS); application-layer attacks pass if the session is valid',
    use: 'Most modern host and perimeter firewalls'
  },
  {
    id: 'app-proxy',
    name: 'Application-level gateway (proxy)',
    layer: 'Application (L7)',
    icon: 'proxy',
    summary: 'Acts as a relay for a specific application protocol. The client talks to the proxy, which makes a separate connection to the real server.',
    how: 'The user connects to the gateway, which authenticates them, checks the request against application rules (permitted commands, URLs, file types), and relays it. Because it understands the protocol, it can filter content and log in detail.',
    pros: ['Most secure of the classic types; sees full content', 'Strong logging and user authentication', 'Hides internal hosts completely'],
    cons: ['Processing overhead per connection; slower', 'Needs a proxy for each application', 'Clients may need configuration'],
    attacks: 'Mostly protected; the proxy itself must be hardened and patched',
    use: 'Web proxies, mail gateways, typically on a bastion host'
  },
  {
    id: 'circuit-gateway',
    name: 'Circuit-level gateway',
    layer: 'Session (L5), TCP relay',
    icon: 'circuit',
    summary: 'Relays TCP connections without inspecting the application data; it validates only that the session is legitimate.',
    how: 'Sets up two TCP connections: one between itself and an inside user, and one between itself and an outside host. Once established, it relays the bytes without examining content. Security lies in deciding which connections are allowed. SOCKS is a typical example.',
    pros: ['Hides internal network structure', 'Faster than application gateways', 'Works for any TCP application'],
    cons: ['No content inspection', 'Once a circuit is allowed, anything may flow inside it', 'Requires client support (for example SOCKS)'],
    attacks: 'Malicious payloads inside permitted circuits',
    use: 'Outbound access for trusted internal users, often combined with an application gateway for inbound'
  },
  {
    id: 'ngfw',
    name: 'Next-generation firewall (NGFW)',
    layer: 'L3 to L7, identity-aware',
    icon: 'shield',
    summary: 'Combines stateful inspection with deep packet inspection, application identification, integrated intrusion prevention and user identity.',
    how: 'Identifies applications regardless of port, applies policy per user and application, decrypts TLS where permitted, and uses threat intelligence feeds and IPS signatures inline.',
    pros: ['Granular, application-aware policy', 'Integrated IPS and malware filtering', 'Centralised management and visibility'],
    cons: ['Expensive and complex to tune', 'Performance cost, especially with TLS inspection', 'Privacy and certificate-management considerations'],
    attacks: 'Evasion through encrypted tunnels if not decrypted; misconfiguration',
    use: 'Enterprise perimeters and data centres'
  }
]

export const BASTION_NOTES = [
  'Runs a hardened, minimal operating system with only required services',
  'Is the only host reachable from outside; everything else sits behind it',
  'Hosts application-level or circuit-level gateways',
  'Is logged and audited heavily; compromise of a bastion must be detected quickly',
  'Sentinel: enable Bastion mode so external traffic to non-bastion hosts is denied before rules are evaluated (IDS-008 alerts on attempts)'
]
