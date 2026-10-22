import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client.js'
import { PageHeader, Panel, Button, Badge, EmptyState, Spinner, DataTable, useToast } from '../components/ui/index.js'
import { usePolling } from '../hooks/usePolling.js'
import { formatBytes, formatTime, errMessage } from '../utils/format.js'
import HostPicker, { isValidIp } from '../components/traffic/HostPicker.jsx'
import ResultStream from '../components/traffic/ResultStream.jsx'
import ApiBanner from '../components/alerts/ApiBanner.jsx'
import { TYPES, typeByKey, EXTERNAL_DEFAULT, INTERNAL_DEFAULT } from '../components/traffic/trafficTypes.js'
import '../components/traffic/traffic.css'

const SCENARIO_HINT = {
  normal: 'Expect: no alerts. Benign traffic across hosts that also feeds the anomaly baseline.',
  brute_force: 'Expect: IDS-001 SSH brute force (high).',
  port_scan: 'Expect: IDS-003 port scan, plus firewall blocks and possibly IDS-006.',
  ddos: 'Expect: IDS-004 SYN flood (critical) and a spike on the Anomaly page.',
  exfiltration: 'Expect: IDS-005 large transfer to an external IP (high).',
  telnet_probe: 'Expect: IDS-002 telnet traffic (medium), blocked by the telnet deny rule.',
  bastion_bypass: 'Expect: IDS-008 bastion bypass (high). Turn on bastion mode first to see it blocked.',
}

function previewBytes(type, bytes) {
  if (type.key === 'data_transfer') return formatBytes(bytes)
  if (type.key === 'syn_flood') return '60 B (SYN)'
  return null
}

