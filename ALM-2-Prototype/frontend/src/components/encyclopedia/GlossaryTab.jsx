import { useMemo, useState } from 'react'
import { GLOSSARY } from '../../data/glossary.js'
import { Icon } from '../ui/index.js'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function GlossaryTab() {
  const [q, setQ] = useState('')
  const [letter, setLetter] = useState(null)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return GLOSSARY.filter(g => (!s || g.term.toLowerCase().includes(s) || g.definition.toLowerCase().includes(s))
      && (!letter || g.term[0].toUpperCase() === letter))
  }, [q, letter])

  const available = useMemo(() => new Set(GLOSSARY.map(g => g.term[0].toUpperCase())), [])
  const groups = useMemo(() => {
    const m = new Map()
    filtered.forEach(g => { const l = g.term[0].toUpperCase(); if (!m.has(l)) m.set(l, []); m.get(l).push(g) })
    return [...m.entries()]
  }, [filtered])

  return (
    <section aria-labelledby="gl-h" className="enc-gloss">
      <div className="enc-toolbar">
        <h2 id="gl-h" className="enc-h2">Security glossary <span className="mono enc-dim">{GLOSSARY.length} terms</span></h2>
        <label className="enc-search">
          <Icon name="search" size={15} />
          <span className="enc-sr">Search glossary</span>
          <input type="search" placeholder="Search terms or definitions" value={q} onChange={e => setQ(e.target.value)} />
        </label>
      </div>
      <nav className="enc-alpha" aria-label="Alphabetical index">
        <button type="button" className={!letter ? 'is-on' : ''} aria-pressed={!letter} onClick={() => setLetter(null)}>All</button>
        {LETTERS.map(l => (
          <button key={l} type="button" disabled={!available.has(l)} aria-pressed={letter === l}
            className={letter === l ? 'is-on' : ''} onClick={() => setLetter(letter === l ? null : l)}>{l}</button>
        ))}
      </nav>
      {groups.length === 0 && <p className="enc-empty" role="status">No terms match your search.</p>}
      <div className="enc-glist">
        {groups.map(([l, items]) => (
          <div key={l} className="enc-gsec">
            <h3 className="enc-gletter mono" id={`gl-${l}`}>{l}</h3>
            <dl>
              {items.map(g => (
                <div key={g.term} className="enc-gitem">
                  <dt>{g.term}</dt>
                  <dd>{g.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
