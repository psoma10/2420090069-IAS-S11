import { VECTORS, LEVEL_LABELS, CATEGORIES } from '../../data/threats.js'

const V = {
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>,
  boot: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 4v3" /></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  network: <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v5M12 12l-6 5M12 12l6 5" /></>,
  web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  removable: <><rect x="8" y="3" width="8" height="6" rx="1" /><path d="M9 9h6v12H9z" /><path d="M11 5.5h.01M13 5.5h.01" /></>,
  social: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" /><path d="M17 5l1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L14 7.3l2-.3z" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
  proxy: <><rect x="2" y="8" width="5" height="8" rx="1" /><rect x="17" y="8" width="5" height="8" rx="1" /><circle cx="12" cy="12" r="3" /><path d="M7 12h2M15 12h2" /></>,
  circuit: <><circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 12h10" /><rect x="10" y="9" width="4" height="6" rx="1" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  print: <><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" /><rect x="7" y="14" width="10" height="7" /></>,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />
}

export function GlyphIcon({ name, size = 16, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined}
      aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {V[name] || V.file}
    </svg>
  )
}

export function VectorIcons({ vectors = [], size = 16 }) {
  return (
    <ul className="enc-vectors" aria-label="Propagation vectors">
      {vectors.map(v => (
        <li key={v} className="enc-vector" title={VECTORS[v]}>
          <GlyphIcon name={v} size={size} title={VECTORS[v]} />
        </li>
      ))}
    </ul>
  )
}

export function Meter({ level = 1, showLabel = true }) {
  return (
    <div className="enc-meter" data-level={level} role="img" aria-label={`Threat level ${LEVEL_LABELS[level]}, ${level} of 5`}>
      <span className="enc-meter__bars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= level ? 'on' : ''} />)}
      </span>
      {showLabel && <span className="enc-meter__label mono">{LEVEL_LABELS[level]}</span>}
    </div>
  )
}

export function categoryLabel(id) { return CATEGORIES.find(c => c.id === id)?.label || id }
