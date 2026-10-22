const W = 380
const H = 170
const PAD = 14
const XMIN = -4
const XMAX = 4
const pdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
const sx = (x) => PAD + ((x - XMIN) / (XMAX - XMIN)) * (W - 2 * PAD)
const base = H - 26
const sy = (y) => base - (y / 0.42) * (base - 18)

function area(a, b, step = 0.1) {
  const pts = []
  for (let x = a; x <= b + 1e-9; x += step) pts.push(`${sx(x).toFixed(1)},${sy(pdf(x)).toFixed(1)}`)
  return `M${sx(a).toFixed(1)},${base} L${pts.join(' L')} L${sx(b).toFixed(1)},${base} Z`
}

/** Standard normal curve with 68-95-99.7 bands, the sigma threshold tail, and the latest z marker. */
export default function BellCurve({ z, sigma = 3, label }) {
  const zc = Math.max(XMIN, Math.min(XMAX, Number.isFinite(z) ? z : 0))
  const over = Number.isFinite(z) && z > sigma
  const line = []
  for (let x = XMIN; x <= XMAX + 1e-9; x += 0.1) line.push(`${sx(x).toFixed(1)},${sy(pdf(x)).toFixed(1)}`)
  const mx = sx(zc)
  const my = sy(pdf(zc))
  return (
    <svg className="an-bell" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Normal distribution. Latest value is at z equals ${Number.isFinite(z) ? z.toFixed(2) : 'unknown'} against a threshold of ${sigma} sigma.`}>
      <path d={area(-3, 3)} fill="var(--accent)" opacity=".10" />
      <path d={area(-2, 2)} fill="var(--accent)" opacity=".14" />
      <path d={area(-1, 1)} fill="var(--accent)" opacity=".20" />
      {sigma < XMAX && <path d={area(sigma, XMAX)} fill="var(--sev-critical)" opacity=".45" />}
      <polyline points={line.join(' ')} fill="none" stroke="var(--text-1)" strokeWidth="1.6" />
      <line x1={PAD} x2={W - PAD} y1={base} y2={base} stroke="var(--line-strong)" />
      {[-3, -2, -1, 0, 1, 2, 3].map((t) => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={base} y2={base + 4} stroke="var(--line-strong)" />
          <text x={sx(t)} y={base + 16} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="var(--font-mono)">{t === 0 ? 'mean' : `${t > 0 ? '+' : ''}${t}σ`}</text>
        </g>
      ))}
      {sigma <= XMAX && (
        <g>
          <line x1={sx(sigma)} x2={sx(sigma)} y1={14} y2={base} stroke="var(--sev-critical)" strokeDasharray="4 3" />
          <text x={sx(sigma) - 4} y={12} textAnchor="end" fontSize="10" fill="var(--sev-critical)" fontFamily="var(--font-mono)">threshold {sigma}σ</text>
        </g>
      )}
      {Number.isFinite(z) && (
        <g className="an-bell__marker">
          <line x1={mx} x2={mx} y1={my} y2={base} stroke={over ? 'var(--sev-critical)' : 'var(--accent)'} strokeWidth="2" />
          <circle cx={mx} cy={my} r="6" fill={over ? 'var(--sev-critical)' : 'var(--accent)'} stroke="var(--bg-0)" strokeWidth="2" />
          <text x={Math.min(Math.max(mx, 40), W - 40)} y={Math.max(my - 12, 24)} textAnchor="middle" fontSize="11" fontWeight="700" fill={over ? 'var(--sev-critical)' : 'var(--accent)'} fontFamily="var(--font-mono)">
            {label ? `${label} ` : ''}z={z.toFixed(2)}{z > XMAX ? ' (off chart)' : ''}
          </text>
        </g>
      )}
    </svg>
  )
}