export default function TrafficGenerator() {
  const toast = useToast()
  const hostsQ = usePolling(() => api.hosts(), 0)
  const scenQ = usePolling(() => api.scenarios(), 0)
  const hosts = hostsQ.data || []

  const [typeKey, setTypeKey] = useState('http')
  const type = typeByKey(typeKey)
  const [src, setSrc] = useState(EXTERNAL_DEFAULT)
  const [dst, setDst] = useState(INTERNAL_DEFAULT)
  const [port, setPort] = useState(80)
  const [count, setCount] = useState(1)
  const [mb, setMb] = useState(1)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [runningScn, setRunningScn] = useState(null)
  const [result, setResult] = useState(null)
  const [resultTitle, setResultTitle] = useState('')
  const [sendError, setSendError] = useState(null)

  const [fVerdict, setFVerdict] = useState('')
  const [fSrc, setFSrc] = useState('')
  const pktsQ = usePolling(() => api.packets({ limit: 50, verdict: fVerdict, src_ip: fSrc.trim() }), 3000, [fVerdict, fSrc])

  // Pick sensible defaults once hosts load
  useEffect(() => {
    if (!hosts.length) return
    const ext = hosts.find((h) => h.role === 'external')
    const web = hosts.find((h) => h.role === 'web')
    if (ext && !hosts.some((h) => h.ip === src)) setSrc(ext.ip)
    if (web && !hosts.some((h) => h.ip === dst)) setDst(web.ip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsQ.data])

  const pickType = (t) => {
    setTypeKey(t.key)
    if (t.port) setPort(t.port)
    setCount(t.key === 'port_scan' ? 15 : t.key === 'syn_flood' ? 150 : t.key === 'ssh_login' ? 6 : t.key === 'ping' ? 4 : 1)
    if (t.key === 'data_transfer') setMb(12)
    setSuccess(false)
  }

  const bytes = Math.round(Number(mb) * 1024 * 1024)
  const portNum = Number(port)
  const valid = isValidIp(src) && isValidIp(dst) && count >= 1 && count <= 500 && (!type.portEditable || (portNum >= 1 && portNum <= 65535))

  const payload = useMemo(() => {
    const p = { type: typeKey, src_ip: src, dst_ip: dst, count: Number(count), protocol: type.protocol }
    if (type.port) p.dst_port = type.portEditable ? portNum : type.port
    if (typeKey === 'ssh_login') p.success = success
    if (typeKey === 'data_transfer') p.bytes = bytes
    return p
  }, [typeKey, src, dst, count, portNum, success, bytes, type])

  const srcName = hosts.find((h) => h.ip === src)?.name
  const dstName = hosts.find((h) => h.ip === dst)?.name

  const finish = (res, title) => {
    setResult(res)
    setResultTitle(title)
    setSendError(null)
    pktsQ.refresh()
    const s = res.summary
    if (s?.alerts) toast.push({ tone: 'warn', title: `${s.alerts} alert${s.alerts > 1 ? 's' : ''} raised`, message: `${s.blocked} blocked, ${s.allowed} allowed` })
    else toast.success(`${s?.total ?? 0} packets: ${s?.allowed ?? 0} allowed, ${s?.blocked ?? 0} blocked`, 'Traffic sent')
  }

  const send = async () => {
    setBusy(true)
    try { finish(await api.send(payload), `${type.label} x${payload.count}`) } catch (e) { setSendError(e); toast.error(errMessage(e)) } finally { setBusy(false) }
  }
  const runScenario = async (s) => {
    setRunningScn(s.name)
    try { finish(await api.scenario(s.name), s.title) } catch (e) { setSendError(e); toast.error(errMessage(e)) } finally { setRunningScn(null) }
  }

  const connErr = hostsQ.error || scenQ.error
  const pkts = pktsQ.data || []

  const columns = [
    { key: 'ts', header: 'Time', render: (p) => formatTime(p.ts), mono: true },
    { key: 'verdict', header: 'Verdict', render: (p) => <Badge tone={p.verdict === 'allowed' ? 'allow' : 'deny'} dot>{p.verdict}</Badge> },
    { key: 'type', header: 'Type', mono: true },
    { key: 'flow', header: 'Flow', mono: true, render: (p) => `${p.src_ip} > ${p.dst_ip}${p.dst_port != null ? `:${p.dst_port}` : ''}` },
    { key: 'protocol', header: 'Proto', mono: true },
    { key: 'bytes', header: 'Size', mono: true, align: 'right', render: (p) => formatBytes(p.bytes) },
    { key: 'rule', header: 'Matched rule', render: (p) => p.matched_rule_name || <span className="tg-dim">default policy</span> },
    { key: 'reason', header: 'Reason', render: (p) => <span className="tg-dim">{p.reason}</span> },
  ]

  const pBytes = previewBytes(type, bytes)

  return (
    <div className="tg">
      <PageHeader
        kicker="Simulation"
        title="Packet Forge"
        subtitle="Craft traffic, send it through the firewall and IDS, and watch every verdict."
      />
      <ApiBanner error={connErr} onRetry={() => { hostsQ.refresh(); scenQ.refresh() }} />

      <div className="tg-grid">
        <Panel title="1. Choose traffic type" subtitle="Each type has its own defaults and controls">
          <div className="tg-types" role="radiogroup" aria-label="Traffic type">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={t.key === typeKey}
                className={`tg-type ${t.key === typeKey ? 'is-active' : ''}`}
                style={{ '--tone': `var(${t.tone})` }}
                onClick={() => pickType(t)}
              >
                <span className="tg-type__glyph mono">{t.glyph}</span>
                <span className="tg-type__name">{t.label}</span>
                <span className="tg-type__meta mono">{t.protocol}{t.port ? `/${t.port}` : ''}</span>
              </button>
            ))}
          </div>
          <p className="tg-blurb">{type.blurb}</p>
        </Panel>

        <Panel title="2. Configure packet" subtitle="Source, destination and options">
          <div className="tg-form">
            <HostPicker label="Source" value={src} onChange={setSrc} hosts={hosts} />
            <HostPicker label="Destination" value={dst} onChange={setDst} hosts={hosts} />
            <div className="tg-fields">
              {type.port != null && (
                <div>
                  <label className="tg-label" htmlFor="tg-port">Destination port</label>
                  <input id="tg-port" className="ui-input mono" type="number" min="1" max="65535" value={type.portEditable ? port : type.port} disabled={!type.portEditable} onChange={(e) => setPort(e.target.value)} />
                </div>
              )}
              <div>
                <label className="tg-label" htmlFor="tg-proto">Protocol</label>
                <input id="tg-proto" className="ui-input mono" value={type.protocol} disabled readOnly />
              </div>
              <div>
                <label className="tg-label" htmlFor="tg-count">{type.countLabel || 'Packet count'}</label>
                <input id="tg-count" className="ui-input mono" type="number" min="1" max="500" value={count} onChange={(e) => setCount(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} />
              </div>
              {type.ctrl.includes('bytes') && (
                <div>
                  <label className="tg-label" htmlFor="tg-mb">Transfer size (MB)</label>
                  <input id="tg-mb" className="ui-input mono" type="number" min="0.001" step="0.5" value={mb} onChange={(e) => setMb(e.target.value)} />
                </div>
              )}
              {type.ctrl.includes('success') && (
                <div>
                  <span className="tg-label">Login outcome</span>
                  <div className="tg-seg" role="group" aria-label="Login outcome">
                    <button type="button" className={!success ? 'is-on is-deny' : ''} onClick={() => setSuccess(false)}>Fail</button>
                    <button type="button" className={success ? 'is-on is-allow' : ''} onClick={() => setSuccess(true)}>Success</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="tg-preview" aria-label="Packet preview">
            <div className="tg-preview__bar mono"><span>packet header</span><span>x{count || 0}</span></div>
            <div className="tg-preview__line mono">
              <span className="tg-tok tg-tok--proto">{type.protocol}</span>
              <span className="tg-tok tg-tok--ip">{src || '?'}</span>
              <span className="tg-tok tg-tok--arrow" aria-hidden="true">{'==>'}</span>
              <span className="tg-tok tg-tok--ip">{dst || '?'}{type.port ? `:${type.portEditable ? port : type.port}` : ''}</span>
              <span className="tg-tok tg-tok--type" style={{ color: `var(${type.tone})` }}>{type.label.toUpperCase()}</span>
              {typeKey === 'ssh_login' && <span className={`tg-tok ${success ? 'tg-tok--ok' : 'tg-tok--bad'}`}>{success ? 'AUTH OK' : 'AUTH FAIL'}</span>}
              {pBytes && <span className="tg-tok">{pBytes}</span>}
            </div>
            <div className="tg-preview__names">{srcName || 'custom host'} to {dstName || 'custom host'}</div>
          </div>

          <div className="tg-send">
            <Button variant="primary" loading={busy} disabled={!valid || !!runningScn} onClick={send}>Send packets</Button>
            {!valid && <span className="tg-err">Check addresses, port and count.</span>}
          </div>
        </Panel>
      </div>

      <Panel
        title="Attack scenarios"
        subtitle="One click, a realistic burst of traffic"
        actions={scenQ.loading && <Spinner />}
      >
        {scenQ.data && scenQ.data.length === 0 && <EmptyState title="No scenarios" hint="The backend returned none." />}
        <div className="tg-scenarios">
          {(scenQ.data || []).map((s) => (
            <article key={s.name} className="tg-scn">
              <header>
                <h3>{s.title}</h3>
                {s.type_hint && <Badge tone="violet">{s.type_hint}</Badge>}
              </header>
              <p>{s.description}</p>
              <p className="tg-scn__hint">{SCENARIO_HINT[s.name] || 'Watch the Alerts page for detections.'}</p>
              <Button size="sm" variant={s.name === 'normal' ? 'ghost' : 'danger'} loading={runningScn === s.name} disabled={busy || (!!runningScn && runningScn !== s.name)} onClick={() => runScenario(s)}>
                Launch
              </Button>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title={result ? `Results: ${resultTitle}` : 'Results'} subtitle="Per-packet verdicts from the firewall and IDS" tone={result?.summary?.alerts ? 'warn' : undefined}>
        {sendError && <div className="tg-err" role="alert">Request failed: {errMessage(sendError)}</div>}
        {result ? (
          <ResultStream result={result} />
        ) : (
          <EmptyState title="Nothing sent yet" hint="Forge a packet above or launch a scenario to see verdicts stream in." icon="terminal" />
        )}
      </Panel>

      <Panel
        title="Recent packets"
        subtitle="Auto-refreshes every 3 seconds"
        actions={
          <div className="tg-filters">
            <select className="ui-input ui-select" aria-label="Filter by verdict" value={fVerdict} onChange={(e) => setFVerdict(e.target.value)}>
              <option value="">All verdicts</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <input className="ui-input mono" aria-label="Filter by source IP" placeholder="Source IP" value={fSrc} onChange={(e) => setFSrc(e.target.value)} />
          </div>
        }
        pad={false}
      >
        {pktsQ.error && !pktsQ.data ? (
          <EmptyState title="Could not load packets" hint={errMessage(pktsQ.error)} icon="alert" />
        ) : pktsQ.loading && !pktsQ.data ? (
          <div className="tg-loading"><Spinner /> Loading packets</div>
        ) : (
          <div className="tg-tablewrap">
            <DataTable
              columns={columns}
              rows={pkts}
              rowKey="id"
              rowClass={(p) => (p.verdict === 'blocked' ? 'tg-trblocked' : '')}
              empty={<EmptyState title="No packets match" hint="Send some traffic or relax the filters." icon="radar" />}
            />
          </div>
        )}
      </Panel>
    </div>
  )
}
