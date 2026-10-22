import { Link } from 'react-router-dom'
import { VectorIcons, Meter, categoryLabel } from './parts.jsx'
import { readMinutes } from '../../data/threats.js'

export default function ThreatCard({ threat }) {
  return (
    <li className="enc-card" data-cat={threat.category}>
      <Link to={`/encyclopedia/${threat.slug}`} className="enc-card__link">
        <div className="enc-card__top">
          <span className="enc-chip-cat">{categoryLabel(threat.category)}</span>
          <span className="enc-card__time mono">{readMinutes(threat)} min</span>
        </div>
        <h3 className="enc-card__title">{threat.title}</h3>
        <p className="enc-card__sum">{threat.summary}</p>
        <div className="enc-card__foot">
          {threat.category === 'defenses'
            ? <span className="enc-defense mono">Countermeasure</span>
            : <Meter level={threat.level} />}
          <VectorIcons vectors={threat.vectors} size={15} />
        </div>
      </Link>
    </li>
  )
}
