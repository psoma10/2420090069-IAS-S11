import { viruses } from './threats/viruses.js'
import { worms } from './threats/worms.js'
import { other } from './threats/other.js'
import { defenses } from './threats/defenses.js'

// Order of the atlas: viruses -> worms -> other malware -> intruders -> defenses
const raw = [...viruses, ...worms, ...other, ...defenses]
const catOrder = ['viruses', 'worms', 'other', 'intruders', 'defenses']

export const CATEGORIES = [
  { id: 'viruses', label: 'Viruses', blurb: 'Need a host and a human to spread' },
  { id: 'worms', label: 'Worms', blurb: 'Replicate across networks on their own' },
  { id: 'other', label: 'Other malware', blurb: 'Trojans, bombs, rootkits, botnets' },
  { id: 'intruders', label: 'Intruders', blurb: 'The human adversary' },
  { id: 'defenses', label: 'Defenses', blurb: 'Detect, prevent, respond' }
]

export const VECTORS = {
  file: 'Infected files',
  boot: 'Boot sector',
  email: 'E-mail',
  network: 'Network',
  web: 'Web / mobile code',
  removable: 'Removable media',
  social: 'Social engineering'
}

export const LEVEL_LABELS = ['', 'Minimal', 'Low', 'Moderate', 'High', 'Severe']

export const THREATS = [...raw].sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category))

export const THREAT_BY_SLUG = Object.fromEntries(THREATS.map(t => [t.slug, t]))

export function getThreat(slug) { return THREAT_BY_SLUG[slug] || null }

export function neighbours(slug) {
  const i = THREATS.findIndex(t => t.slug === slug)
  return { prev: i > 0 ? THREATS[i - 1] : null, next: i >= 0 && i < THREATS.length - 1 ? THREATS[i + 1] : null }
}

export function wordCount(t) {
  const parts = [t.summary, ...(t.overview || []), ...(t.traits || []), ...(t.lifecycle || []).map(l => l.text),
    ...(t.spread || []), ...(t.examples || []).map(e => e.note), ...(t.detection || []), ...(t.countermeasures || []), t.sentinel?.text]
  return parts.join(' ').split(/\s+/).filter(Boolean).length
}

export function readMinutes(t) { return Math.max(1, Math.round(wordCount(t) / 200)) }

// Virus vs worm comparison table
export const VIRUS_VS_WORM = {
  head: ['Aspect', 'Virus', 'Worm'],
  rows: [
    ['Needs a host program', 'Yes: embeds in files, documents or boot sectors', 'No: standalone, self-contained program'],
    ['How it starts', 'When the infected host is run or opened by a user or process', 'Often by itself, by exploiting a service; sometimes via an e-mail lure'],
    ['How it spreads', 'By infecting other files; moves as files are shared', 'Across networks by scanning, mail or shares'],
    ['Speed', 'Slow to moderate; tied to human sharing', 'Very fast, exponential; limited by bandwidth'],
    ['Typical impact', 'Corrupted or infected files, host damage', 'Network congestion, mass compromise, botnets'],
    ['Network footprint', 'Small', 'Large: scanning and replication traffic'],
    ['Best defence', 'Antivirus, integrity checks, user caution', 'Patching, segmentation, firewalls, IDS'],
    ['Examples', 'Jerusalem, CIH, Michelangelo', 'Morris, Code Red, Slammer, WannaCry']
  ]
}

export const IDS_RULES = {
  'IDS-001': 'SSH brute force',
  'IDS-002': 'Telnet traffic',
  'IDS-003': 'Port scan',
  'IDS-004': 'SYN flood',
  'IDS-005': 'Data exfiltration',
  'IDS-006': 'Blocked-traffic storm',
  'IDS-007': 'ICMP flood',
  'IDS-008': 'Bastion bypass attempt',
  'IDS-009': 'Sensitive port probe'
}
