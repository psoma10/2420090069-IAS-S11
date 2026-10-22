import { FIREWALL_TYPES, BASTION_NOTES } from '../../data/firewallTypes.js'
import { GlyphIcon } from './parts.jsx'
import { Link } from 'react-router-dom'

// Qualitative 1-5 ratings used for the comparison matrix.
const RATINGS = {
  'packet-filter': { speed: 5, depth: 1, state: 1, hide: 1 },
  stateful: { speed: 4, depth: 2, state: 4, hide: 2 },
  'app-proxy': { speed: 2, depth: 5, state: 4, hide: 5 },
  'circuit-gateway': { speed: 3, depth: 2, state: 3, hide: 4 },
  ngfw: { speed: 3, depth: 5, state: 5, hide: 3 }
}
const ROWS = [['speed', 'Speed'], ['depth', 'Inspection depth'], ['state', 'Connection awareness'], ['hide', 'Hides internal hosts']]

function Dots({ n, label }) {
  return (
    <span className="enc-dots" role="img" aria-label={`${label}: ${n} of 5`}>
      {[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  )
}

export default function FirewallTab() {
  return (
    <section aria-labelledby="fw-h">
      <h2 id="fw-h" className="enc-h2">Firewall types compared</h2>
      <p className="enc-lede">A firewall is a choke point that enforces a security policy between networks. The five classic designs trade speed for inspection depth. Sentinel&apos;s <Link to="/firewall">Rule Manager</Link> implements the packet-filtering model, with an optional bastion policy.</p>
      <ul className="enc-fwgrid">
        {FIREWALL_TYPES.map(f => (
          <li key={f.id} className="enc-fw">
            <div className="enc-fw__head">
              <span className="enc-fw__icon"><GlyphIcon name={f.icon} size={20} /></span>
              <div>
                <h3>{f.name}</h3>
                <div className="enc-fw__layer mono">{f.layer}</div>
              </div>
            </div>
            <p>{f.summary}</p>
            <p className="enc-fw__how">{f.how}</p>
            <div className="enc-proscons">
              <div className="enc-pros"><h4>Advantages</h4><ul>{f.pros.map(p => <li key={p}>{p}</li>)}</ul></div>
              <div className="enc-cons"><h4>Limitations</h4><ul>{f.cons.map(p => <li key={p}>{p}</li>)}</ul></div>
            </div>
            <dl className="enc-fw__meta">
              <div><dt>Weak against</dt><dd>{f.attacks}</dd></div>
              <div><dt>Typical use</dt><dd>{f.use}</dd></div>
            </dl>
          </li>
        ))}
      </ul>

      <h3 className="enc-h3">At a glance</h3>
      <div className="enc-tablewrap" tabIndex={0} role="region" aria-label="Firewall rating matrix">
        <table className="enc-table">
          <thead><tr><th scope="col">Type</th>{ROWS.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
          <tbody>
            {FIREWALL_TYPES.map(f => (
              <tr key={f.id}>
                <th scope="row">{f.name}</th>
                {ROWS.map(([k, l]) => <td key={k}><Dots n={RATINGS[f.id][k]} label={l} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="enc-bastion">
        <h3 className="enc-h3">Bastion host and DMZ</h3>
        <p>A bastion host is a system identified by the firewall administrator as a critical strong point in the network&apos;s security. It is typically where application-level or circuit-level gateways run, and sits in a DMZ or at the single point of entry.</p>
        <ul>{BASTION_NOTES.map(n => <li key={n}>{n}</li>)}</ul>
        <Link to="/hosts" className="enc-linkbtn">Open Hosts and Bastion</Link>
      </div>
    </section>
  )
}
