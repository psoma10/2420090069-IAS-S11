import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon, EmptyState, Badge } from '../components/ui/index.js'
import { Meter, VectorIcons, GlyphIcon, categoryLabel } from '../components/encyclopedia/parts.jsx'
import CompareTable from '../components/encyclopedia/CompareTable.jsx'
import { getThreat, neighbours, readMinutes, THREAT_BY_SLUG, IDS_RULES } from '../data/threats.js'
import '../components/encyclopedia/encyclopedia.css'

function Stepper({ title, steps }) {
  return (
    <ol className="enc-stepper" aria-label={title || 'Lifecycle'}>
      {steps.map((s, i) => (
        <li key={s.name} className="enc-step" style={{ '--i': i }}>
          <span className="enc-step__n mono" aria-hidden="true">{i + 1}</span>
          <div className="enc-step__body">
            <h3>{s.name}</h3>
            <p>{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function ThreatArticle() {
  const { slug } = useParams()
  const t = getThreat(slug)
  const [active, setActive] = useState('overview')

  const sections = useMemo(() => {
    if (!t) return []
    const isDef = t.category === 'defenses'
    const s = [{ id: 'overview', label: 'Overview' }]
    if (t.traits?.length) s.push({ id: 'traits', label: 'Key traits' })
    if (t.lifecycle?.length) s.push({ id: 'lifecycle', label: t.lifecycleTitle || 'Lifecycle' })
    if (!isDef && t.spread?.length) s.push({ id: 'spread', label: 'How it spreads' })
    if (t.examples?.length) s.push({ id: 'examples', label: isDef ? 'Examples and tools' : 'Famous examples' })
    if (t.table) s.push({ id: 'map', label: 'Detection map' })
    if (t.detection?.length) s.push({ id: 'detection', label: isDef ? 'Detection methods' : 'Detection signals' })
    if (t.countermeasures?.length) s.push({ id: 'countermeasures', label: 'Countermeasures' })
    if (t.sentinel) s.push({ id: 'sentinel', label: 'Detect it in Sentinel' })
    s.push({ id: 'related', label: 'Related articles' })
    return s
  }, [t])

  useEffect(() => {
    window.scrollTo?.(0, 0)
    document.title = t ? `${t.title} | Sentinel` : 'Not found | Sentinel'
    return () => { document.title = 'Sentinel' }
  }, [t])

  useEffect(() => {
    if (!t || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (vis[0]) setActive(vis[0].target.id)
    }, { rootMargin: '-10% 0px -70% 0px' })
    sections.forEach(s => { const el = document.getElementById(`sec-${s.id}`); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [t, sections])

  if (!t) {
    return (
      <div className="enc enc-article">
        <EmptyState icon="search" title="Article not found"
          hint={`There is no encyclopedia entry called "${slug}".`}
          action={<Link to="/encyclopedia" className="enc-linkbtn">Back to the Threat Atlas</Link>} />
      </div>
    )
  }

  const { prev, next } = neighbours(t.slug)
  const related = (t.related || []).map(s => THREAT_BY_SLUG[s]).filter(Boolean)
  const isDef = t.category === 'defenses'
  const jump = (id) => (e) => {
    e.preventDefault()
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <div className="enc enc-article" data-cat={t.category}>
      <nav className="enc-crumbs" aria-label="Breadcrumb">
        <Link to="/encyclopedia">Threat Atlas</Link>
        <Icon name="chevron" size={12} />
        <span>{categoryLabel(t.category)}</span>
      </nav>

      <header className="enc-arthead">
        <div className="enc-arthead__meta">
          <span className="enc-chip-cat">{categoryLabel(t.category)}</span>
          <span className="mono enc-dim">{readMinutes(t)} min read</span>
          <button type="button" className="enc-print" onClick={() => window.print()}><GlyphIcon name="print" size={14} /> Print</button>
        </div>
        <h1>{t.title}</h1>
        <p className="enc-arthead__sum">{t.summary}</p>
        <div className="enc-arthead__row">
          {!isDef && <Meter level={t.level} />}
          <VectorIcons vectors={t.vectors} size={16} />
        </div>
      </header>

      <div className="enc-layout">
        <aside className="enc-toc" aria-label="Table of contents">
          <div className="enc-toc__t mono">On this page</div>
          <ol>
            {sections.map(s => (
              <li key={s.id}>
                <a href={`#sec-${s.id}`} onClick={jump(s.id)} className={active === s.id ? 'is-on' : ''} aria-current={active === s.id ? 'location' : undefined}>{s.label}</a>
              </li>
            ))}
          </ol>
        </aside>

        <article className="enc-prose">
          <section id="sec-overview" aria-labelledby="h-overview">
            <h2 id="h-overview">Overview</h2>
            {t.overview.map((p, i) => <p key={i}>{p}</p>)}
          </section>

          {t.traits?.length > 0 && (
            <section id="sec-traits" aria-labelledby="h-traits">
              <h2 id="h-traits">Key traits</h2>
              <ul className="enc-traits">{t.traits.map(x => <li key={x}>{x}</li>)}</ul>
            </section>
          )}

          {t.lifecycle?.length > 0 && (
            <section id="sec-lifecycle" aria-labelledby="h-lifecycle">
              <h2 id="h-lifecycle">{t.lifecycleTitle || 'Lifecycle'}</h2>
              <Stepper title={t.lifecycleTitle} steps={t.lifecycle} />
            </section>
          )}

          {!isDef && t.spread?.length > 0 && (
            <section id="sec-spread" aria-labelledby="h-spread">
              <h2 id="h-spread">How it spreads</h2>
              <ul className="enc-list">{t.spread.map(x => <li key={x}>{x}</li>)}</ul>
            </section>
          )}

          {t.examples?.length > 0 && (
            <section id="sec-examples" aria-labelledby="h-examples">
              <h2 id="h-examples">{isDef ? 'Examples and tools' : 'Famous examples'}</h2>
              <ul className="enc-examples">
                {t.examples.map(e => (
                  <li key={e.name}>
                    <div className="enc-ex__head"><strong>{e.name}</strong><span className="mono enc-dim">{e.year}</span></div>
                    <p>{e.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {t.table && (
            <section id="sec-map" aria-labelledby="h-map">
              <h2 id="h-map">{t.table.caption}</h2>
              <CompareTable head={t.table.head} rows={t.table.rows} caption={t.table.caption} />
            </section>
          )}

          {t.detection?.length > 0 && (
            <section id="sec-detection" aria-labelledby="h-detection">
              <h2 id="h-detection">{isDef ? 'Detection methods' : 'Detection signals'}</h2>
              <ul className="enc-list">{t.detection.map(x => <li key={x}>{x}</li>)}</ul>
            </section>
          )}

          {t.countermeasures?.length > 0 && (
            <section id="sec-countermeasures" aria-labelledby="h-cm" className="enc-callout enc-callout--def">
              <h2 id="h-cm"><Icon name="shield" size={18} /> Countermeasures</h2>
              <ul className="enc-list">{t.countermeasures.map(x => <li key={x}>{x}</li>)}</ul>
            </section>
          )}

          {t.sentinel && (
            <section id="sec-sentinel" aria-labelledby="h-sn" className="enc-callout enc-callout--sn">
              <h2 id="h-sn"><Icon name="radar" size={18} /> Detect it in Sentinel</h2>
              <p>{t.sentinel.text}</p>
              {t.sentinel.rules?.length > 0 && (
                <ul className="enc-rules" aria-label="Relevant IDS rules">
                  {t.sentinel.rules.map(r => (
                    <li key={r}><Link to="/ids-rules"><Badge tone="accent">{r}</Badge><span>{IDS_RULES[r]}</span></Link></li>
                  ))}
                </ul>
              )}
              <div className="enc-sn-links">
                {t.sentinel.links?.map(l => (
                  <Link key={l.to + l.label} to={l.to} className="enc-linkbtn">{l.label} <GlyphIcon name="arrowRight" size={14} /></Link>
                ))}
              </div>
            </section>
          )}

          <section id="sec-related" aria-labelledby="h-rel" className="enc-related">
            <h2 id="h-rel">Related articles</h2>
            <ul>
              {related.map(r => (
                <li key={r.slug}>
                  <Link to={`/encyclopedia/${r.slug}`}>
                    <span className="enc-chip-cat">{categoryLabel(r.category)}</span>
                    <strong>{r.title}</strong>
                    <span className="enc-dim">{r.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <nav className="enc-pn" aria-label="Previous and next article">
            {prev ? <Link to={`/encyclopedia/${prev.slug}`} className="enc-pn__prev"><GlyphIcon name="arrowLeft" size={16} /><span><small>Previous</small>{prev.title}</span></Link> : <span />}
            {next ? <Link to={`/encyclopedia/${next.slug}`} className="enc-pn__next"><span><small>Next</small>{next.title}</span><GlyphIcon name="arrowRight" size={16} /></Link> : <span />}
          </nav>
        </article>
      </div>
    </div>
  )
}
