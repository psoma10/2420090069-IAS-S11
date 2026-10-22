// Client-side network helpers: validation and rule matching (mirrors backend semantics for visual traces).
const OCT = '(25[0-5]|2[0-4]\\d|1?\\d?\\d)'
const IPV4 = new RegExp(`^${OCT}\\.${OCT}\\.${OCT}\\.${OCT}$`)

export const isIPv4 = (s) => IPV4.test(s)
export function isIpOrCidr(s) {
  if (!s) return false
  if (s.toUpperCase() === 'ANY') return true
  const [ip, bits, extra] = s.split('/')
  if (extra !== undefined || !isIPv4(ip)) return false
  if (bits === undefined) return true
  return /^\d{1,2}$/.test(bits) && +bits <= 32
}

export function isPortSpec(s) {
  if (!s) return false
  if (s.toUpperCase() === 'ANY') return true
  const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(s)
  if (!m) return false
  const a = +m[1], b = m[2] === undefined ? a : +m[2]
  return a >= 0 && b <= 65535 && a <= b
}

const toInt = (ip) => ip.split('.').reduce((a, o) => (a * 256) + +o, 0)

export function ipMatches(spec, ip) {
  if (!spec || spec.toUpperCase() === 'ANY') return true
  if (!ip || !isIPv4(ip)) return false
  if (!spec.includes('/')) return spec === ip
  const [base, bits] = spec.split('/')
  const b = +bits
  if (b === 0) return true
  const mask = (0xffffffff << (32 - b)) >>> 0
  return ((toInt(base) & mask) >>> 0) === ((toInt(ip) & mask) >>> 0)
}

export function portMatches(spec, port) {
  if (!spec || String(spec).toUpperCase() === 'ANY') return true
  if (port === '' || port == null) return false
  const p = +port
  const [a, b] = String(spec).split('-').map(Number)
  return b === undefined ? p === a : p >= a && p <= b
}

export function protoMatches(spec, proto) {
  return !spec || spec === 'ANY' || spec === proto
}

/** Returns {match:boolean, failed:string[]} describing which fields did not match. */
export function explainMatch(rule, pkt) {
  const failed = []
  if (!protoMatches(rule.protocol, pkt.protocol)) failed.push('protocol')
  if (!ipMatches(rule.src_ip, pkt.src_ip)) failed.push('source IP')
  if (!ipMatches(rule.dst_ip, pkt.dst_ip)) failed.push('destination IP')
  if (!portMatches(rule.src_port, pkt.src_port)) failed.push('source port')
  if (!portMatches(rule.dst_port, pkt.dst_port)) failed.push('destination port')
  return { match: failed.length === 0, failed }
}
