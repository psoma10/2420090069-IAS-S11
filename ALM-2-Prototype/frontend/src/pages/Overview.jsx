import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import IpLink from '../components/investigate/IpLink.jsx'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client.js'
import { usePolling } from '../hooks/usePolling.js'
import { useAlertStream } from '../hooks/useAlertStream.js'
import { Badge, Button, EmptyState, ErrorState, Icon, PageHeader, Panel, SeverityBadge, Spinner, StatTile, useToast } from '../components/ui/index.js'
import { formatNumber, formatTime, pct, relativeTime, SEVERITY_ORDER, severityColor } from '../utils/format.js'
import './Overview.css'

const SCENARIOS = [
  { name: 'normal', label: 'Normal traffic', icon: 'globe', hint: 'Benign web/DNS/SSH mix' },
  { name: 'brute_force', label: 'SSH brute force', icon: 'lock', hint: 'Trips IDS-001' },
  { name: 'port_scan', label: 'Port scan', icon: 'radar', hint: 'Trips IDS-003' },
  { name: 'ddos', label: 'SYN flood', icon: 'zap', hint: 'Trips IDS-004' },
  { name: 'exfiltration', label: 'Data exfiltration', icon: 'upload', hint: 'Trips IDS-005' },
  { name: 'telnet_probe', label: 'Telnet probe', icon: 'terminal', hint: 'Trips IDS-002' },
  { name: 'bastion_bypass', label: 'Bastion bypass', icon: 'shield', hint: 'Needs bastion mode' },
]
const PROTO_COLORS = ['var(--accent)', 'var(--cyan)', 'var(--violet)']
const tip = { background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 6, color: 'var(--text-0)', fontSize: 12 }

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="ov-tip mono">
      <div>{label}</div>
      {payload.map((p) => <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</div>)}
    </div>
  )
}

function Checklist({ sum, policy, onDone }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('sentinel.start.hidden') === '1' } catch { return false } })
  const [visitedLearn] = useState(() => { try { return localStorage.getItem('sentinel.visited.learn') === '1' } catch { return false } })
  if (hidden) return null
  const steps = [
    { done: (sum?.rules_total || 0) > 0, label: 'Check the firewall rules', to: '/firewall', hint: 'A default rule set is seeded. See what each rule allows or denies.' },
    { done: (sum?.packets_total || 0) > 0, label: 'Generate normal traffic', to: null, hint: 'Use the quick scenario "Normal traffic" below to build a baseline.' },
    { done: (sum?.alerts_total || 0) > 0, label: 'Launch an attack', to: '/alerts', hint: 'Try "SSH brute force" or "Port scan", then watch the alert feed.' },
    { done: !!policy?.bastion_mode, label: 'Turn on bastion mode', to: '/firewall', hint: 'Force all external access through one hardened gateway.' },
    { done: visitedLearn, label: 'Learn what you just saw', to: '/encyclopedia', hint: 'Read the threat encyclopedia entry for the attack.' },
  ]
  const n = steps.filter((s) => s.done).length
  return (
    <Panel
      tone="accent" title="Start here" subtitle={`${n} of ${steps.length} steps complete`}
      actions={<Button size="sm" variant="subtle" onClick={() => { try { localStorage.setItem('sentinel.start.hidden', '1') } catch { /* ignore */ } setHidden(true); onDone?.() }}>Dismiss</Button>}
    >
      <div className="ov-progress" role="progressbar" aria-valuenow={n} aria-valuemin={0} aria-valuemax={steps.length}><i style={{ width: `${(n / steps.length) * 100}%` }} /></div>
      <ol className="ov-steps">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? 'is-done' : ''}>
            <span className="ov-steps__mark" aria-hidden="true">{s.done ? <Icon name="check" size={13} /> : i + 1}</span>
            <div>
              <div className="ov-steps__t">{s.to ? <Link to={s.to}>{s.label}</Link> : s.label}{s.done && <span className="sr-only"> (done)</span>}</div>
              <div className="ov-steps__h">{s.hint}</div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

