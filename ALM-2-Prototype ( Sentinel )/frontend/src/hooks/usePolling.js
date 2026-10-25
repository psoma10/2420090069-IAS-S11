import { useCallback, useEffect, useRef, useState } from 'react'
import { hub } from '../api/eventHub.js'

const SAFETY_MS = 30000
const DEBOUNCE_MS = 250

/** Poll `fn` every intervalMs (0/null = once). Pauses while tab hidden; never overlaps requests. */
export function usePolling(fn, intervalMs = 3000, deps = [], { relax = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const inflight = useRef(false)
  const alive = useRef(true)
  const dirty = useRef(false)

  const run = useCallback(async function run() {
    if (inflight.current) return
    inflight.current = true
    try {
      const r = await fnRef.current()
      if (alive.current) { setData(r); setError(null) }
    } catch (e) {
      if (alive.current) setError(e)
    } finally {
      inflight.current = false
      if (alive.current) setLoading(false)
      if (dirty.current) { dirty.current = false; if (alive.current) run() }
    }
  }, [])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    run()
    let timer
    let deb
    let live = false
    const tick = () => { if (!document.hidden) run() }
    const evTick = () => { if (inflight.current) dirty.current = true; else tick() }
    const setTimer = () => {
      clearInterval(timer)
      if (intervalMs) timer = setInterval(tick, live && relax ? Math.max(intervalMs, SAFETY_MS) : intervalMs)
    }
    setTimer()
    let off = () => {}
    if (intervalMs) {
      // event-driven refresh only for polling callers (0/null = fetch once)
      const offEv = hub.subscribe((type) => {
        if (!live || (type !== 'change' && type !== 'summary')) return
        clearTimeout(deb)
        deb = setTimeout(evTick, DEBOUNCE_MS)
      })
      const offSt = hub.subscribeStatus((s) => {
        const nl = s === 'live'
        if (nl === live) return
        live = nl
        setTimer()
        if (nl && alive.current && !document.hidden) run() // resync after (re)connect
      })
      off = () => { offEv(); offSt() }
    }
    const onVis = () => { if (!document.hidden) run() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive.current = false
      clearInterval(timer)
      clearTimeout(deb)
      off()
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, run, ...deps])

  return { data, error, loading, refresh: run }
}

export default usePolling
