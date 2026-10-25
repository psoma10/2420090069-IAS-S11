import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useLiveStatus } from '../hooks/useEvents.js'
import { useTheme } from '../components/layout/theme.js'
import { PageHeader, Panel, Field, Input, Select, Button, Badge, ErrorState, Spinner, useToast } from '../components/ui/index.js'
import './Settings.css'

const LIVE = {
  live: { tone: 'allow', text: 'Live', hint: 'Receiving server-sent events in real time.' },
  polling: { tone: 'violet', text: 'Polling', hint: 'The event stream is unavailable; pages fall back to periodic refresh.' },
  offline: { tone: 'deny', text: 'Offline', hint: 'Your browser reports no network connection.' },
  connecting: { tone: 'neutral', text: 'Connecting', hint: 'Opening the event stream...' },
}

function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function toCsv(rows) {
  if (!rows.length) return ''
  const cols = [...rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s }, new Set())]
  const esc = (v) => {
    if (v == null) return ''
    let t = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (/^[=+\-@]/.test(t)) t = `'${t}` // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n')
}

const THEME_LABEL = { system: 'Follow system', dark: 'Dark', light: 'Light' }

export default function Settings() {
  const toast = useToast()
  const { theme, preference, setPreference } = useTheme()
  const live = useLiveStatus()
  const L = LIVE[live] || LIVE.connecting

  const [cfg, setCfg] = useState(null)
  const [form, setForm] = useState({ packet_retention: '', alert_retention: '' })
  const [loadErr, setLoadErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [exporting, setExporting] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      if (typeof api.getSettings !== 'function') throw Object.assign(new Error('Settings API is not available in this build.'), { status: 404 })
      const s = await api.getSettings()
      setCfg(s)
      setForm({ packet_retention: String(s.packet_retention ?? ''), alert_retention: String(s.alert_retention ?? '') })
    } catch (e) {
      setLoadErr(e)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const validate = () => {
    const out = {}
    Object.keys(form).forEach((k) => {
      const n = Number(form[k])
      if (form[k] === '' || !Number.isInteger(n) || n < 1) out[k] = 'Enter a whole number of at least 1.'
    })
    setErrors(out)
    return Object.keys(out).length === 0
  }

  const save = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const next = await api.updateSettings({ packet_retention: Number(form.packet_retention), alert_retention: Number(form.alert_retention) })
      if (next && typeof next === 'object') {
        setCfg(next)
        setForm({ packet_retention: String(next.packet_retention ?? form.packet_retention), alert_retention: String(next.alert_retention ?? form.alert_retention) })
      }
      toast.success('Retention limits updated.', 'Settings saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const dirty = cfg && (form.packet_retention !== String(cfg.packet_retention) || form.alert_retention !== String(cfg.alert_retention))

  const exportAlerts = async (fmt) => {
    setExporting(fmt)
    try {
      const rows = []
      for (let offset = 0; offset < 100000; offset += 1000) { // backend caps limit at 1000 per page
        const page = await api.alerts({ limit: 1000, offset })
        rows.push(...page)
        if (page.length < 1000) break
      }
      if (!rows || !rows.length) { toast.push({ tone: 'info', title: 'Nothing to export', message: 'There are no alerts yet.' }); return }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      if (fmt === 'json') download(`sentinel-alerts-${stamp}.json`, 'application/json', JSON.stringify(rows, null, 2))
      else download(`sentinel-alerts-${stamp}.csv`, 'text/csv', toCsv(rows))
      toast.success(`${rows.length} alert${rows.length === 1 ? '' : 's'} exported as ${fmt.toUpperCase()}.`, 'Export ready')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setExporting('')
    }
  }

  return (
    <>
      <PageHeader kicker="System" title="Settings" subtitle="Appearance, how much history Sentinel keeps, and tools for working with your data." />
      <div className="settings">
        <Panel title="Appearance" subtitle={`Currently showing the ${theme} theme.`}>
          <div className="settings__row">
            <Field label="Theme" hint="Follow system uses your operating system preference.">
              <Select value={preference} onChange={(e) => setPreference(e.target.value)}>
                {Object.entries(THEME_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
        </Panel>

        <Panel title="Data retention" subtitle="Older records beyond these limits are discarded automatically.">
          {loading ? <div className="settings__center"><Spinner label="Loading settings" /></div>
            : loadErr ? <ErrorState error={loadErr} onRetry={load} title={loadErr.status === 404 ? 'Settings are not available' : 'Could not load settings'} />
              : (
                <form onSubmit={save} noValidate className="settings__form">
                  <div className="settings__grid">
                    <Field label="Packet retention" hint="Maximum packets kept in the log." error={errors.packet_retention}>
                      <Input type="number" inputMode="numeric" min="1" step="1" mono value={form.packet_retention} onChange={(e) => setForm({ ...form, packet_retention: e.target.value })} />
                    </Field>
                    <Field label="Alert retention" hint="Maximum alerts kept in history." error={errors.alert_retention}>
                      <Input type="number" inputMode="numeric" min="1" step="1" mono value={form.alert_retention} onChange={(e) => setForm({ ...form, alert_retention: e.target.value })} />
                    </Field>
                  </div>
                  <div className="settings__actions">
                    <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>Save changes</Button>
                    <Button variant="subtle" onClick={() => { setForm({ packet_retention: String(cfg.packet_retention), alert_retention: String(cfg.alert_retention) }); setErrors({}) }} disabled={!dirty || saving}>Discard</Button>
                  </div>
                </form>
              )}
        </Panel>

        <Panel title="Live connection" subtitle="How this browser receives updates from the backend.">
          <div className="settings__live" role="status">
            <Badge tone={L.tone} dot>{L.text}</Badge>
            <span>{L.hint}</span>
          </div>
        </Panel>

        <Panel title="Data tools" subtitle="Download the current alert history for use in other tools.">
          <div className="settings__actions">
            <Button icon="download" loading={exporting === 'json'} disabled={!!exporting} onClick={() => exportAlerts('json')}>Export alerts (JSON)</Button>
            <Button icon="download" loading={exporting === 'csv'} disabled={!!exporting} onClick={() => exportAlerts('csv')}>Export alerts (CSV)</Button>
          </div>
        </Panel>
      </div>
    </>
  )
}
