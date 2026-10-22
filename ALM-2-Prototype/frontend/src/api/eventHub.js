// Ref-counted singleton around subscribeEvents: one EventSource for the whole app.
import { subscribeEvents } from './client.js'

let close = null
let status = 'connecting'
let summary = null
let refs = 0
const handlers = new Set()   // (type, data) => void
const statusSubs = new Set() // (status) => void

function dispatch(type, data) {
  if (type === 'summary') summary = data
  handlers.forEach((h) => { try { h(type, data) } catch { /* ignore */ } })
}
function setStatus(s) {
  if (s === status) return
  status = s
  statusSubs.forEach((f) => { try { f(s) } catch { /* ignore */ } })
}
function acquire() {
  if (refs++ === 0) {
    status = 'connecting'
    close = subscribeEvents(dispatch, (s) => setStatus(s))
  }
}
function release() {
  if (--refs <= 0) {
    refs = 0
    if (close) close()
    close = null
    status = 'connecting'
  }
}

export const hub = {
  getStatus: () => status,
  getSummary: () => summary,
  isLive: () => status === 'live',
  /** Subscribe to all events; returns unsubscribe. Opens the connection if first. */
  subscribe(handler) {
    handlers.add(handler)
    acquire()
    return () => { handlers.delete(handler); release() }
  },
  /** Subscribe to status changes (also holds the connection open). fn called immediately. */
  subscribeStatus(fn) {
    statusSubs.add(fn)
    acquire()
    fn(status)
    return () => { statusSubs.delete(fn); release() }
  },
}
export default hub
