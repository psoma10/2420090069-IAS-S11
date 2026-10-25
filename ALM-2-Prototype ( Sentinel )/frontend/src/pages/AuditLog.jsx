import { Fragment, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { usePolling } from '../hooks/usePolling.js'
import {
  PageHeader, Panel, Button, Badge, SeverityBadge, Tabs, Input, Icon, Spinner, EmptyState, ErrorState,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui/index.js'
import { formatDateTime } from '../utils/format.js'
import './AuditLog.css'

const PAGE_SIZE = 50
const REFRESH_MS = 4000
const TABS = [
  { key: 'audit', label: 'Admin actions' },
  { key: 'security', label: 'Security events' },
]

const short = (h) => (h ? `${String(h).slice(0, 12)}...` : '-')

function Hash({ label, value }) {
  return (
    <div className="al-kv">
      <dt>{label}</dt>
      <dd className="mono" title={value || undefined}>{short(value)}</dd>
    </div>
  )
}

function Detail({ row, cols }) {
  const hasDetail = row.detail && typeof row.detail === 'object' && Object.keys(row.detail).length > 0
  return (
    <TR className="al-detail">
      <TD colSpan={cols}>
        <div className="al-detail__grid">
          <dl className="al-meta">
            <div className="al-kv"><dt>Sequence</dt><dd className="mono">#{row.seq}</dd></div>
            {row.kind === 'audit' && <div className="al-kv"><dt>Request</dt><dd className="mono">{row.method} {row.path}</dd></div>}
            {row.kind === 'security' && row.alert_id != null && <div className="al-kv"><dt>Alert</dt><dd className="mono">{row.alert_id}</dd></div>}
            <Hash label="Hash" value={row.hash} />
            <Hash label="Previous" value={row.prev} />
          </dl>
          <div className="al-json">
            <div className="al-json__t">{hasDetail ? 'Detail' : 'Detail (none recorded)'}</div>
            {hasDetail && <pre className="mono" tabIndex={0}>{JSON.stringify(row.detail, null, 2)}</pre>}
          </div>
        </div>
      </TD>
    </TR>
  )
}

function Cell({ children, title }) {
  return <span className="al-ell" title={title}>{children}</span>
}

function AuditRow({ r }) {
  return (
    <>
      <TD className="mono al-time" title={r.ts}>{formatDateTime(r.ts)}</TD>
      <TD><span className="mono al-action">{r.action || '-'}</span></TD>
      <TD className="mono">{r.actor || '-'}</TD>
      <TD className="mono"><Cell title={r.target}>{r.target || '-'}</Cell></TD>
      <TD className="mono">{r.status ?? '-'}</TD>
      <TD><Badge tone={r.outcome === 'success' ? 'allow' : 'deny'} dot>{r.outcome || 'unknown'}</Badge></TD>
      <TD className="mono al-num">{r.duration_ms != null ? `${Number(r.duration_ms).toFixed(1)} ms` : '-'}</TD>
    </>
  )
}

function SecurityRow({ r }) {
  return (
    <>
      <TD className="mono al-time" title={r.ts}>{formatDateTime(r.ts)}</TD>
      <TD><SeverityBadge severity={r.severity} /></TD>
      <TD className="mono">{r.rule_id || '-'}</TD>
      <TD><Cell title={r.title}>{r.title || '-'}</Cell></TD>
      <TD className="mono">{r.src_ip || '-'} <span className="al-arrow" aria-label="to">&rarr;</span> {r.dst_ip || '-'}</TD>
      <TD><Badge tone="neutral">{r.source || '-'}</Badge></TD>
    </>
  )
}

const COLS = {
  audit: ['Time', 'Action', 'Actor', 'Target', 'Status', 'Outcome', 'Duration'],
  security: ['Time', 'Severity', 'Rule', 'Title', 'Source to destination', 'Origin'],
}

export default function AuditLog() {
  const [kind, setKind] = useState('audit')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [openSeq, setOpenSeq] = useState(null)
  const [verify, setVerify] = useState(null) // {state:'busy'|'ok'|'bad'|'error', ...}

  // debounce the search box; a new query always starts on page 1
  useEffect(() => {
    if (qInput.trim() === q) return undefined
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(0); setOpenSeq(null) }, 350)
    return () => clearTimeout(t)
  }, [qInput, q])

  const typing = qInput.trim() !== q
  const autoRefresh = page === 0 && !typing

  const { data, error, loading, refresh } = usePolling(
    async () => {
      const res = await api.audit({ kind, limit: PAGE_SIZE, offset: page * PAGE_SIZE, q })
      return { kind, ...res }
    },
    autoRefresh ? REFRESH_MS : 0,
    [kind, page, q, autoRefresh],
  )

  const fresh = data && data.kind === kind ? data : null // never render rows under the wrong column set
  const rows = fresh?.rows || []
  const total = fresh ? (fresh.total ?? (page * PAGE_SIZE + rows.length)) : 0
  const from = rows.length ? page * PAGE_SIZE + 1 : 0
  const to = page * PAGE_SIZE + rows.length
  const hasNext = fresh ? (fresh.total != null ? to < fresh.total : rows.length === PAGE_SIZE) : false

  // if the log shrinks beneath the current page, fall back to page 1
  useEffect(() => {
    if (fresh && page > 0 && rows.length === 0) setPage(0)
  }, [fresh, page, rows.length])

  const switchKind = (k) => {
    if (k === kind) return
    setKind(k); setPage(0); setOpenSeq(null); setVerify(null)
  }

  const runVerify = async () => {
    setVerify({ state: 'busy' })
    try {
      const v = await api.auditVerify(kind)
      setVerify(v.ok ? { state: 'ok', entries: v.entries } : { state: 'bad', seq: v.first_bad_seq, entries: v.entries })
    } catch (e) {
      setVerify({ state: 'error', message: e.status === undefined ? 'Backend not reachable' : e.message })
    }
  }

  const cols = COLS[kind]
  const showSpinner = loading && !fresh
  const toggle = (seq) => setOpenSeq((s) => (s === seq ? null : seq))

  return (
    <div className="al">
      <PageHeader
        kicker="System"
        title="Audit Log"
        subtitle="Every change made through the API and every alert raised is recorded in tamper-evident, hash-chained log files in the logs/ folder."
        actions={
          <>
            {verify?.state === 'ok' && <Badge tone="allow" dot>Chain intact: {verify.entries} {verify.entries === 1 ? 'entry' : 'entries'}</Badge>}
            {verify?.state === 'bad' && <Badge tone="deny" dot>Tampering detected at seq {verify.seq ?? '?'}</Badge>}
            {verify?.state === 'error' && <Badge tone="medium" dot>Verify failed: {verify.message}</Badge>}
            <Button size="sm" variant="primary" icon="shield" loading={verify?.state === 'busy'} onClick={runVerify}>Verify integrity</Button>
          </>
        }
      />
      <span className="al-sr" role="status" aria-live="polite">
        {verify?.state === 'ok' && `Chain intact: ${verify.entries} entries`}
        {verify?.state === 'bad' && `Tampering detected at sequence ${verify.seq ?? 'unknown'}`}
      </span>

      <Panel pad={false} className="al-panel">
        <Tabs tabs={TABS} value={kind} onChange={switchKind} />
        <div className="al-bar">
          <div className="al-search">
            <Icon name="search" size={15} />
            <Input
              type="search"
              aria-label={kind === 'audit' ? 'Search admin actions' : 'Search security events'}
              placeholder={kind === 'audit' ? 'Search action, actor, target...' : 'Search rule, title, IP...'}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <span className="al-range mono" aria-live="polite">
            {fresh ? (rows.length ? `${from}-${to} of ${total}` : '0 entries') : ''}
          </span>
          <span className={`al-auto ${autoRefresh ? 'is-on' : ''}`} title={autoRefresh ? 'Refreshing every few seconds' : 'Auto-refresh pauses while searching or browsing older pages'}>
            <i aria-hidden="true" />{autoRefresh ? 'Auto-refresh' : 'Paused'}
          </span>
          <div className="al-pager">
            <Button size="sm" icon="refresh" onClick={refresh} aria-label="Refresh now">Refresh</Button>
            <Button size="sm" disabled={page === 0} onClick={() => { setPage((p) => Math.max(0, p - 1)); setOpenSeq(null) }}>Newer</Button>
            <Button size="sm" disabled={!hasNext} onClick={() => { setPage((p) => p + 1); setOpenSeq(null) }}>Older</Button>
          </div>
        </div>

        {error && !fresh ? (
          <div className="al-pad"><ErrorState error={error} onRetry={refresh} title="Could not load the audit log" /></div>
        ) : showSpinner ? (
          <div className="al-load"><Spinner /> Loading entries</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="lock"
            title={q ? 'No entries match your search' : kind === 'audit' ? 'No admin actions recorded yet' : 'No security events recorded yet'}
            hint={q ? 'Try a different term or clear the search box.' : kind === 'audit'
              ? 'Create a firewall rule or change a setting and it will show up here.'
              : 'Alerts raised by the IDS, anomaly detector or firewall are recorded here.'}
          />
        ) : (
          <>
            {error && <div className="al-pad"><ErrorState error={error} onRetry={refresh} title="Showing stale data" /></div>}
            <Table className="al-table">
              <THead>
                <TR>
                  <TH aria-label="Expand" style={{ width: 28 }} />
                  {cols.map((c) => <TH key={c}>{c}</TH>)}
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const open = openSeq === r.seq
                  return (
                    <Fragment key={`${r.kind}-${r.seq}`}>
                      <TR
                        className={`is-click al-row ${open ? 'is-open' : ''}`}
                        tabIndex={0}
                        aria-expanded={open}
                        onClick={() => toggle(r.seq)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(r.seq) } }}
                      >
                        <TD className="al-chev"><Icon name="chevron" size={13} /></TD>
                        {kind === 'audit' ? <AuditRow r={r} /> : <SecurityRow r={r} />}
                      </TR>
                      {open && <Detail row={r} cols={cols.length + 1} />}
                    </Fragment>
                  )
                })}
              </TBody>
            </Table>
          </>
        )}
      </Panel>
    </div>
  )
}
