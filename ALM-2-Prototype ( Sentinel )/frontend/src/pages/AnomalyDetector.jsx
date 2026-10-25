import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { PageHeader, Panel, Button, Badge, EmptyState, Spinner, DataTable, useToast } from '../components/ui/index.js'
import { usePolling } from '../hooks/usePolling.js'
import { errMessage, formatNumber } from '../utils/format.js'
import MetricCard from '../components/anomaly/MetricCard.jsx'
import BellCurve from '../components/anomaly/BellCurve.jsx'
import ApiBanner from '../components/alerts/ApiBanner.jsx'
import '../components/anomaly/anomaly.css'

const BUCKETS = [1, 2, 5, 10, 15, 30, 60]
const SPIKES = [
  { name: 'ddos', label: 'Inject DDoS spike', hint: 'packets_per_sec and bytes_per_dst jump' },
  { name: 'brute_force', label: 'Inject brute force', hint: 'login_attempts_per_min jumps' },
  { name: 'exfiltration', label: 'Inject exfiltration', hint: 'bytes_per_dst jumps' },
]
const n2 = (v) => (v == null || Number.isNaN(v) ? '-' : formatNumber(Math.round(v * 100) / 100))

const CONCEPTS = [
  { t: 'Mean and standard deviation', d: 'The mean is the typical value. The standard deviation (std) says how far values normally wander from it. Together they describe "normal" for one metric.' },
  { t: 'Z-score', d: 'z = (value - mean) / std. It counts how many standard deviations a value sits from normal, so very different metrics (packets, bytes, ratios) share one scale.' },
  { t: 'The 68-95-99.7 rule', d: 'For bell-shaped data, about 68% of values fall within 1σ, 95% within 2σ and 99.7% within 3σ. Beyond 3σ is rare, roughly 1 in 740 on the high side, so it is suspicious.' },
  { t: 'Choosing sigma', d: 'A low sigma catches more attacks but cries wolf more often (false positives). A high sigma is quiet but misses subtle attacks (false negatives). Try 2, then 5, and inject a spike.' },
  { t: 'False positives', d: 'Legitimate surges (a product launch, a backup job) look anomalous. Statistics flag "unusual", not "malicious", so alerts need a human or a second signal.' },
  { t: 'Baseline poisoning', d: 'If an attacker ramps up slowly, or attacks while the baseline is being learned, the mean and std absorb the attack and it looks normal. Train baselines on known-clean traffic.' },
]

