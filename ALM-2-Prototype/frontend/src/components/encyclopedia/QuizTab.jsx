import { useState } from 'react'
import { QUIZ } from '../../data/quiz.js'
import { Button, Icon } from '../ui/index.js'

const KEY = 'sentinel.quiz.best'
function readBest() { try { const v = localStorage.getItem(KEY); return v == null ? null : Number(v) } catch { return null } }
function writeBest(n) { try { localStorage.setItem(KEY, String(n)) } catch { /* storage unavailable */ } }

export default function QuizTab() {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState(null)
  const [answers, setAnswers] = useState([])
  const [done, setDone] = useState(false)
  const [best, setBest] = useState(readBest)

  const total = QUIZ.length
  const q = QUIZ[i]
  const score = answers.filter((a, k) => a === QUIZ[k].answer).length

  function choose(n) { if (picked == null) setPicked(n) }
  function next() {
    const nextAnswers = [...answers, picked]
    setAnswers(nextAnswers)
    if (i + 1 >= total) {
      const s = nextAnswers.filter((a, k) => a === QUIZ[k].answer).length
      if (best == null || s > best) { writeBest(s); setBest(s) }
      setDone(true)
    } else { setI(i + 1); setPicked(null) }
  }
  function restart() { setI(0); setPicked(null); setAnswers([]); setDone(false) }

  if (done) {
    const pct = Math.round((score / total) * 100)
    return (
      <section aria-labelledby="qz-h" className="enc-quiz">
        <h2 id="qz-h" className="enc-h2">Results</h2>
        <div className="enc-score" role="status">
          <div className="enc-score__ring" style={{ '--p': pct }}><b className="mono">{score}/{total}</b></div>
          <div>
            <p className="enc-score__msg">{pct >= 85 ? 'Excellent. You are exam-ready on this module.' : pct >= 60 ? 'Good work. Review the explanations below for the ones you missed.' : 'Keep going. Read the articles and try again.'}</p>
            <p className="enc-dim mono">Best score: {best ?? score}/{total}</p>
            <Button variant="primary" icon="refresh" onClick={restart}>Retake quiz</Button>
          </div>
        </div>
        <ol className="enc-review">
          {QUIZ.map((qq, k) => {
            const ok = answers[k] === qq.answer
            return (
              <li key={k} className={ok ? 'is-ok' : 'is-bad'}>
                <div className="enc-review__q"><Icon name={ok ? 'check' : 'x'} size={14} /> {qq.q}</div>
                {!ok && <div className="enc-review__a">Your answer: {qq.options[answers[k]]}</div>}
                <div className="enc-review__a">Correct: {qq.options[qq.answer]}</div>
                <div className="enc-review__why">{qq.why}</div>
              </li>
            )
          })}
        </ol>
      </section>
    )
  }

  const answered = picked != null
  return (
    <section aria-labelledby="qz-h" className="enc-quiz">
      <div className="enc-toolbar">
        <h2 id="qz-h" className="enc-h2">Self-test quiz</h2>
        <span className="mono enc-dim">{best != null ? `Best: ${best}/${total}` : 'No score yet'}</span>
      </div>
      <div className="enc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={i + (answered ? 1 : 0)} aria-label="Quiz progress">
        <i style={{ width: `${((i + (answered ? 1 : 0)) / total) * 100}%` }} />
      </div>
      <div className="enc-qcard">
        <div className="mono enc-dim">Question {i + 1} of {total}</div>
        <h3 className="enc-qtext">{q.q}</h3>
        <div role="radiogroup" aria-label={q.q} className="enc-opts">
          {q.options.map((o, n) => {
            const state = !answered ? '' : n === q.answer ? 'is-right' : n === picked ? 'is-wrong' : 'is-dim'
            return (
              <button key={n} type="button" role="radio" aria-checked={picked === n} className={`enc-opt ${state}`}
                onClick={() => choose(n)} disabled={answered && n !== picked && n !== q.answer}>
                <span className="enc-opt__k mono">{String.fromCharCode(65 + n)}</span>
                <span>{o}</span>
                {answered && n === q.answer && <Icon name="check" size={16} />}
                {answered && n === picked && n !== q.answer && <Icon name="x" size={16} />}
              </button>
            )
          })}
        </div>
        {answered && (
          <div className={`enc-why ${picked === q.answer ? 'is-ok' : 'is-bad'}`} role="status">
            <strong>{picked === q.answer ? 'Correct.' : 'Not quite.'}</strong> {q.why}
          </div>
        )}
        <div className="enc-qfoot">
          <span className="mono enc-dim">Score so far: {score}</span>
          <Button variant="primary" disabled={!answered} onClick={next}>{i + 1 >= total ? 'Finish' : 'Next question'}</Button>
        </div>
      </div>
    </section>
  )
}
