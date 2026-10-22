import { useEffect, useRef, useState } from 'react'
import { hub } from '../api/eventHub.js'

/** Call handler(data, type) for events whose type is in `types` (string | string[] | null = all). */
export function useEvents(types, handler) {
  const ref = useRef(handler)
  ref.current = handler
  const key = Array.isArray(types) ? types.join(',') : types || ''
  useEffect(() => {
    const set = key ? new Set(key.split(',')) : null
    return hub.subscribe((type, data) => { if (!set || set.has(type)) ref.current?.(data, type) })
  }, [key])
}

/** 'connecting' | 'live' | 'polling' | 'offline' */
export function useLiveStatus() {
  const [s, setS] = useState(hub.getStatus())
  useEffect(() => hub.subscribeStatus(setS), [])
  return s
}

/** Latest summary pushed by the hub (null until first event) plus live status. */
export function useSummary() {
  const [summary, setSummary] = useState(hub.getSummary())
  const status = useLiveStatus()
  useEvents('summary', (d) => setSummary(d))
  return { summary, status }
}

export default useEvents