export default function AnomalyDetector() {
  const toast = useToast()
  const metricsQ = usePolling(() => api.anomalyMetrics(60), 2000)
  const sourcesQ = usePolling(() => api.anomalySources(), 3000)
  const cfgQ = usePolling(() => api.anomalyConfig(), 0)
  const [sigma, setSigma] = useState(3)
  const [bucket, setBucket] = useState(5)
  const [minSamples, setMinSamples] = useState(10)
  const inited = useRef(false)
  const [busy, setBusy] = useState('')
  const [sel, setSel] = useState(null)

  useEffect(() => {
    const c = cfgQ.data
    if (c && !inited.current) {
      inited.current = true
      if (c.sigma != null) setSigma(c.sigma)
      if (c.bucket_seconds != null) setBucket(c.bucket_seconds)
      if (c.min_samples != null) setMinSamples(c.min_samples)
    }
  }, [cfgQ.data])

  const metrics = metricsQ.data?.metrics || []
  const activeSigma = metricsQ.data?.sigma ?? sigma
  const sources = sourcesQ.data || []

  const saveCfg = async (patch) => {
    const next = { sigma, bucket_seconds: bucket, min_samples: minSamples, ...patch }
    try {
      await api.setAnomalyConfig(next)
      toast.success(`sigma ${next.sigma}, bucket ${next.bucket_seconds}s`, 'Detector updated')
      metricsQ.refresh()
    } catch (e) { toast.error(errMessage(e)) }
  }

  const act = async (key, fn, okMsg) => {
    setBusy(key)
    try {
      const r = await fn()
      toast.success(typeof okMsg === 'function' ? okMsg(r) : okMsg)
      metricsQ.refresh(); sourcesQ.refresh()
    } catch (e) { toast.error(errMessage(e)) } finally { setBusy('') }
  }

  // which item the bell curve shows
  const topSource = [...sources].sort((a, b) => (b.z ?? -9) - (a.z ?? -9))[0]
  let bell = null
  if (sel?.type === 'metric') {
    const m = metrics.find((x) => x.key === sel.key)
    const z = m?.points?.[m.points.length - 1]?.z
    if (m) bell = { label: m.label, z, sub: `${m.label}: latest ${n2(m.points?.[m.points.length - 1]?.value)} ${m.unit || ''} vs mean ${n2(m.mean)} (std ${n2(m.std)})` }
  } else if (sel?.type === 'source') {
    const s = sources.find((x) => x.ip === sel.ip)
    if (s) bell = { label: s.ip, z: s.z, sub: `${s.ip}: ${n2(s.last_pps)} pps vs mean ${n2(s.mean_pps)} (std ${n2(s.std_pps)}), ${s.samples} samples` }
  }
  if (!bell && topSource) bell = { label: topSource.ip, z: topSource.z, sub: `${topSource.ip}: ${n2(topSource.last_pps)} pps vs mean ${n2(topSource.mean_pps)} (std ${n2(topSource.std_pps)})` }
  if (!bell && metrics[0]) {
    const m = metrics[0]
    bell = { label: m.label, z: m.points?.[m.points.length - 1]?.z, sub: `${m.label} vs its baseline` }
  }

  const anomCount = metrics.filter((m) => { const l = m.points?.[m.points.length - 1]; return l?.anomaly || (l?.z != null && l.z > activeSigma) }).length

  const srcCols = [
    { key: 'ip', header: 'Source', mono: true },
    { key: 'mean_pps', header: 'Mean pps', mono: true, align: 'right', render: (s) => n2(s.mean_pps) },
    { key: 'std_pps', header: 'Std', mono: true, align: 'right', render: (s) => n2(s.std_pps) },
    { key: 'last_pps', header: 'Last pps', mono: true, align: 'right', render: (s) => n2(s.last_pps) },
    { key: 'z', header: 'z-score', mono: true, align: 'right', render: (s) => <b className={s.anomalous ? 'an-bad' : ''}>{s.z == null ? '-' : s.z.toFixed(2)}</b> },
    { key: 'samples', header: 'Samples', mono: true, align: 'right' },
    { key: 'st', header: 'Status', render: (s) => <Badge tone={s.anomalous ? 'critical' : 'allow'} dot>{s.anomalous ? 'Anomalous' : 'Normal'}</Badge> },
  ]

  return (
    <div className="an">
      <PageHeader
        kicker="Detection"
        title="Anomaly Detector"
        subtitle="Learns what normal traffic looks like, then flags values that sit too many standard deviations away."
        actions={
          <Badge tone={anomCount ? 'critical' : 'allow'} dot>{anomCount ? `${anomCount} metric${anomCount > 1 ? 's' : ''} anomalous` : 'All metrics normal'}</Badge>
        }
      />
      <ApiBanner error={metricsQ.error && !metricsQ.data ? metricsQ.error : null} onRetry={metricsQ.refresh} />

      <Panel title="Controls" subtitle="Tune the detector and generate something worth detecting">
        <div className="an-ctrl">
          <div className="an-ctrl__item an-ctrl__sigma">
            <label htmlFor="an-sigma">Sigma threshold <b className="mono">{Number(sigma).toFixed(1)}σ</b></label>
            <input
              id="an-sigma" type="range" min="1" max="6" step="0.5" value={sigma}
              onChange={(e) => setSigma(Number(e.target.value))}
              onMouseUp={(e) => saveCfg({ sigma: Number(e.target.value) })}
              onTouchEnd={(e) => saveCfg({ sigma: Number(e.currentTarget.value) })}
              onKeyUp={(e) => saveCfg({ sigma: Number(e.currentTarget.value) })}
            />
            <div className="an-ctrl__ticks mono"><span>1 sensitive</span><span>3 default</span><span>6 relaxed</span></div>
          </div>
          <div className="an-ctrl__item">
            <label htmlFor="an-bucket">Bucket size</label>
            <select id="an-bucket" className="ui-input ui-select" value={bucket} onChange={(e) => { const v = Number(e.target.value); setBucket(v); saveCfg({ bucket_seconds: v }) }}>
              {BUCKETS.map((b) => <option key={b} value={b}>{b} seconds</option>)}
            </select>
          </div>
          <div className="an-ctrl__item an-ctrl__btns">
            <Button variant="primary" loading={busy === 'train'} onClick={() => act('train', () => api.trainBaseline(5), (r) => `Baseline trained (${r?.buckets ?? '?'} buckets)`)}>Train baseline</Button>
          </div>
        </div>
        <div className="an-spikes">
          <span className="an-spikes__t">Inject a spike</span>
          {SPIKES.map((s) => (
            <Button key={s.name} variant="danger" size="sm" loading={busy === s.name} disabled={!!busy && busy !== s.name} onClick={() => act(s.name, () => api.scenario(s.name), `${s.name} traffic sent. Watch the charts.`)} title={s.hint}>
              {s.label}
            </Button>
          ))}
          <Button size="sm" loading={busy === 'normal'} onClick={() => act('normal', () => api.scenario('normal'), 'Normal traffic sent')}>Send normal traffic</Button>
        </div>
      </Panel>

      {metricsQ.loading && !metricsQ.data ? (
        <div className="an-load"><Spinner /> Loading metrics</div>
      ) : metrics.length === 0 ? (
        <Panel><EmptyState title="No metric data yet" hint="Train a baseline, then send some traffic." icon="activity" action={<Button variant="primary" size="sm" onClick={() => act('train', () => api.trainBaseline(5), 'Baseline trained')}>Train baseline</Button>} /></Panel>
      ) : (
        <div className="an-grid">
          {metrics.map((m) => (
            <MetricCard key={m.key} m={m} sigma={activeSigma} selected={sel?.type === 'metric' && sel.key === m.key} onSelect={() => setSel({ type: 'metric', key: m.key })} />
          ))}
        </div>
      )}

      <div className="an-two">
        <Panel title="Per-source profile" subtitle="Each source IP is compared with its own history. Click a row for the bell curve." pad={false}>
          {sourcesQ.loading && !sourcesQ.data ? (
            <div className="an-load"><Spinner /></div>
          ) : (
            <div className="an-tablewrap">
              <DataTable
                columns={srcCols}
                rows={sources}
                rowKey="ip"
                onRowClick={(s) => setSel({ type: 'source', ip: s.ip })}
                rowClass={(s) => (s.anomalous ? 'an-rowbad' : sel?.ip === s.ip ? 'an-rowsel' : '')}
                empty={<EmptyState title="No sources profiled" hint="Send traffic to build per-source profiles." icon="radar" />}
              />
            </div>
          )}
        </Panel>
        <Panel title="Where does it sit?" subtitle={bell?.sub || 'Select a metric or a source'}>
          {bell ? (
            <>
              <BellCurve z={bell.z} sigma={activeSigma} label="" />
              <p className="an-bellnote">
                The curve is "normal". Shaded bands are 1σ, 2σ and 3σ (68%, 95%, 99.7% of values). The red tail beyond {activeSigma}σ is the alert zone. The dot is the latest value of <b>{bell.label}</b>.
              </p>
            </>
          ) : (
            <EmptyState title="Nothing to plot" icon="activity" />
          )}
        </Panel>
      </div>

      <Panel title="How statistical anomaly detection works" subtitle="Six ideas behind the charts above">
        <div className="an-concepts">
          {CONCEPTS.map((c, i) => (
            <div key={c.t} className="an-concept">
              <span className="an-concept__n mono">{String(i + 1).padStart(2, '0')}</span>
              <h4>{c.t}</h4>
              <p>{c.d}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
