import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../api/client.js'
import { PageHeader, Panel, Button, Badge, StatTile, EmptyState, Spinner, useToast } from '../components/ui/index.js'
import { usePolling } from '../hooks/usePolling.js'
import { useAlertStream } from '../hooks/useAlertStream.js'
import { errMessage } from '../utils/format.js'
import AlertRow from '../components/alerts/AlertRow.jsx'
import IpLink from '../components/investigate/IpLink.jsx'
import ConfirmDialog from '../components/alerts/ConfirmDialog.jsx'
import ApiBanner from '../components/alerts/ApiBanner.jsx'
import '../components/alerts/alerts.css'

const SEVS = ['critical', 'high', 'medium', 'low']
const SOURCES = ['rule', 'anomaly', 'firewall']

function minuteLabel(ts) {
  const d = new Date(ts)
  return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function TimelineTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return <div className="ap-tip mono">{minuteLabel(p.ts)} &middot; {p.count} alert{p.count === 1 ? '' : 's'}</div>
}

export default function AlertPanel() {
  const toast = useToast()
  const { alerts, status, clear } = useAlertStream({ max: 300 })
  const summaryQ = usePolling(() => api.idsSummary(), 4000)
  const [overrides, setOverrides] = useState({})
  const [sev, setSev] = useState('')
  const [src, setSrc] = useState('')
  const [q, setQ] = useState('')
  const [hideAcked, setHideAcked] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [confirm, setConfirm] = useState(null) // {kind:'clear'} | {kind:'block', ip}
  const [busy, setBusy] = useState(false)

  // new-alert flash: anything arriving after the first batch is "new"
  const known = useRef(new Set())
  const baselineDone = useRef(false)
  const [flash, setFlash] = useState(() => new Set())
  useEffect(() => {
    const t = setTimeout(() => { baselineDone.current = true }, 1500)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const fresh = []
    alerts.forEach((a) => {
      if (!known.current.has(a.id)) {
        known.current.add(a.id)
        if (baselineDone.current) fresh.push(a.id)
      }
    })
    if (fresh.length) {
      setFlash((s) => new Set([...s, ...fresh]))
      const t = setTimeout(() => setFlash((s) => { const n = new Set(s); fresh.forEach((i) => n.delete(i)); return n }), 3000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [alerts])

  const merged = useMemo(() => alerts.map((a) => (overrides[a.id] ? { ...a, ...overrides[a.id] } : a)), [alerts, overrides])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return merged.filter((a) => {
      if (sev && a.severity !== sev) return false
      if (src && a.source !== src) return false
      if (hideAcked && a.acknowledged) return false
      if (needle && !`${a.title} ${a.description} ${a.rule_id} ${a.src_ip} ${a.dst_ip}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [merged, sev, src, q, hideAcked])

  const unacked = merged.filter((a) => !a.acknowledged)
  const localCounts = useMemo(() => {
    const bySev = {}; const bySrc = {}
    merged.forEach((a) => { bySev[a.severity] = (bySev[a.severity] || 0) + 1; bySrc[a.source] = (bySrc[a.source] || 0) + 1 })
    return { bySev, bySrc }
  }, [merged])

  const summary = summaryQ.data
  const bySev = summary?.by_severity || localCounts.bySev
  const bySrc = summary?.by_source || localCounts.bySrc
  const series = useMemo(() => (summary?.last_hour_series || []).map((p) => ({ ...p, label: minuteLabel(p.ts) })), [summary])
  const topSources = summary?.top_sources || []

  const ack = async (a) => {
    setOverrides((o) => ({ ...o, [a.id]: { acknowledged: true } }))
    try { await api.ackAlert(a.id) } catch (e) {
      setOverrides((o) => { const n = { ...o }; delete n[a.id]; return n })
      toast.error(errMessage(e))
    }
  }
  const ackAll = async () => {
    const list = unacked
    setOverrides((o) => { const n = { ...o }; list.forEach((a) => { n[a.id] = { acknowledged: true } }); return n })
    const results = await Promise.allSettled(list.map((a) => api.ackAlert(a.id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) toast.error(`${failed} alert(s) could not be acknowledged`)
    else toast.success(`${list.length} alert(s) acknowledged`)
  }
  const doConfirm = async () => {
    setBusy(true)
    try {
      if (confirm.kind === 'clear') {
        await api.clearAlerts()
        clear(); setOverrides({}); known.current = new Set()
        toast.success('All alerts cleared')
      } else {
        const ip = confirm.ip
        await api.createRule({
          name: `Block ${ip}`, action: 'deny', protocol: 'ANY', src_ip: ip, dst_ip: 'ANY', src_port: 'ANY', dst_port: 'ANY',
          priority: 1, enabled: true, description: `Created from Alert Panel: ${ip} flagged by the IDS.`,
        })
        toast.success(`Deny rule created for ${ip} at priority 1`, 'Firewall updated')
      }
      setConfirm(null)
      summaryQ.refresh()
    } catch (e) { toast.error(errMessage(e)) } finally { setBusy(false) }
  }

  const live = status === 'live'
  const down = status === 'connecting' && summaryQ.error
  const maxSrc = Math.max(1, ...topSources.map((s) => s.count))

  return (
    <div className="ap">
      <PageHeader
        kicker="Detection"
        title="Alert Panel"
        subtitle="Live feed from the IDS, anomaly detector and firewall."
        actions={
          <>
            <span className={`ap-live ${live ? 'is-live' : status === 'polling' ? 'is-poll' : ''}`} role="status">
              <i aria-hidden="true" />{live ? 'Live (SSE)' : status === 'polling' ? 'Polling every 2s' : 'Connecting'}
            </span>
            <Button size="sm" disabled={!unacked.length} onClick={ackAll}>Ack all ({unacked.length})</Button>
            <Button size="sm" variant="danger" disabled={!merged.length} onClick={() => setConfirm({ kind: 'clear' })}>Clear all</Button>
          </>
        }
      />
      <ApiBanner error={down ? summaryQ.error : null} onRetry={summaryQ.refresh} />

      <div className="ap-stats">
        {SEVS.map((s) => (
          <button key={s} type="button" className={`ap-statbtn ${sev === s ? 'is-on' : ''}`} onClick={() => setSev(sev === s ? '' : s)} aria-pressed={sev === s} aria-label={`Filter ${s} alerts`}>
            <StatTile label={s} value={bySev?.[s] ?? 0} tone={s} />
          </button>
        ))}
        <div className="ap-sources">
          <span className="ap-sources__t">By source</span>
          {SOURCES.map((s) => (
            <button key={s} type="button" className={`ap-chip ${src === s ? 'is-on' : ''}`} onClick={() => setSrc(src === s ? '' : s)} aria-pressed={src === s}>
              {s} <b className="mono">{bySrc?.[s] ?? 0}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="ap-cols">
        <Panel
          title="Feed"
          subtitle={`${filtered.length} of ${merged.length} alerts`}
          className="ap-feed"
          actions={<Badge tone={unacked.length ? 'medium' : 'allow'} dot>{unacked.length} unacknowledged</Badge>}
        >
          <div className="ap-filters">
            <input className="ui-input" type="search" placeholder="Search title, IP, rule..." aria-label="Search alerts" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="ui-input ui-select" aria-label="Severity" value={sev} onChange={(e) => setSev(e.target.value)}>
              <option value="">All severities</option>
              {SEVS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="ui-input ui-select" aria-label="Source" value={src} onChange={(e) => setSrc(e.target.value)}>
              <option value="">All sources</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="ap-check"><input type="checkbox" checked={hideAcked} onChange={(e) => setHideAcked(e.target.checked)} /> Hide acknowledged</label>
          </div>
          {status === 'connecting' && !merged.length ? (
            <div className="ap-load"><Spinner /> Connecting to alert stream</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="shield"
              title={merged.length ? 'No alerts match your filters' : 'All quiet'}
              hint={merged.length ? 'Clear a filter to see more.' : 'No alerts yet. Send an attack from the Packet Forge and watch them appear.'}
              action={!merged.length && <Link to="/traffic"><Button variant="primary" size="sm">Open Packet Forge</Button></Link>}
            />
          ) : (
            <ul className="ap-list">
              {filtered.map((a) => (
                <AlertRow
                  key={a.id}
                  a={a}
                  open={openId === a.id}
                  isNew={flash.has(a.id)}
                  onToggle={() => setOpenId(openId === a.id ? null : a.id)}
                  onAck={ack}
                  onBlock={(ip) => setConfirm({ kind: 'block', ip })}
                />
              ))}
            </ul>
          )}
        </Panel>

        <div className="ap-side">
          <Panel title="Alerts per minute" subtitle="Last hour">
            {summaryQ.loading && !summary ? (
              <div className="ap-load"><Spinner /></div>
            ) : series.length === 0 || series.every((p) => !p.count) ? (
              <div className="ap-empty-chart">No alerts in the last hour.</div>
            ) : (
              <div className="ap-chart" role="img" aria-label="Bar chart of alerts per minute in the last hour">
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={series} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} minTickGap={28} />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TimelineTip />} cursor={{ fill: 'var(--accent-dim)' }} />
                    <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Top offending IPs" subtitle="Most alerts raised">
            {topSources.length === 0 ? (
              <div className="ap-empty-chart">No offenders yet.</div>
            ) : (
              <ul className="ap-top">
                {topSources.slice(0, 6).map((s) => (
                  <li key={s.ip}>
                    <div className="ap-top__row">
                      <IpLink ip={s.ip} />
                      <b className="mono">{s.count}</b>
                      <Button size="sm" variant="danger" onClick={() => setConfirm({ kind: 'block', ip: s.ip })} aria-label={`Create block rule for ${s.ip}`}>Block</Button>
                    </div>
                    <div className="ap-top__bar"><i style={{ width: `${(s.count / maxSrc) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
            <Link className="ap-link" to="/firewall">Manage firewall rules</Link>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        danger
        busy={busy}
        title={confirm?.kind === 'clear' ? 'Clear all alerts?' : 'Create block rule?'}
        confirmLabel={confirm?.kind === 'clear' ? 'Clear all' : 'Create deny rule'}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
      >
        {confirm?.kind === 'clear' ? (
          <p>This permanently deletes every alert, including unacknowledged ones. Packet history is kept.</p>
        ) : (
          <p>
            Add a firewall rule at priority 1 that denies <b className="mono">ANY</b> traffic from <b className="mono">{confirm?.ip}</b>.
            It is evaluated before every other rule. You can edit or delete it later in the Rule Manager.
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}