export default function Overview() {
  const toast = useToast()
  const sum = usePolling(() => api.summary(), 3000)
  const ids = usePolling(() => api.idsSummary(), 4000)
  const policy = usePolling(() => api.policy(), 6000)
  const { alerts, status } = useAlertStream({ max: 30 })
  const [running, setRunning] = useState(null)

  useEffect(() => {
    const h = () => { sum.refresh(); ids.refresh(); policy.refresh() }
    window.addEventListener('sentinel:reset', h)
    return () => window.removeEventListener('sentinel:reset', h)
  }, [sum, ids, policy])

  const s = sum.data
  const run = async (name, label) => {
    setRunning(name)
    try {
      const r = await api.scenario(name)
      const t = r.summary || {}
      toast.success(`${t.total ?? 0} packets: ${t.allowed ?? 0} allowed, ${t.blocked ?? 0} blocked, ${t.alerts ?? 0} alerts.`, label)
      sum.refresh(); ids.refresh()
    } catch (e) { toast.error(e.message, `${label} failed`) }
    finally { setRunning(null) }
  }

  if (!s && sum.loading) return <div className="ov-load"><Spinner size={28} /></div>
  if (!s && sum.error) {
    return (<><PageHeader kicker="Command center" title="Overview" /><ErrorState error={sum.error} onRetry={sum.refresh} title="Dashboard unavailable" /></>)
  }

  const total = s.packets_total || 0
  const blockedPct = pct(s.blocked, total, 1)
  const tp = (s.throughput || []).map((b) => ({ t: formatTime(b.ts), Allowed: b.allowed, Blocked: b.blocked }))
  const spark = tp.slice(-24)
  const sevData = SEVERITY_ORDER.map((k) => ({ name: k, value: ids.data?.by_severity?.[k] || 0 }))
  const protoData = Object.entries(s.by_protocol || {}).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0)
  const protoTotal = protoData.reduce((a, b) => a + b.value, 0)
  const tops = (s.top_sources || []).slice(0, 6)
  const maxTop = Math.max(1, ...tops.map((t) => t.count))
  const bastion = s.bastion

  return (
    <>
      <PageHeader
        kicker="Command center" title="Overview"
        subtitle="Live view of simulated traffic, firewall decisions and intrusion alerts."
        actions={<Badge tone={status === 'live' ? 'allow' : status === 'polling' ? 'medium' : 'neutral'} dot>{status === 'live' ? 'LIVE STREAM' : status === 'polling' ? 'POLLING' : 'CONNECTING'}</Badge>}
      />
      {sum.error && <div style={{ marginBottom: 14 }}><ErrorState error={sum.error} onRetry={sum.refresh} title="Connection lost, showing last data" /></div>}

      <div className="ov-stats">
        <StatTile label="Packets" icon="activity" value={formatNumber(total)} sub={`${formatNumber(s.allowed)} allowed`} tone="accent">
          <MiniSpark data={spark} k="Allowed" color="var(--accent)" />
        </StatTile>
        <StatTile label="Blocked" icon="flame" value={`${blockedPct}%`} sub={`${formatNumber(s.blocked)} packets denied`} tone={blockedPct > 40 ? 'high' : 'medium'}>
          <MiniSpark data={spark} k="Blocked" color="var(--sev-high)" />
        </StatTile>
        <StatTile label="Alerts" icon="bell" value={formatNumber(s.alerts_total)} sub={`${s.alerts_unacked ?? 0} unacknowledged`} tone={s.alerts_unacked > 0 ? 'critical' : 'ok'} />
        <StatTile label="Firewall rules" icon="shield" value={s.rules_total ?? 0} sub={`${s.hosts_total ?? 0} hosts registered`} tone="cyan" />
        <StatTile label="Bastion" icon="lock" value={bastion ? 'SET' : 'NONE'} tone={bastion ? (policy.data?.bastion_mode ? 'allow' : 'medium') : 'neutral'}
          sub={bastion ? `${bastion.name} · ${policy.data?.bastion_mode ? 'enforced' : 'not enforced'}` : 'No bastion designated'} />
      </div>

      <Checklist sum={s} policy={policy.data} />

      <Panel title="Quick scenarios" subtitle="One click, many packets. Results flow into every chart on this page." className="ov-block">
        <div className="ov-scen">
          {SCENARIOS.map((sc) => (
            <button key={sc.name} type="button" className="ov-scen__btn" disabled={!!running} onClick={() => run(sc.name, sc.label)}>
              {running === sc.name ? <Spinner size={18} /> : <Icon name={sc.icon} size={18} />}
              <b>{sc.label}</b>
              <small>{sc.hint}</small>
            </button>
          ))}
        </div>
      </Panel>

      <div className="ov-grid ov-block">
        <Panel title="Throughput" subtitle="Allowed vs blocked packets, last 60 buckets" className="ov-span2">
          {tp.length === 0 ? <EmptyState title="No traffic yet" hint="Run the Normal traffic scenario to see the chart come alive." icon="activity" /> : (
            <div className="ov-chart" role="img" aria-label="Area chart of allowed versus blocked packets over time">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tp} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--allow)" stopOpacity=".5" /><stop offset="100%" stopColor="var(--allow)" stopOpacity="0" /></linearGradient>
                    <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--deny)" stopOpacity=".55" /><stop offset="100%" stopColor="var(--deny)" stopOpacity="0" /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" stroke="var(--text-2)" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} minTickGap={32} />
                  <YAxis stroke="var(--text-2)" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="Allowed" stroke="var(--allow)" strokeWidth={2} fill="url(#gA)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="Blocked" stroke="var(--deny)" strokeWidth={2} strokeDasharray="5 3" fill="url(#gB)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Alerts by severity" subtitle={`${ids.data?.total ?? 0} total`}>
          {(ids.data?.total || 0) === 0 ? <EmptyState title="No alerts" hint="Quiet network, or no attacks launched yet." icon="shield" /> : (
            <>
              <div className="ov-chart ov-chart--sm" role="img" aria-label="Bar chart of alert counts by severity">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sevData} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="var(--text-2)" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                    <YAxis stroke="var(--text-2)" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={tip} cursor={{ fill: 'var(--bg-3)' }} />
                    <Bar dataKey="value" name="Alerts" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {sevData.map((d) => <Cell key={d.name} fill={severityColor(d.name)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="ov-legend">{sevData.map((d) => <span key={d.name}><i style={{ background: severityColor(d.name) }} />{d.name} <b className="mono">{d.value}</b></span>)}</div>
            </>
          )}
        </Panel>
      </div>

      <div className="ov-grid ov-block">
        <Panel title="Top attacker sources" subtitle="Most active source addresses">
          {tops.length === 0 ? <EmptyState title="No sources yet" icon="target" /> : (
            <ul className="ov-tops">
              {tops.map((t, i) => (
                <li key={t.ip}>
                  <span className="mono ov-tops__ip"><em>{i + 1}</em><IpLink ip={t.ip} /></span>
                  <span className="ov-tops__bar"><i style={{ width: `${(t.count / maxTop) * 100}%` }} /></span>
                  <b className="mono">{formatNumber(t.count)}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Protocol mix">
          {protoTotal === 0 ? <EmptyState title="No packets" icon="network" /> : (
            <div className="ov-proto">
              <div className="ov-chart ov-chart--donut" role="img" aria-label="Donut chart of protocol mix">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={protoData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" stroke="var(--bg-1)" strokeWidth={2} isAnimationActive={false}>
                      {protoData.map((d, i) => <Cell key={d.name} fill={PROTO_COLORS[i % 3]} />)}
                    </Pie>
                    <Tooltip contentStyle={tip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="ov-legend ov-legend--col">
                {protoData.map((d, i) => <li key={d.name}><i style={{ background: PROTO_COLORS[i % 3] }} />{d.name}<b className="mono">{pct(d.value, protoTotal)}%</b></li>)}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Latest alerts" actions={<Link to="/alerts" className="ov-more">View all</Link>} pad={false}>
          {alerts.length === 0 ? <EmptyState title="No alerts yet" hint="Launch a scenario above to trigger detections." icon="bell" /> : (
            <ul className="ov-feed">
              {alerts.slice(0, 7).map((a) => (
                <li key={a.id}>
                  <SeverityBadge severity={a.severity} />
                  <div>
                    <div className="ov-feed__t">{a.title}</div>
                    <div className="ov-feed__m mono"><IpLink ip={a.src_ip} /> · {a.rule_id} · {relativeTime(a.ts)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}

function MiniSpark({ data, k, color }) {
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <Area type="monotone" dataKey={k} stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.15} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
