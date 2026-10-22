import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { usePolling } from '../hooks/usePolling.js'
import {
  Badge, Button, EmptyState, ErrorState, Input, PageHeader, Panel, SeverityBadge, Spinner, StatTile, useToast,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui/index.js'
import ConfirmDialog from '../components/alerts/ConfirmDialog.jsx'
import IpLink from '../components/investigate/IpLink.jsx'
import { errMessage, formatNumber, formatTime, formatDateTime, relativeTime, isExternalIp } from '../utils/format.js'
import { isIPv4 } from '../utils/net.js'
import '../components/investigate/investigate.css'
import './Investigate.css'

function SearchBox({ initial = '', onGo }) {
  const [v, setV] = useState(initial)
  const [err, setErr] = useState('')
  const go = (e) => {
    e.preventDefault()
    const ip = v.trim()
    if (!isIPv4(ip)) { setErr('Enter a valid IPv4 address, e.g. 203.0.113.50.'); return }
    setErr(''); onGo(ip)
  }
  return (
    <form className="inv-search" onSubmit={go} role="search">
      <div className="inv-search__field">
        <Input mono value={v} onChange={(e) => { setV(e.target.value); setErr('') }} placeholder="Search an IP address" aria-label="IP address to investigate" aria-invalid={!!err} />
        {err && <div className="inv-search__err" role="alert">{err}</div>}
      </div>
      <Button type="submit" variant="primary" icon="search">Investigate</Button>
    </form>
  )
}

function EmptyInvestigate() {
  const summaryQ = usePolling(() => api.summary(), 0)
  const ips = useMemo(() => (summaryQ.data?.top_sources || []).slice(0, 6).map((s) => s.ip), [summaryQ.data])
  return (
    <Panel>
      <EmptyState
        icon="target"
        title="Pick an address to investigate"
        hint="Search for any IPv4 address to see its traffic, alerts, rules hit and peers."
        action={
          summaryQ.loading ? <Spinner /> : ips.length ? (
            <div>
              <div className="inv-empty">Top offenders</div>
              <div className="inv-sugg">{ips.map((ip) => <Link key={ip} to={`/investigate/${ip}`}><Button size="sm" className="mono">{ip}</Button></Link>)}</div>
            </div>
          ) : <span className="inv-empty">No traffic yet. Send some from the Packet Forge.</span>
        }
      />
    </Panel>
  )
}

function Timeline({ data, ip }) {
  const items = useMemo(() => {
    const list = []
    ;(data.packets || []).forEach((p, i) => list.push({ key: `p${p.id ?? i}`, ts: p.ts, kind: 'packet', p }))
    ;(data.alerts || []).forEach((a, i) => list.push({ key: `a${a.id ?? i}`, ts: a.ts, kind: 'alert', a }))
    return list.sort((x, y) => new Date(y.ts) - new Date(x.ts))
  }, [data])
  if (!items.length) return <div className="inv-empty">No activity recorded for this address.</div>
  const end = (addr) => (addr === ip ? <b>{addr}</b> : <IpLink ip={addr} />)
  return (
    <ul className="inv-tl">
      {items.map((it) => it.kind === 'alert' ? (
        <li key={it.key}>
          <span className="inv-tl__time mono" title={formatDateTime(it.ts)}>{formatTime(it.ts)}</span>
          <SeverityBadge severity={it.a.severity} />
          <span className="inv-tl__what"><b>{it.a.title}</b> <span className="inv-tl__rule mono">{it.a.rule_id}</span></span>
        </li>
      ) : (
        <li key={it.key}>
          <span className="inv-tl__time mono" title={formatDateTime(it.ts)}>{formatTime(it.ts)}</span>
          <Badge tone={it.p.verdict === 'blocked' ? 'deny' : 'allow'}>{it.p.verdict === 'blocked' ? 'blocked' : 'allowed'}</Badge>
          <span className="inv-tl__what mono">
            {end(it.p.src_ip)}{' > '}{end(it.p.dst_ip)}
            {it.p.dst_port != null && it.p.dst_port !== '' ? `:${it.p.dst_port}` : ''} {it.p.protocol}
            <span className="inv-tl__rule"> {it.p.matched_rule_name || 'default policy'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function Investigate() {
  const { ip: rawIp } = useParams()
  const ip = rawIp ? decodeURIComponent(rawIp) : ''
  const navigate = useNavigate()
  const toast = useToast()
  const valid = isIPv4(ip)
  const q = usePolling(() => (valid ? api.investigate(ip) : Promise.resolve(null)), valid ? 4000 : 0, [ip])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const go = (v) => navigate(`/investigate/${v}`)

  const block = async () => {
    setBusy(true)
    try {
      await api.createRule({
        name: `Block ${ip}`, action: 'deny', protocol: 'ANY', src_ip: ip, dst_ip: 'ANY', src_port: 'ANY', dst_port: 'ANY',
        priority: 1, enabled: true, description: `Created from Investigation: ${ip}.`,
      })
      toast.success(`Deny rule created for ${ip} at priority 1`, 'Firewall updated')
      setConfirm(false); q.refresh()
    } catch (e) { toast.error(errMessage(e)) } finally { setBusy(false) }
  }

  const header = (
    <PageHeader kicker="Analysis" title="Investigate" subtitle="Everything Sentinel knows about one address: traffic, alerts, rules and peers."
      actions={<SearchBox key={ip} initial={ip} onGo={go} />} />
  )

  if (!ip) return <div className="inv">{header}<EmptyInvestigate /></div>
  if (!valid) return <div className="inv">{header}<Panel><EmptyState icon="alert" title="Not a valid IPv4 address" hint={`"${ip}" cannot be investigated. Try a dotted address such as 10.0.1.10.`} /></Panel></div>

  const d = q.data
  if (q.loading && !d) return <div className="inv">{header}<div className="inv-load"><Spinner /> Loading {ip}</div></div>
  if (q.error && !d) return <div className="inv">{header}<ErrorState error={q.error} onRetry={q.refresh} title={`Could not load ${ip}`} /></div>
  if (!d) return <div className="inv">{header}</div>

  const host = d.host
  const t = d.totals || {}
  const external = host ? (host.role === 'external' || isExternalIp(ip)) : isExternalIp(ip)
  const rules = d.rules_hit || []
  const peers = d.top_peers || []

  return (
    <div className="inv">
      {header}
      {q.error && <ErrorState error={q.error} onRetry={q.refresh} title="Refresh failed, showing last data" />}
      <div className="inv-head">
        <div className="inv-id">
          <div className="inv-id__ip mono">{ip}</div>
          <div className="inv-id__name">
            {host ? (
              <>
                <b>{host.name}</b>
                {host.role && <Badge tone="neutral">{host.role}</Badge>}
                {host.is_bastion && <Badge tone="accent">bastion</Badge>}
              </>
            ) : <span>Unknown address</span>}
            {external && host?.role !== 'external' && <Badge tone="deny">external</Badge>}
          </div>
          <div className="inv-id__meta">
            {d.first_seen ? <>First seen {relativeTime(d.first_seen)}</> : 'Never seen in traffic'}
            {d.last_seen ? <> &middot; last seen {relativeTime(d.last_seen)}</> : null}
          </div>
        </div>
        <div className="inv-actions">
          <Button variant="danger" icon="shield" onClick={() => setConfirm(true)}>Block this IP</Button>
          <Link to="/traffic"><Button icon="play">Open in Traffic Generator</Button></Link>
          <Link to="/alerts"><Button icon="alert">Alerts</Button></Link>
        </div>
      </div>

      <div className="inv-stats">
        <StatTile label="Packets" value={formatNumber(t.packets ?? 0)} tone="cyan" />
        <StatTile label="Allowed" value={formatNumber(t.allowed ?? 0)} tone="ok" />
        <StatTile label="Denied" value={formatNumber(t.denied ?? 0)} tone="high" />
        <StatTile label="Alerts" value={formatNumber(t.alerts ?? 0)} tone="medium" />
      </div>

      <div className="inv-cols">
        <Panel title="Activity timeline" subtitle="Packets and alerts, newest first">
          <Timeline data={d} ip={ip} />
        </Panel>
        <div className="inv-side">
          <Panel title="Rules hit" pad={false}>
            {rules.length === 0 ? <div className="inv-empty inv-empty--pad">No rules matched yet.</div> : (
              <Table>
                <THead><TR><TH>Rule</TH><TH>Hits</TH></TR></THead>
                <TBody>{rules.map((r) => { const rule = typeof r.rule === 'object' ? r.rule : { id: r.rule, name: String(r.rule) }; return <TR key={rule.id}><TD>{rule.name}</TD><TD className="mono">{formatNumber(r.hits)}</TD></TR> })}</TBody>
              </Table>
            )}
          </Panel>
          <Panel title="Top peers" subtitle="Addresses it talks to most">
            {peers.length === 0 ? <div className="inv-empty">No peers yet.</div> : (
              <ul className="inv-list">
                {peers.map((p) => (
                  <li key={p.ip}><IpLink ip={p.ip} /><b className="mono">{formatNumber(p.packets)}</b></li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog open={confirm} danger busy={busy} title="Create block rule?" confirmLabel="Create deny rule" onClose={() => setConfirm(false)} onConfirm={block}>
        <p>Add a firewall rule at priority 1 that denies <b className="mono">ANY</b> traffic from <b className="mono">{ip}</b>. You can edit or delete it later in the Rule Manager.</p>
      </ConfirmDialog>
    </div>
  )
}
