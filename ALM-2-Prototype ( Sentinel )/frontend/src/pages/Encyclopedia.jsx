import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Icon, EmptyState } from '../components/ui/index.js'
import HeroViz from '../components/encyclopedia/HeroViz.jsx'
import ThreatCard from '../components/encyclopedia/ThreatCard.jsx'
import CompareTable from '../components/encyclopedia/CompareTable.jsx'
import GlossaryTab from '../components/encyclopedia/GlossaryTab.jsx'
import FirewallTab from '../components/encyclopedia/FirewallTab.jsx'
import QuizTab from '../components/encyclopedia/QuizTab.jsx'
import { THREATS, CATEGORIES, VIRUS_VS_WORM } from '../data/threats.js'
import { GLOSSARY } from '../data/glossary.js'
import { QUIZ } from '../data/quiz.js'
import '../components/encyclopedia/encyclopedia.css'

const TAB_KEYS = ['atlas', 'glossary', 'firewalls', 'quiz']

export default function Encyclopedia() {
  const [params, setParams] = useSearchParams()
  const tab = TAB_KEYS.includes(params.get('tab')) ? params.get('tab') : 'atlas'
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')

  const setTab = (k) => setParams(k === 'atlas' ? {} : { tab: k }, { replace: true })

  const counts = useMemo(() => {
    const c = { all: THREATS.length }
    THREATS.forEach(t => { c[t.category] = (c[t.category] || 0) + 1 })
    return c
  }, [])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return THREATS.filter(t => (cat === 'all' || t.category === cat) && (!s ||
      `${t.title} ${t.summary} ${t.examples.map(e => e.name).join(' ')} ${t.traits.join(' ')}`.toLowerCase().includes(s)))
  }, [cat, q])

  return (
    <div className="enc">
      <header className="enc-hero">
        <div className="enc-hero__text">
          <div className="ui-kicker">Threat encyclopedia</div>
          <h1>The Threat Atlas</h1>
          <p>A textbook-style map of viruses, worms, other malware, intruders and the defences that stop them. Every entry links to the Sentinel feature that detects or contains it.</p>
          <ul className="enc-hero__stats mono">
            <li><b>{THREATS.length}</b> articles</li>
            <li><b>{GLOSSARY.length}</b> terms</li>
            <li><b>{QUIZ.length}</b> quiz questions</li>
          </ul>
        </div>
        <HeroViz />
      </header>

      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'atlas', label: 'Atlas', count: THREATS.length },
        { key: 'glossary', label: 'Glossary', count: GLOSSARY.length },
        { key: 'firewalls', label: 'Firewall types', count: 5 },
        { key: 'quiz', label: 'Self-test quiz', count: QUIZ.length }
      ]} />

      <div className="enc-body">
        {tab === 'atlas' && (
          <>
            <div className="enc-toolbar">
              <div className="enc-chips" role="group" aria-label="Filter by category">
                <button type="button" className={`enc-chip ${cat === 'all' ? 'is-on' : ''}`} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
                  All <span className="mono">{counts.all}</span>
                </button>
                {CATEGORIES.map(c => (
                  <button key={c.id} type="button" data-cat={c.id} title={c.blurb}
                    className={`enc-chip ${cat === c.id ? 'is-on' : ''}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                    <i className="enc-chip__dot" aria-hidden="true" />{c.label} <span className="mono">{counts[c.id] || 0}</span>
                  </button>
                ))}
              </div>
              <label className="enc-search">
                <Icon name="search" size={15} />
                <span className="enc-sr">Search threats</span>
                <input type="search" placeholder="Search threats, examples, traits" value={q} onChange={e => setQ(e.target.value)} />
              </label>
            </div>
            <p className="enc-count mono" role="status">{list.length} of {THREATS.length} articles</p>
            {list.length === 0
              ? <EmptyState icon="search" title="No matching articles" hint="Try a different keyword or clear the category filter." />
              : <ul className="enc-grid">{list.map(t => <ThreatCard key={t.slug} threat={t} />)}</ul>}

            <section className="enc-compare" aria-labelledby="vw-h">
              <h2 id="vw-h" className="enc-h2">Virus vs worm</h2>
              <p className="enc-lede">The two classic self-propagating threats differ in what they need in order to spread, and therefore in how fast they move and how you stop them.</p>
              <CompareTable head={VIRUS_VS_WORM.head} rows={VIRUS_VS_WORM.rows} caption="Comparison of viruses and worms" />
            </section>
          </>
        )}
        {tab === 'glossary' && <GlossaryTab />}
        {tab === 'firewalls' && <FirewallTab />}
        {tab === 'quiz' && <QuizTab />}
      </div>
    </div>
  )
}
