import { useEffect, useRef, useState } from 'react'
import { Badge, SeverityBadge } from '../ui/index.js'
import { Link } from 'react-router-dom'

const MAX_ANIMATED = 80

export function PacketRow({ p, i, fresh }) {
  const blocked = p.verdict === 'blocked'
  return (
    <li className={`tg-row ${blocked ? 'is-blocked' : 'is-allowed'} ${fresh ? 'is-fresh' : ''}`}>
      <span className="tg-row__idx mono">{String(i + 1).padStart(2, '0')}</span>
      <span className={`tg-verdict ${blocked ? 'is-deny' : 'is-allow'}`}>{blocked ? 'BLOCKED' : 'ALLOWED'}</span>
      <span className="tg-row__flow mono">
        <span className="tg-proto">{p.protocol}</span> {p.src_ip}
        <i aria-hidden="true">{' > '}</i>
        {p.dst_ip}{p.dst_port != null ? `:${p.dst_port}` : ''}
      </span>
      <span className="tg-row__why">
        {p.matched_rule_name ? <Badge tone={blocked ? 'deny' : 'allow'}>{p.matched_rule_name}</Badge> : <Badge tone="neutral">default policy</Badge>}
        <span className="tg-row__reason">{p.reason}</span>
      </span>
      {p.alerts?.length > 0 && (
        <span className="tg-row__alerts">
          {p.alerts.map((a) => (
            <Link key={a.id} to="/alerts" className="tg-alertchip" title={a.title}>
              <SeverityBadge severity={a.severity} /> <span className="mono">{a.rule_id}</span>
            </Link>
          ))}
        </span>
      )}
    </li>
  )
}

/** Reveals packets one at a time to simulate a live verdict stream. */
export default function ResultStream({ result }) {
  const packets = result?.packets || []
  const [shown, setShown] = useState(0)
  const endRef = useRef(null)
  useEffect(() => {
    setShown(0)
    if (!packets.length) return undefined
    const animated = Math.min(packets.length, MAX_ANIMATED)
    const step = Math.max(30, Math.min(160, 1800 / animated))
    let n = 0
    const t = setInterval(() => {
      n += 1
      setShown(n >= animated ? packets.length : n)
      if (n >= animated) clearInterval(t)
    }, step)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])
  useEffect(() => {
    const el = endRef.current
    if (el && shown < packets.length) el.scrollIntoView?.({ block: 'nearest' })
  }, [shown, packets.length])

  const visible = packets.slice(0, shown)
  const alertsRaised = packets.reduce((n, p) => n + (p.alerts?.length || 0), 0)
  const s = result?.summary || { total: packets.length, allowed: 0, blocked: 0, alerts: alertsRaised }
  const done = shown >= packets.length
  return (
    <div className="tg-stream">
      <div className="tg-counters" aria-live="polite">
        <div className="tg-counter"><span>Total</span><b className="mono">{s.total}</b></div>
        <div className="tg-counter is-allow"><span>Allowed</span><b className="mono">{s.allowed}</b></div>
        <div className="tg-counter is-deny"><span>Blocked</span><b className="mono">{s.blocked}</b></div>
        <div className="tg-counter is-alert"><span>Alerts</span><b className="mono">{s.alerts}</b></div>
      </div>
      <div className="tg-meter" aria-hidden="true">
        <i className="is-allow" style={{ width: `${s.total ? (s.allowed / s.total) * 100 : 0}%` }} />
        <i className="is-deny" style={{ width: `${s.total ? (s.blocked / s.total) * 100 : 0}%` }} />
      </div>
      <ol className="tg-rows">
        {visible.map((p, i) => <PacketRow key={p.id ?? i} p={p} i={i} fresh={!done || i > shown - 3} />)}
        <li ref={endRef} aria-hidden="true" />
      </ol>
      {!done && <div className="tg-streaming mono">streaming verdicts {shown}/{packets.length}</div>}
      {done && packets.length > MAX_ANIMATED && <div className="tg-streaming mono">all {packets.length} packets shown</div>}
    </div>
  )
}
