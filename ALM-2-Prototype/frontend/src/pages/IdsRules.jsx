import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { PageHeader, Panel, EmptyState, Spinner, StatTile, useToast } from '../components/ui/index.js'
import { usePolling } from '../hooks/usePolling.js'
import { errMessage } from '../utils/format.js'
import RuleCard from '../components/alerts/RuleCard.jsx'
import ApiBanner from '../components/alerts/ApiBanner.jsx'
import '../components/alerts/rules.css'

const COMPARE = [
  ['How it detects', 'Matches known patterns and thresholds (rules).', 'Learns normal and flags statistical deviation.'],
  ['Strength', 'Precise, explainable, few false positives for known attacks.', 'Can catch novel, never-seen behavior.'],
  ['Weakness', 'Blind to new attacks with no rule yet; attackers evade by staying just under thresholds.', 'Noisy: legitimate surges trigger it. Needs a clean baseline.'],
  ['Needs tuning', 'Thresholds and windows per rule.', 'Sigma, bucket size and training data.'],
  ['Explains itself', 'Yes: "5 failed logins in 60s".', 'Only "this is 4.2σ above normal".'],
  ['In Sentinel', 'IDS-001 to IDS-009 (this page).', 'ANOM-* alerts on the Anomaly page.'],
]

export default function IdsRules() {
  const toast = useToast()
  const nav = useNavigate()
  const q = usePolling(() => api.idsRules(), 0)
  const [rules, setRules] = useState(null)
  const [trying, setTrying] = useState('')
  const list = rules || q.data || []

  const save = async (rule, patch, msg) => {
    const body = { enabled: rule.enabled, ...patch }
    try {
      const updated = await api.updateIdsRule(rule.id, body)
      setRules((cur) => (cur || q.data || []).map((r) => (r.id === rule.id ? { ...r, ...updated } : r)))
      toast.success(`${rule.id}: ${msg}`)
    } catch (e) { toast.error(errMessage(e)) }
  }

  const tryIt = async (rule, ex) => {
    setTrying(rule.id)
    try {
      const res = ex.scenario ? await api.scenario(ex.scenario) : await api.send(ex.send)
      toast.success(`${res.summary?.total ?? 0} packets sent, ${res.summary?.alerts ?? 0} alert(s) raised`, `${rule.id} triggered`)
      nav('/alerts')
    } catch (e) { toast.error(errMessage(e)) } finally { setTrying('') }
  }

  const enabled = list.filter((r) => r.enabled).length
  const bySev = list.reduce((m, r) => ({ ...m, [r.severity]: (m[r.severity] || 0) + 1 }), {})

  return (
    <div className="ir">
      <PageHeader
        kicker="Detection"
        title="Detection Rules"
        subtitle="Signature-based IDS rules. Tune thresholds, switch rules on or off, and fire a matching attack to see each one trigger."
      />
      <ApiBanner error={q.error && !q.data ? q.error : null} onRetry={q.refresh} />

      <div className="ir-stats">
        <StatTile label="Rules" value={list.length} tone="neutral" />
        <StatTile label="Enabled" value={enabled} tone="ok" />
        <StatTile label="Critical / High" value={(bySev.critical || 0) + (bySev.high || 0)} tone="high" />
        <StatTile label="Medium / Low" value={(bySev.medium || 0) + (bySev.low || 0)} tone="medium" />
      </div>

      {q.loading && !q.data ? (
        <div className="ir-load"><Spinner /> Loading rules</div>
      ) : list.length === 0 ? (
        <Panel><EmptyState title="No rules loaded" hint="Start the backend to load the built-in rule set." icon="shield" /></Panel>
      ) : (
        <div className="ir-grid">
          {list.map((r) => <RuleCard key={r.id} rule={r} onSave={save} onTry={tryIt} trying={trying === r.id} />)}
        </div>
      )}

      <Panel title="Signature-based vs anomaly-based detection" subtitle="Two complementary ideas. Real systems use both.">
        <div className="ir-compare" role="table" aria-label="Signature versus anomaly detection">
          <div className="ir-compare__row ir-compare__head" role="row">
            <span role="columnheader" />
            <span role="columnheader">Signature / rule-based</span>
            <span role="columnheader">Anomaly / statistical</span>
          </div>
          {COMPARE.map(([k, a, b]) => (
            <div key={k} className="ir-compare__row" role="row">
              <span className="ir-compare__k" role="rowheader">{k}</span>
              <span role="cell">{a}</span>
              <span role="cell">{b}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
