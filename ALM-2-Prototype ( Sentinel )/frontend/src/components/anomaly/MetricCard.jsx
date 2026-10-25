import { memo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Badge } from '../ui/index.js'
import { formatNumber, formatTime } from '../../utils/format.js'

const nf = (v) => (v == null || Number.isNaN(v) ? '-' : formatNumber(Math.round(v * 100) / 100))

function Tip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="an-tip mono">
      <div>{formatTime(p.ts)}</div>
      <div>value <b>{nf(p.value)}</b> {unit}</div>
      <div>z-score <b className={p.anomaly ? 'is-bad' : ''}>{p.z == null ? '-' : p.z.toFixed(2)}</b></div>
      {p.anomaly && <div className="is-bad">ANOMALY</div>}
    </div>
  )
}

function Gauge({ z, sigma }) {
  const lo = -2
  const hi = Math.max(sigma + 2, 6)
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`
  const over = z != null && z > sigma
  return (
    <div className="an-gauge" role="meter" aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={z ?? 0} aria-label="Current z-score">
      <div className="an-gauge__track">
        <i className="an-gauge__safe" style={{ width: pos(sigma) }} />
        <i className="an-gauge__danger" style={{ left: pos(sigma), right: 0 }} />
        <b className="an-gauge__needle" style={{ left: pos(z ?? 0), background: over ? 'var(--sev-critical)' : 'var(--accent)' }} />
      </div>
      <div className="an-gauge__scale mono"><span>{lo}</span><span style={{ left: pos(0) }}>0</span><span style={{ left: pos(sigma) }}>{sigma}σ</span></div>
    </div>
  )
}

function dotRenderer({ cx, cy, payload, index }) {
  if (!payload?.anomaly || cx == null || cy == null) return <g key={`d${index}`} />
  return (
    <g key={`d${index}`}>
      <circle cx={cx} cy={cy} r="8" fill="var(--sev-critical)" opacity=".25" className="an-pulse" />
      <circle cx={cx} cy={cy} r="4" fill="var(--sev-critical)" stroke="var(--bg-0)" strokeWidth="1.5" />
    </g>
  )
}

function MetricCard({ m, sigma, selected, onSelect }) {
  const pts = m.points || []
  const last = pts[pts.length - 1]
  const z = last?.z ?? null
  const anomalous = !!(last?.anomaly) || (z != null && z > sigma)
  const latest = typeof m.latest === 'object' && m.latest ? m.latest.value : m.latest ?? last?.value
  const maxV = Math.max(m.threshold || 0, ...pts.map((p) => p.value || 0), 1)
  const hasBaseline = pts.length >= 10
  return (
    <article className={`an-card ${anomalous ? 'is-anom' : ''} ${selected ? 'is-sel' : ''}`}>
      <header className="an-card__head">
        <div>
          <h3>{m.label}</h3>
          <div className="an-card__sub mono">{m.key}</div>
        </div>
        <Badge tone={anomalous ? 'critical' : 'allow'} dot>{anomalous ? 'Anomalous' : 'Normal'}</Badge>
      </header>
      <div className="an-card__nums mono">
        <div><span>now</span><b>{nf(latest)}</b><em>{m.unit}</em></div>
        <div><span>mean</span><b>{nf(m.mean)}</b></div>
        <div><span>std</span><b>{nf(m.std)}</b></div>
        <div><span>limit</span><b className="is-lim">{nf(m.threshold)}</b></div>
      </div>
      <div className="an-card__chart" role="img" aria-label={`${m.label} over time with mean and threshold lines. Status ${anomalous ? 'anomalous' : 'normal'}.`}>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={pts} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="ts" tickFormatter={formatTime} tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} minTickGap={40} />
            <YAxis domain={[0, Math.ceil(maxV * 1.15)]} tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip content={<Tip unit={m.unit} />} />
            {m.mean != null && <ReferenceLine y={m.mean} stroke="var(--text-2)" strokeOpacity=".6" />}
            {m.threshold != null && <ReferenceLine y={m.threshold} stroke="var(--sev-critical)" strokeDasharray="5 4" label={{ value: 'threshold', fill: 'var(--sev-critical)', fontSize: 10, position: 'insideTopRight' }} />}
            <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={dotRenderer} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        {!hasBaseline && <div className="an-card__warn">Not enough history for a baseline yet. Train a baseline or send some traffic.</div>}
      </div>
      <div className="an-card__foot">
        <div className="an-card__z">
          <span>z-score</span>
          <b className={`mono ${anomalous ? 'is-bad' : ''}`}>{z == null ? '-' : z.toFixed(2)}</b>
        </div>
        <Gauge z={z} sigma={sigma} />
        <button type="button" className="an-card__bell" onClick={onSelect} aria-pressed={selected}>Bell curve</button>
      </div>
    </article>
  )
}

export default memo(MetricCard)
