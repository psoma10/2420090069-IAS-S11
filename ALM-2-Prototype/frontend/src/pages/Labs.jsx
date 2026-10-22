import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Panel, Button, Badge, Icon, useToast } from '../components/ui/index.js'
import { errMessage } from '../utils/format.js'
import { LABS } from '../components/labs/labsData.js'
import ApiBanner from '../components/alerts/ApiBanner.jsx'
import '../components/labs/labs.css'

const KEY = 'sentinel.labs.v1'
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* storage unavailable */ }
}

function Ring({ done, total }) {
  const r = 18
  const c = 2 * Math.PI * r
  const f = total ? done / total : 0
  return (
    <svg className="lb-ring" width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`${done} of ${total} steps complete`}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={f === 1 ? 'var(--ok)' : 'var(--accent)'} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform="rotate(-90 24 24)" style={{ transition: 'stroke-dashoffset .5s' }} />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fill="var(--text-0)" fontFamily="var(--font-mono)">{done}/{total}</text>
    </svg>
  )
}

export default function Labs() {
  const toast = useToast()
  const [progress, setProgress] = useState(load)
  const [activeId, setActiveId] = useState(null)
  const [out, setOut] = useState({})
  const [busy, setBusy] = useState('')
  const [hintOpen, setHintOpen] = useState({})
  const [netErr, setNetErr] = useState(null)
  const progRef = useRef(progress)
  progRef.current = progress

  const lab = LABS.find((l) => l.id === activeId)
  const isDone = (labId, stepId, p = progress) => !!p[labId]?.[stepId]
  const doneCount = (l, p = progress) => l.steps.filter((s) => isDone(l.id, s.id, p)).length

  const markDone = useCallback((labId, stepId, value = true) => {
    setProgress((p) => {
      const n = { ...p, [labId]: { ...(p[labId] || {}), [stepId]: value } }
      if (!value) delete n[labId][stepId]
      save(n)
      return n
    })
  }, [])

  // Auto-check the current step of the open lab (in order) every 3s
  useEffect(() => {
    if (!lab) return undefined
    let stop = false
    let running = false
    const tick = async () => {
      if (running || document.hidden) return
      running = true
      try {
        for (const s of lab.steps) {
          if (progRef.current[lab.id]?.[s.id]) continue
          if (s.mode === 'check' && s.check) {
            const ok = await s.check()
            if (stop) return
            setNetErr(null)
            if (ok) { markDone(lab.id, s.id); progRef.current = { ...progRef.current, [lab.id]: { ...(progRef.current[lab.id] || {}), [s.id]: true } }; continue }
          }
          break
        }
      } catch (e) { if (!stop) setNetErr(e) } finally { running = false }
    }
    tick()
    const t = setInterval(tick, 3000)
    return () => { stop = true; clearInterval(t) }
  }, [lab, markDone])

  const run = async (s, a, idx) => {
    const k = `${s.id}:${idx}`
    setBusy(k)
    try {
      const r = await a.run()
      setNetErr(null)
      setOut((o) => ({ ...o, [`${lab.id}:${s.id}`]: { text: r.text, ok: true } }))
      if (s.mode === 'action' && r.done) markDone(lab.id, s.id)
      else if (s.mode === 'check' && s.check) {
        try { if (await s.check()) markDone(lab.id, s.id) } catch { /* next poll retries */ }
      }
    } catch (e) {
      setOut((o) => ({ ...o, [`${lab.id}:${s.id}`]: { text: errMessage(e), ok: false } }))
      toast.error(errMessage(e))
    } finally { setBusy('') }
  }

  const resetLab = (l) => {
    setProgress((p) => { const n = { ...p }; delete n[l.id]; save(n); return n })
    setOut({})
  }

  if (!lab) {
    const total = LABS.reduce((n, l) => n + l.steps.length, 0)
    const done = LABS.reduce((n, l) => n + doneCount(l), 0)
    return (
      <div className="lb">
        <PageHeader
          kicker="Learn"
          title="Guided Labs"
          subtitle="Hands-on exercises. Each step calls the live simulator and checks your progress automatically."
          actions={<Badge tone="accent" dot>{done}/{total} steps complete</Badge>}
        />
        <div className="lb-grid">
          {LABS.map((l, i) => {
            const d = doneCount(l)
            const complete = d === l.steps.length
            return (
              <button key={l.id} type="button" className={`lb-card ${complete ? 'is-complete' : ''}`} onClick={() => setActiveId(l.id)}>
                <div className="lb-card__top">
                  <span className="lb-card__n mono">LAB {String(i + 1).padStart(2, '0')}</span>
                  <Ring done={d} total={l.steps.length} />
                </div>
                <h3>{l.title}</h3>
                <p>{l.blurb}</p>
                <div className="lb-card__meta">
                  <Badge tone={l.level === 'Beginner' ? 'allow' : l.level === 'Intermediate' ? 'medium' : 'high'}>{l.level}</Badge>
                  <span className="mono">{l.minutes} min</span>
                  <span className="lb-card__go">{complete ? 'Review' : d ? 'Continue' : 'Start'} <Icon name="chevron" size={14} /></span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const d = doneCount(lab)
  const complete = d === lab.steps.length
  const currentIdx = lab.steps.findIndex((s) => !isDone(lab.id, s.id))

  return (
    <div className="lb">
      <PageHeader
        kicker={`Guided lab - ${lab.level}`}
        title={lab.title}
        subtitle={lab.blurb}
        actions={
          <>
            <Button size="sm" onClick={() => setActiveId(null)}>All labs</Button>
            <Button size="sm" variant="subtle" onClick={() => resetLab(lab)}>Reset progress</Button>
          </>
        }
      />
      <ApiBanner error={netErr} />

      <div className="lb-layout">
        <aside className="lb-side">
          <Panel title="Objectives">
            <ul className="lb-obj">
              {lab.objectives.map((o) => <li key={o}>{o}</li>)}
            </ul>
            <div className="lb-prog" aria-label={`${d} of ${lab.steps.length} steps complete`}>
              <div><i style={{ width: `${(d / lab.steps.length) * 100}%` }} /></div>
              <span className="mono">{d}/{lab.steps.length}</span>
            </div>
            <div className="lb-links">
              {lab.links.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}
            </div>
          </Panel>
        </aside>

        <ol className="lb-steps">
          {lab.steps.map((s, i) => {
            const done = isDone(lab.id, s.id)
            const current = i === currentIdx
            const o = out[`${lab.id}:${s.id}`]
            return (
              <li key={s.id} className={`lb-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}>
                <div className="lb-step__num" aria-hidden="true">{done ? <Icon name="check" size={16} /> : i + 1}</div>
                <div className="lb-step__body">
                  <h3>
                    {s.title}
                    <span className="sr-only">{done ? ' (complete)' : current ? ' (current step)' : ''}</span>
                    {s.mode === 'check' && !done && <em className="lb-auto mono">auto-checks</em>}
                  </h3>
                  <p>{s.body}</p>
                  {(s.actions || s.link) && (
                    <div className="lb-step__actions">
                      {(s.actions || []).map((a, ai) => (
                        <Button key={a.label} variant={a.variant || 'ghost'} size="sm" loading={busy === `${s.id}:${ai}`} disabled={!!busy && busy !== `${s.id}:${ai}`} onClick={() => run(s, a, ai)}>{a.label}</Button>
                      ))}
                      {s.link && <Link className="lb-link" to={s.link.to}>{s.link.label} &rarr;</Link>}
                    </div>
                  )}
                  {o && <pre className={`lb-out mono ${o.ok ? '' : 'is-err'}`} role="status">{o.text}</pre>}
                  <div className="lb-step__foot">
                    {s.hint && (
                      <button type="button" className="lb-hintbtn" aria-expanded={!!hintOpen[`${lab.id}${s.id}`]} onClick={() => setHintOpen((h) => ({ ...h, [`${lab.id}${s.id}`]: !h[`${lab.id}${s.id}`] }))}>
                        {hintOpen[`${lab.id}${s.id}`] ? 'Hide hint' : 'Show hint'}
                      </button>
                    )}
                    {!done && (s.mode === 'manual' || current) && (s.mode === 'manual' ? (
                      <Button size="sm" variant="subtle" onClick={() => markDone(lab.id, s.id)}>Mark as done</Button>
                    ) : (
                      <button type="button" className="lb-hintbtn" onClick={() => markDone(lab.id, s.id)}>Skip this check</button>
                    ))}
                  </div>
                  {s.hint && hintOpen[`${lab.id}${s.id}`] && <div className="lb-hint">{s.hint}</div>}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {complete && (
        <Panel title="What you learned" tone="accent" className="lb-recap">
          <ul className="lb-recap__list">
            {lab.recap.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <div className="lb-recap__next">
            {LABS[LABS.indexOf(lab) + 1] ? (
              <Button variant="primary" onClick={() => setActiveId(LABS[LABS.indexOf(lab) + 1].id)}>Next lab: {LABS[LABS.indexOf(lab) + 1].title}</Button>
            ) : (
              <Link to="/encyclopedia"><Button variant="primary">Explore the Threat Encyclopedia</Button></Link>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
