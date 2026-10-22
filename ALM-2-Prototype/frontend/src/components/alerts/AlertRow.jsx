import { Badge, SeverityBadge, Button, Icon } from '../ui/index.js'
import { Link } from 'react-router-dom'
import { formatTime, relativeTime, formatNumber } from '../../utils/format.js'
import IpLink from '../investigate/IpLink.jsx'
import { ruleInfo, ruleArticle } from './alertInfo.js'

const SRC_TONE = { rule: 'violet', anomaly: 'accent', firewall: 'neutral' }

export default function AlertRow({ a, open, onToggle, onAck, isNew, onBlock }) {
  const info = ruleInfo(a.rule_id)
  const article = ruleArticle(a.rule_id)
  return (
    <li className={`ap-alert sev-${a.severity} ${a.acknowledged ? 'is-acked' : ''} ${isNew ? 'is-new' : ''} ${open ? 'is-open' : ''}`}>
      <div className="ap-alert__main">
        <button type="button" className="ap-alert__head" onClick={onToggle} aria-expanded={open} aria-controls={`ap-d-${a.id}`}>
          <Icon name="chevron" size={14} className="ap-alert__chev" />
          <SeverityBadge severity={a.severity} />
          <span className="ap-alert__id mono">{a.rule_id}</span>
          <span className="ap-alert__title">{a.title}</span>
          <span className="ap-alert__flow mono">{a.src_ip}{a.dst_ip ? ` > ${a.dst_ip}` : ''}</span>
          <span className="ap-alert__time mono" title={a.ts}>{formatTime(a.ts)} <em>{relativeTime(a.ts)}</em></span>
        </button>
        {a.acknowledged ? (
          <Badge tone="neutral">acked</Badge>
        ) : (
          <Button size="sm" variant="subtle" onClick={() => onAck(a)} aria-label={`Acknowledge alert ${a.id}`}>Ack</Button>
        )}
      </div>
      {open && (
        <div className="ap-detail" id={`ap-d-${a.id}`}>
          <p className="ap-detail__desc">{a.description}</p>
          <dl className="ap-kv">
            <div><dt>Rule</dt><dd className="mono">{a.rule_id}</dd></div>
            <div><dt>Source</dt><dd><Badge tone={SRC_TONE[a.source] || 'neutral'}>{a.source}</Badge></dd></div>
            <div><dt>Source IP</dt><dd><IpLink ip={a.src_ip} /></dd></div>
            <div><dt>Destination</dt><dd><IpLink ip={a.dst_ip} /></dd></div>
            {a.metric && <div><dt>Metric</dt><dd className="mono">{a.metric}</dd></div>}
            {a.value != null && <div><dt>Observed</dt><dd className="mono">{formatNumber(Math.round(a.value * 100) / 100)}</dd></div>}
            {a.threshold != null && <div><dt>Threshold</dt><dd className="mono">{formatNumber(Math.round(a.threshold * 100) / 100)}</dd></div>}
            <div><dt>Time</dt><dd className="mono">{new Date(a.ts).toLocaleString([], { hour12: false })}</dd></div>
          </dl>
          {a.value != null && a.threshold != null && a.threshold > 0 && (
            <div className="ap-gauge" aria-label={`Observed ${a.value} versus threshold ${a.threshold}`}>
              <div className="ap-gauge__bar"><i style={{ width: `${Math.min(100, (a.value / (a.threshold * 2)) * 100)}%` }} /><b style={{ left: '50%' }} /></div>
              <span className="mono">{(a.value / a.threshold).toFixed(1)}x threshold</span>
            </div>
          )}
          <div className="ap-detail__cols">
            <div><h4>What this means</h4><p>{info.meaning}</p></div>
            <div><h4>Recommended response</h4><p>{info.response}</p></div>
          </div>
          <div className="ap-detail__actions">
            {a.src_ip && <Link to={`/investigate/${encodeURIComponent(a.src_ip)}`}><Button size="sm" icon="search">Investigate source</Button></Link>}
            {a.src_ip && onBlock && <Button size="sm" variant="danger" onClick={() => onBlock(a.src_ip)}>Block source IP ({a.src_ip})</Button>}
            {article && <Link className="ap-link" to={`/encyclopedia/${article}`}>Learn about this threat</Link>}
            <Link className="ap-link" to="/ids-rules">View detection rules</Link>
            {a.source === 'anomaly' && <Link className="ap-link" to="/anomaly">Open anomaly detector</Link>}
          </div>
        </div>
      )}
    </li>
  )
}
