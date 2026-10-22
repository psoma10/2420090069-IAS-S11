export function formatBytes(n) {
  if (n == null || isNaN(n)) return '-'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = Number(n)
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`
}

export function formatNumber(n) {
  if (n == null || isNaN(n)) return '-'
  const v = Number(n)
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(1)}k`
  return v.toLocaleString()
}

export function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  if (isNaN(d)) return '-'
  return d.toLocaleTimeString([], { hour12: false })
}

export function formatDateTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return isNaN(d) ? '-' : d.toLocaleString([], { hour12: false })
}

export function relativeTime(ts) {
  if (!ts) return '-'
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000)
  if (isNaN(s)) return '-'
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical']

export function severityColor(sev) {
  return `var(--sev-${(sev || 'low').toLowerCase()})`
}

export function pct(part, total, digits = 0) {
  if (!total) return 0
  return Number(((part / total) * 100).toFixed(digits))
}

export function isPrivateIp(ip) {
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip || '')
  if (!m) return false
  const a = +m[1], b = +m[2]
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export const isExternalIp = (ip) => !!ip && !isPrivateIp(ip)

export function errMessage(e) {
  if (!e) return ''
  if (e.status === undefined && /fetch|network|failed/i.test(e.message || '')) return 'Cannot reach the Sentinel backend. Make sure it is running.'
  return e.message || String(e)
}
