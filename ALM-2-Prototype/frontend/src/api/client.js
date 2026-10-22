// Thin fetch wrapper. See docs/API_CONTRACT.md for every endpoint.
const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* ignore */ }
    const err = new Error(detail)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

const qs = (o = {}) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  health: () => req('GET', '/health'),
  reset: (keep_rules = true) => req('POST', '/simulation/reset', { keep_rules }),
  seed: () => req('POST', '/simulation/seed'),
  // firewall
  rules: () => req('GET', '/firewall/rules'),
  createRule: (r) => req('POST', '/firewall/rules', r),
  updateRule: (id, r) => req('PUT', `/firewall/rules/${id}`, r),
  toggleRule: (id) => req('PATCH', `/firewall/rules/${id}/toggle`),
  deleteRule: (id) => req('DELETE', `/firewall/rules/${id}`),
  policy: () => req('GET', '/firewall/policy'),
  setPolicy: (p) => req('PUT', '/firewall/policy', p),
  testPacket: (p) => req('POST', '/firewall/test', p),
  firewallStats: () => req('GET', '/firewall/stats'),
  // hosts
  hosts: () => req('GET', '/hosts'),
  createHost: (h) => req('POST', '/hosts', h),
  updateHost: (id, h) => req('PUT', `/hosts/${id}`, h),
  deleteHost: (id) => req('DELETE', `/hosts/${id}`),
  setBastion: (id) => req('POST', `/hosts/${id}/bastion`),
  clearBastion: () => req('DELETE', '/hosts/bastion'),
  // traffic
  send: (p) => req('POST', '/traffic/send', p),
  scenario: (name) => req('POST', `/traffic/scenario/${name}`),
  scenarios: () => req('GET', '/traffic/scenarios'),
  packets: (q) => req('GET', `/traffic/packets${qs(q)}`),
  // ids
  alerts: (q) => req('GET', `/alerts${qs(q)}`),
  ackAlert: (id) => req('POST', `/alerts/${id}/ack`),
  clearAlerts: () => req('DELETE', '/alerts'),
  idsRules: () => req('GET', '/ids/rules'),
  updateIdsRule: (id, b) => req('PUT', `/ids/rules/${id}`, b),
  idsSummary: () => req('GET', '/ids/summary'),
  // anomaly
  anomalyMetrics: (window = 60) => req('GET', `/anomaly/metrics${qs({ window })}`),
  anomalySources: () => req('GET', '/anomaly/sources'),
  anomalyConfig: () => req('GET', '/anomaly/config'),
  setAnomalyConfig: (c) => req('PUT', '/anomaly/config', c),
  trainBaseline: (minutes = 5) => req('POST', '/anomaly/baseline', { minutes }),
  // stats
  summary: () => req('GET', '/stats/summary'),
  // investigation + settings
  investigate: (ip) => req('GET', `/investigate/${encodeURIComponent(ip)}`),
  getSettings: () => req('GET', '/settings'),
  updateSettings: (body) => req('PUT', '/settings', body),
}

const EVENT_TYPES = ['summary', 'alert', 'change', 'ping']
const STALE_MS = 25000 // backend pings every ~15s; silence this long means a dead stream (e.g. hung proxy)

/**
 * Open the shared server-sent event stream (/api/events).
 * onEvent(type, data) for summary|alert|change; onStatus('connecting'|'live'|'polling'|'offline').
 * Reconnects with capped exponential backoff. Returns a close fn.
 * Prefer the ref-counted hub (api/eventHub.js) over calling this directly.
 */
export function subscribeEvents(onEvent = () => {}, onStatus = () => {}) {
  let es = null
  let timer = null
  let closed = false
  let attempt = 0
  let lastSeen = Date.now()
  const setStatus = (s) => { try { onStatus(s) } catch { /* ignore */ } }
  const watchdog = setInterval(() => { if (!closed && es && Date.now() - lastSeen > STALE_MS) fail() }, 5000)

  const connect = () => {
    if (closed) return
    setStatus('connecting')
    try {
      es = new EventSource(BASE + '/events')
    } catch {
      return fail()
    }
    lastSeen = Date.now()
    es.onopen = () => { attempt = 0; lastSeen = Date.now(); setStatus('live') }
    EVENT_TYPES.forEach((t) => es.addEventListener(t, (e) => {
      lastSeen = Date.now()
      if (t === 'ping') return
      let d = null
      try { d = e.data ? JSON.parse(e.data) : null } catch { return }
      try { onEvent(t, d) } catch { /* ignore handler errors */ }
    }))
    es.onerror = () => { if (!closed) fail() }
  }
  const fail = () => {
    if (es) { es.close(); es = null }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    setStatus(offline ? 'offline' : 'polling')
    const delay = Math.min(30000, 1000 * 2 ** attempt) * (0.8 + Math.random() * 0.4)
    attempt = Math.min(attempt + 1, 10)
    timer = setTimeout(connect, delay)
  }
  connect()
  return () => { closed = true; clearTimeout(timer); clearInterval(watchdog); if (es) es.close(); es = null }
}

/** Subscribe to live alerts via SSE; falls back to polling. Returns an unsubscribe fn. */
export function subscribeAlerts(onAlert, onStatus = () => {}) {
  let es
  let timer
  let closed = false
  const seen = new Set()
  const emit = (a) => { if (!seen.has(a.id)) { seen.add(a.id); onAlert(a) } }
  const startPolling = () => {
    onStatus('polling')
    const tick = async () => {
      try { (await api.alerts({ limit: 50 })).reverse().forEach(emit) } catch { /* ignore */ }
    }
    tick()
    timer = setInterval(tick, 2000)
  }
  try {
    es = new EventSource(BASE + '/alerts/stream')
    es.onopen = () => onStatus('live')
    es.onmessage = (e) => { try { emit(JSON.parse(e.data)) } catch { /* ignore */ } }
    es.onerror = () => { if (closed) return; es.close(); if (!timer) startPolling() }
  } catch { startPolling() }
  return () => { closed = true; if (es) es.close(); if (timer) clearInterval(timer) }
}
