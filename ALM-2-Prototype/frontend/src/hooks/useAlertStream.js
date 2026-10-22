import { useCallback, useEffect, useRef, useState } from 'react'
import { api, subscribeAlerts } from '../api/client.js'
import { hub } from '../api/eventHub.js'

/** Live alert feed (newest first). Seeds from api.alerts, then follows hub `alert` events;
 *  falls back to the legacy alert stream / polling while the hub is not live. */
export function useAlertStream({ max = 200 } = {}) {
  const [alerts, setAlerts] = useState([])
  const [status, setStatus] = useState('connecting')
  const seen = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    let offLegacy = null
    const add = (a) => {
      if (!a || seen.current.has(a.id)) return
      seen.current.add(a.id)
      setAlerts((l) => [a, ...l].slice(0, max))
    }
    const startLegacy = () => {
      if (!offLegacy && !cancelled) offLegacy = subscribeAlerts(add, setStatus)
    }
    const stopLegacy = () => { if (offLegacy) { offLegacy(); offLegacy = null } }

    const offEv = hub.subscribe((type, data) => { if (type === 'alert') add(data) })
    const offSt = hub.subscribeStatus((s) => {
      if (cancelled) return
      if (s === 'live') { stopLegacy(); setStatus('live') }
      else if (s === 'polling' || s === 'offline') startLegacy()
    })
    ;(async () => {
      try {
        const init = await api.alerts({ limit: Math.min(max, 100) })
        if (cancelled) return
        const fresh = init.filter((a) => !seen.current.has(a.id))
        fresh.forEach((a) => seen.current.add(a.id))
        setAlerts((l) => [...l, ...fresh].sort((x, y) => (y.id > x.id ? 1 : y.id < x.id ? -1 : 0)).slice(0, max))
      } catch { /* backend down: stream will keep trying */ }
    })()
    return () => { cancelled = true; stopLegacy(); offEv(); offSt() }
  }, [max])

  const clear = useCallback(() => setAlerts([]), [])
  return { alerts, status, clear }
}

export default useAlertStream
