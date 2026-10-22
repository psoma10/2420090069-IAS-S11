import { useEffect, useState } from 'react'
import { Badge, SeverityBadge, Button, Toggle } from '../ui/index.js'
import { ruleInfo, RULE_EXAMPLES } from './alertInfo.js'

export default function RuleCard({ rule, onSave, onTry, trying }) {
  const info = ruleInfo(rule.id)
  const ex = RULE_EXAMPLES[rule.id]
  const [win, setWin] = useState(rule.window_seconds ?? '')
  const [thr, setThr] = useState(rule.threshold ?? '')
  const [sev, setSev] = useState(rule.severity)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setWin(rule.window_seconds ?? ''); setThr(rule.threshold ?? ''); setSev(rule.severity) }, [rule.window_seconds, rule.threshold, rule.severity])

  const dirty = String(win) !== String(rule.window_seconds ?? '') || String(thr) !== String(rule.threshold ?? '') || sev !== rule.severity
  const winBad = win !== '' && (Number(win) < 1 || !Number.isFinite(Number(win)))
  const thrBad = rule.threshold != null && (thr === '' || Number(thr) < 1)

  const save = async () => {
    setSaving(true)
    const body = { enabled: rule.enabled, severity: sev }
    if (win !== '') body.window_seconds = Number(win)
    if (rule.threshold != null && thr !== '') body.threshold = Number(thr)
    try { await onSave(rule, body, 'Rule updated') } finally { setSaving(false) }
  }

  return (
    <article className={`ir-card sev-${rule.severity} ${rule.enabled ? '' : 'is-off'}`}>
      <header className="ir-card__head">
        <div className="ir-card__id mono">{rule.id}</div>
        <h3>{rule.name}</h3>
        <div className="ir-card__badges">
          <SeverityBadge severity={rule.severity} />
          {rule.category && <Badge tone="violet">{rule.category}</Badge>}
        </div>
        <Toggle checked={rule.enabled} label={rule.enabled ? 'Enabled' : 'Disabled'} onChange={(v) => onSave(rule, { enabled: v }, v ? 'Rule enabled' : 'Rule disabled')} />
      </header>
      <p className="ir-card__desc">{rule.description}</p>
      <p className="ir-card__why">{info.meaning}</p>

      <div className="ir-card__tune">
        <div>
          <label htmlFor={`w-${rule.id}`}>Window (s)</label>
          <input id={`w-${rule.id}`} className="ui-input mono" type="number" min="1" value={win} aria-invalid={winBad || undefined} onChange={(e) => setWin(e.target.value)} />
        </div>
        {rule.threshold != null && (
          <div>
            <label htmlFor={`t-${rule.id}`}>Threshold</label>
            <input id={`t-${rule.id}`} className="ui-input mono" type="number" min="1" value={thr} aria-invalid={thrBad || undefined} onChange={(e) => setThr(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor={`s-${rule.id}`}>Severity</label>
          <select id={`s-${rule.id}`} className="ui-input ui-select" value={sev} onChange={(e) => setSev(e.target.value)}>
            {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Button size="sm" variant="primary" disabled={!dirty || winBad || thrBad} loading={saving} onClick={save}>Save</Button>
      </div>

      {ex && (
        <div className="ir-card__try">
          <div>
            <span className="ir-card__try-t">Example attack</span>
            <p>{ex.text}</p>
          </div>
          <Button size="sm" variant="danger" loading={trying} onClick={() => onTry(rule, ex)}>Try it</Button>
        </div>
      )}
      {!rule.enabled && ex && <div className="ir-card__offnote">This rule is disabled, so the example will not raise its alert.</div>}
    </article>
  )
}
