import { useEffect, useMemo, useState } from 'react'

// Small network graph. Virus mode: infection hops one host per "user action".
// Worm mode: every infected host infects all neighbours each tick.
const NODES = [
  [60, 110], [140, 50], [140, 170], [230, 110], [300, 40], [300, 180],
  [380, 110], [460, 55], [460, 165], [540, 110], [620, 50], [620, 170], [700, 110], [790, 110]
]
const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6], [6, 7], [6, 8],
  [7, 9], [8, 9], [9, 10], [9, 11], [10, 12], [11, 12], [12, 13]
]

function neighbours(i) {
  const out = []
  EDGES.forEach(([a, b]) => { if (a === i) out.push(b); if (b === i) out.push(a) })
  return out
}

function step(mode, infected) {
  const next = new Set(infected)
  if (mode === 'worm') {
    infected.forEach(i => neighbours(i).forEach(n => next.add(n)))
  } else {
    // virus: a single new file/host per step, picked in a stable order
    for (const i of [...infected]) {
      const n = neighbours(i).find(x => !next.has(x))
      if (n !== undefined) { next.add(n); break }
    }
  }
  return next
}

export default function HeroViz() {
  const [mode, setMode] = useState('worm')
  const [infected, setInfected] = useState(() => new Set([0]))
  const [paused, setPaused] = useState(false)
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  useEffect(() => { setInfected(new Set([0])) }, [mode])

  useEffect(() => {
    if (paused || reduced) return undefined
    const delay = mode === 'worm' ? 850 : 650
    const t = setInterval(() => {
      setInfected(prev => (prev.size >= NODES.length ? new Set([0]) : step(mode, prev)))
    }, delay)
    return () => clearInterval(t)
  }, [mode, paused, reduced])

  const total = NODES.length
  const pct = Math.round((infected.size / total) * 100)

  return (
    <figure className="enc-viz">
      <div className="enc-viz__bar">
        <div className="enc-viz__modes" role="group" aria-label="Propagation model">
          <button type="button" aria-pressed={mode === 'virus'} className={mode === 'virus' ? 'is-on' : ''} onClick={() => setMode('virus')}>Virus</button>
          <button type="button" aria-pressed={mode === 'worm'} className={mode === 'worm' ? 'is-on' : ''} onClick={() => setMode('worm')}>Worm</button>
        </div>
        <div className="enc-viz__stat mono" aria-live="off">
          infected <b>{infected.size}</b>/{total} <span>({pct}%)</span>
        </div>
        <button type="button" className="enc-viz__ctl" onClick={() => setPaused(p => !p)} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="enc-viz__ctl" onClick={() => setInfected(prev => step(mode, prev))}>Step</button>
        <button type="button" className="enc-viz__ctl" onClick={() => setInfected(new Set([0]))}>Reset</button>
      </div>
      <svg viewBox="0 0 850 220" className="enc-viz__svg" role="img"
        aria-label={mode === 'worm'
          ? 'Animation: a worm spreads from host to all neighbouring hosts every step, growing exponentially.'
          : 'Animation: a virus infects one new host at a time, each requiring a user to run an infected file.'}>
        <defs>
          <radialGradient id="enc-glow-bad">
            <stop offset="0%" stopColor="var(--sev-high)" stopOpacity=".5" />
            <stop offset="100%" stopColor="var(--sev-high)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {EDGES.map(([a, b], k) => {
          const hot = infected.has(a) && infected.has(b)
          return (
            <line key={k} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]}
              className={`enc-viz__edge ${hot ? 'is-hot' : ''}`} />
          )
        })}
        {NODES.map(([x, y], i) => {
          const bad = infected.has(i)
          return (
            <g key={i} transform={`translate(${x} ${y})`} className={`enc-viz__node ${bad ? 'is-bad' : ''}`}>
              {bad && <circle r="30" fill="url(#enc-glow-bad)" className="enc-viz__pulse" />}
              <rect x="-13" y="-10" width="26" height="18" rx="3" className="enc-viz__screen" />
              <path d="M-8 14h16" className="enc-viz__stand" />
              {bad && <path d="M-4 -5l8 8M4 -5l-8 8" className="enc-viz__x" />}
            </g>
          )
        })}
      </svg>
      <figcaption className="enc-viz__cap">
        {mode === 'worm'
          ? 'Worm: every infected host scans and attacks its neighbours automatically. Growth is exponential until vulnerable hosts run out.'
          : 'Virus: each new infection needs a host file to be run, so spread is slow and follows human sharing.'}
      </figcaption>
    </figure>
  )
}
