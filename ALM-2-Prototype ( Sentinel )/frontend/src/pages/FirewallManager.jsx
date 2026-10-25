import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { usePolling } from '../hooks/usePolling.js'
import {
  Badge, Button, Code, EmptyState, ErrorState, Field, Icon, Input, Modal, PageHeader, Panel,
  Select, Spinner, Table, TBody, TD, TH, THead, Tabs, Toggle, TR, useToast,
} from '../components/ui/index.js'
import { explainMatch, isIpOrCidr, isPortSpec } from '../utils/net.js'
import { formatNumber } from '../utils/format.js'
import './FirewallManager.css'

const BLANK = { name: '', action: 'deny', protocol: 'TCP', src_ip: 'ANY', dst_ip: 'ANY', src_port: 'ANY', dst_port: 'ANY', priority: 100, enabled: true, description: '' }

const TEMPLATES = [
  { key: 'block_ip', label: 'Block IP', rule: { name: 'Block IP 203.0.113.50', action: 'deny', protocol: 'ANY', src_ip: '203.0.113.50', dst_ip: 'ANY', src_port: 'ANY', dst_port: 'ANY', priority: 10, description: 'Drop everything from one hostile address.' } },
  { key: 'allow_http', label: 'Allow HTTP/HTTPS', rule: { name: 'Allow HTTP to web tier', action: 'allow', protocol: 'TCP', src_ip: 'ANY', dst_ip: '10.0.1.0/24', src_port: 'ANY', dst_port: '80', priority: 50, description: 'Let anyone reach the web servers on port 80.' } },
  { key: 'block_telnet', label: 'Block Telnet', rule: { name: 'Block Telnet', action: 'deny', protocol: 'TCP', src_ip: 'ANY', dst_ip: 'ANY', src_port: 'ANY', dst_port: '23', priority: 20, description: 'Telnet sends credentials in clear text.' } },
  { key: 'ssh_bastion', label: 'Allow SSH to bastion only', rule: { name: 'Allow SSH to bastion', action: 'allow', protocol: 'TCP', src_ip: 'ANY', dst_ip: '10.0.0.5', src_port: 'ANY', dst_port: '22', priority: 30, description: 'The bastion is the only SSH entry point.' } },
  { key: 'block_rdp', label: 'Block RDP/SMB', rule: { name: 'Block RDP', action: 'deny', protocol: 'TCP', src_ip: 'ANY', dst_ip: 'ANY', src_port: 'ANY', dst_port: '3389', priority: 25, description: 'Remote desktop is a top ransomware entry point.' } },
  { key: 'allow_dns', label: 'Allow DNS', rule: { name: 'Allow DNS', action: 'allow', protocol: 'UDP', src_ip: 'ANY', dst_ip: 'ANY', src_port: 'ANY', dst_port: '53', priority: 60, description: 'Name resolution.' } },
]

const strip = (r) => ({ name: r.name, action: r.action, protocol: r.protocol, src_ip: r.src_ip, dst_ip: r.dst_ip, src_port: r.src_port, dst_port: r.dst_port, priority: r.priority, enabled: r.enabled, description: r.description || '' })

function validate(f) {
  const e = {}
  if (!f.name.trim()) e.name = 'Give the rule a name.'
  if (!isIpOrCidr(f.src_ip.trim())) e.src_ip = 'Use ANY, an IP (10.0.0.5) or CIDR (10.0.0.0/24).'
  if (!isIpOrCidr(f.dst_ip.trim())) e.dst_ip = 'Use ANY, an IP (10.0.0.5) or CIDR (10.0.0.0/24).'
  if (!isPortSpec(f.src_port.trim())) e.src_port = 'Use ANY, a port (80) or range (1000-2000).'
  if (!isPortSpec(f.dst_port.trim())) e.dst_port = 'Use ANY, a port (80) or range (1000-2000).'
  const p = Number(f.priority)
  if (f.priority === '' || !Number.isInteger(p) || p < 0 || p > 65535) e.priority = 'Whole number from 0 to 65535 (lower runs first).'
  if ((f.protocol === 'ICMP') && (f.dst_port.trim().toUpperCase() !== 'ANY' || f.src_port.trim().toUpperCase() !== 'ANY')) e.dst_port = 'ICMP has no ports, use ANY.'
  return e
}

function RuleModal({ open, initial, onClose, onSaved, existing }) {
  const toast = useToast()
  const editing = initial && initial.id != null
  const [form, setForm] = useState(BLANK)
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const [seenKey, setSeenKey] = useState(null)
  const key = open ? (initial?.id ?? 'new') + ':' + (initial?.name ?? '') : null
  if (key !== seenKey) {
    setSeenKey(key)
    if (open) { setForm({ ...BLANK, ...(initial ? strip(initial) : {}) }); setErrs({}) }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }))

  const submit = async (ev) => {
    ev?.preventDefault()
    const e = validate(form)
    setErrs(e)
    if (Object.keys(e).length) return
    const body = { ...form, name: form.name.trim(), src_ip: form.src_ip.trim().toUpperCase() === 'ANY' ? 'ANY' : form.src_ip.trim(), dst_ip: form.dst_ip.trim().toUpperCase() === 'ANY' ? 'ANY' : form.dst_ip.trim(), src_port: form.src_port.trim().toUpperCase(), dst_port: form.dst_port.trim().toUpperCase(), priority: Number(form.priority) }
    setBusy(true)
    try {
      if (editing) await api.updateRule(initial.id, body)
      else await api.createRule(body)
      toast.success(`Rule "${body.name}" ${editing ? 'updated' : 'created'}.`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message, 'Rule rejected')
    } finally { setBusy(false) }
  }

  const clash = existing.find((r) => r.priority === Number(form.priority) && r.id !== initial?.id)
  return (
    <Modal
      open={open} onClose={onClose} width={640} title={editing ? `Edit rule #${initial.id}` : 'New firewall rule'}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Create rule'}</Button></>}
    >
      <form className="fw-form" onSubmit={submit} noValidate>
        <div className="fw-form__full"><Field label="Name" error={errs.name}><Input value={form.name} onChange={set('name')} placeholder="e.g. Block Telnet" maxLength={80} /></Field></div>
        <Field label="Action" hint={form.action === 'allow' ? 'Matching packets pass.' : 'Matching packets are dropped.'}>
          <Select value={form.action} onChange={set('action')}><option value="allow">allow</option><option value="deny">deny</option></Select>
        </Field>
        <Field label="Protocol"><Select value={form.protocol} onChange={set('protocol')}>{['TCP', 'UDP', 'ICMP', 'ANY'].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Source IP / CIDR" error={errs.src_ip}><Input mono value={form.src_ip} onChange={set('src_ip')} placeholder="ANY" /></Field>
        <Field label="Destination IP / CIDR" error={errs.dst_ip}><Input mono value={form.dst_ip} onChange={set('dst_ip')} placeholder="10.0.1.0/24" /></Field>
        <Field label="Source port" error={errs.src_port}><Input mono value={form.src_port} onChange={set('src_port')} placeholder="ANY" /></Field>
        <Field label="Destination port" error={errs.dst_port}><Input mono value={form.dst_port} onChange={set('dst_port')} placeholder="80 or 1000-2000" /></Field>
        <Field label="Priority" error={errs.priority} hint={clash ? `Same priority as "${clash.name}", list order decides.` : 'Lower number is evaluated first.'}>
          <Input mono type="number" min="0" max="65535" value={form.priority} onChange={set('priority')} />
        </Field>
        <div className="fw-form__tog"><Toggle checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} label={form.enabled ? 'Rule enabled' : 'Rule disabled'} /></div>
        <div className="fw-form__full"><Field label="Description (optional)"><Input value={form.description} onChange={set('description')} maxLength={200} /></Field></div>
      </form>
    </Modal>
  )
}

function PacketTester({ rules, policy }) {
  const toast = useToast()
  const [f, setF] = useState({ src_ip: '203.0.113.50', dst_ip: '10.0.1.10', src_port: '', dst_port: '80', protocol: 'TCP' })
  const [res, setRes] = useState(null)
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errs, setErrs] = useState({})
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const run = async (ev) => {
    ev.preventDefault()
    const e = {}
    if (!isIpOrCidr(f.src_ip) || f.src_ip.toUpperCase() === 'ANY' || f.src_ip.includes('/')) e.src_ip = 'Enter one IPv4 address.'
    if (!isIpOrCidr(f.dst_ip) || f.dst_ip.toUpperCase() === 'ANY' || f.dst_ip.includes('/')) e.dst_ip = 'Enter one IPv4 address.'
    if (f.protocol !== 'ICMP' && !/^\d{1,5}$/.test(f.dst_port)) e.dst_port = 'Enter a port number.'
    if (f.src_port && !/^\d{1,5}$/.test(f.src_port)) e.src_port = 'Number or empty.'
    setErrs(e)
    if (Object.keys(e).length) return
    const body = { src_ip: f.src_ip, dst_ip: f.dst_ip, protocol: f.protocol, dst_port: f.protocol === 'ICMP' ? 0 : Number(f.dst_port) }
    if (f.src_port) body.src_port = Number(f.src_port)
    setBusy(true)
    try {
      setRes(await api.testPacket(body))
      setSnap({ rules: [...rules].sort((a, b) => a.priority - b.priority), pkt: { ...f, dst_port: body.dst_port, src_port: f.src_port ? Number(f.src_port) : '' } })
    } catch (err) { toast.error(err.message, 'Test failed') } finally { setBusy(false) }
  }

  const trace = useMemo(() => {
    if (!res || !snap) return []
    const steps = []
    const bastionHit = /bastion/i.test(res.reason || '') && res.matched_rule_id == null
    if (policy?.bastion_mode) steps.push({ kind: 'bastion', hit: bastionHit, text: bastionHit ? 'Bastion policy denied this: external traffic may only reach the bastion.' : 'Bastion policy checked, packet allowed to continue.' })
    if (bastionHit) return steps
    for (const r of snap.rules) {
      if (!r.enabled) { steps.push({ kind: 'skip', rule: r, text: 'Disabled, skipped.' }); continue }
      const hit = res.matched_rule_id === r.id
      if (hit) { steps.push({ kind: 'hit', rule: r, text: `Match. Verdict: ${r.action.toUpperCase()}.` }); return steps }
      const ex = explainMatch(r, snap.pkt)
      steps.push({ kind: 'miss', rule: r, text: ex.match ? 'Overshadowed by an earlier decision.' : `No match: ${ex.failed.join(', ')} differ.` })
    }
    steps.push({ kind: 'default', hit: true, text: `No rule matched. Default policy: ${(policy?.default_action || res.verdict).toUpperCase()}.` })
    return steps
  }, [res, snap, policy])

  const allowed = res && /allow/i.test(res.verdict)
  return (
    <Panel title="Packet tester" subtitle="Dry run: nothing is sent, no counters change." tone="violet">
      <form className="fw-test" onSubmit={run} noValidate>
        <Field label="Source IP" error={errs.src_ip}><Input mono value={f.src_ip} onChange={set('src_ip')} /></Field>
        <Field label="Destination IP" error={errs.dst_ip}><Input mono value={f.dst_ip} onChange={set('dst_ip')} /></Field>
        <Field label="Protocol"><Select value={f.protocol} onChange={set('protocol')}>{['TCP', 'UDP', 'ICMP'].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Dest port" error={errs.dst_port}><Input mono value={f.dst_port} onChange={set('dst_port')} disabled={f.protocol === 'ICMP'} /></Field>
        <Field label="Src port (opt.)" error={errs.src_port}><Input mono value={f.src_port} onChange={set('src_port')} /></Field>
        <div className="fw-test__go"><Button type="submit" variant="primary" icon="play" loading={busy}>Test packet</Button></div>
      </form>
      {res && (
        <div className="fw-result" aria-live="polite">
          <div className={`fw-verdict ${allowed ? 'is-allow' : 'is-deny'}`}>
            <Icon name={allowed ? 'check' : 'x'} size={22} />
            <div>
              <div className="fw-verdict__v">{allowed ? 'ALLOWED' : 'BLOCKED'}</div>
              <div className="fw-verdict__r">{res.matched_rule_name ? <>Rule <Code>{res.matched_rule_name}</Code>. </> : null}{res.reason}</div>
            </div>
          </div>
          <ol className="fw-trace" aria-label="Rule evaluation trace">
            {trace.map((s, i) => (
              <li key={i} className={`fw-trace__${s.kind}`}>
                <span className="fw-trace__dot" aria-hidden="true">{s.kind === 'hit' || s.kind === 'default' ? <Icon name={allowed ? 'check' : 'x'} size={11} /> : s.kind === 'skip' ? '–' : s.kind === 'bastion' ? <Icon name="lock" size={11} /> : ''}</span>
                <div>
                  <b className="mono">{s.rule ? `#${s.rule.priority} ${s.rule.name}` : s.kind === 'bastion' ? 'Bastion check' : 'Default policy'}</b>
                  <span>{s.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  )
}

export default function FirewallManager() {
  const toast = useToast()
  const rulesQ = usePolling(() => api.rules(), 4000)
  const policyQ = usePolling(() => api.policy(), 8000)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // {initial}
  const [del, setDel] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [polBusy, setPolBusy] = useState(false)

  const rules = useMemo(() => [...(rulesQ.data || [])].sort((a, b) => a.priority - b.priority || a.id - b.id), [rulesQ.data])
  const counts = { all: rules.length, allow: rules.filter((r) => r.action === 'allow').length, deny: rules.filter((r) => r.action === 'deny').length }
  const shown = rules.filter((r) => (tab === 'all' || r.action === tab) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())))
  const maxHits = Math.max(1, ...rules.map((r) => r.hit_count || 0))
  const policy = policyQ.data

  const wrap = async (id, fn, okMsg) => {
    setBusyId(id)
    try { await fn(); okMsg && toast.success(okMsg); await rulesQ.refresh() } catch (e) { toast.error(e.message) } finally { setBusyId(null) }
  }
  const move = (r, dir) => {
    const i = rules.findIndex((x) => x.id === r.id)
    const nb = rules[i + dir]
    if (!nb) return
    return wrap(r.id, async () => {
      if (nb.priority === r.priority) {
        await api.updateRule(r.id, { ...strip(r), priority: Math.max(0, nb.priority + dir) })
      } else {
        await api.updateRule(r.id, { ...strip(r), priority: nb.priority })
        await api.updateRule(nb.id, { ...strip(nb), priority: r.priority })
      }
    })
  }
  const savePolicy = async (patch) => {
    setPolBusy(true)
    try {
      const p = await api.setPolicy({ default_action: policy.default_action, bastion_mode: policy.bastion_mode, ...patch })
      policyQ.refresh()
      toast.success(patch.bastion_mode !== undefined ? `Bastion mode ${p.bastion_mode ? 'enabled' : 'disabled'}.` : `Default policy is now ${p.default_action}.`)
    } catch (e) { toast.error(e.message) } finally { setPolBusy(false) }
  }

  return (
    <>
      <PageHeader
        kicker="Defend" title="Firewall rule manager"
        subtitle="Rules are checked top to bottom by priority. The first match decides; if nothing matches, the default policy applies."
        actions={<>
          <Select aria-label="Add rule from template" value="" onChange={(e) => { const t = TEMPLATES.find((x) => x.key === e.target.value); if (t) setModal({ initial: { ...BLANK, ...t.rule, enabled: true } }) }}>
            <option value="">Rule templates...</option>
            {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
          <Button variant="primary" icon="plus" onClick={() => setModal({ initial: null })}>Add rule</Button>
        </>}
      />
      {rulesQ.error && !rulesQ.data && <ErrorState error={rulesQ.error} onRetry={rulesQ.refresh} title="Rules unavailable" />}

      <div className="fw-top">
        <Panel title="Default policy" subtitle="What happens when no rule matches" tone="warn">
          {!policy ? <Spinner /> : (
            <>
              <div className="fw-seg" role="group" aria-label="Default policy">
                {['deny', 'allow'].map((a) => (
                  <button key={a} type="button" disabled={polBusy} aria-pressed={policy.default_action === a} className={`fw-seg__b fw-seg__b--${a} ${policy.default_action === a ? 'is-on' : ''}`} onClick={() => policy.default_action !== a && savePolicy({ default_action: a })}>
                    <Icon name={a === 'deny' ? 'lock' : 'globe'} size={15} />{a === 'deny' ? 'Default deny' : 'Default allow'}
                  </button>
                ))}
              </div>
              <p className="fw-note">{policy.default_action === 'deny' ? 'Default deny is the secure stance: only traffic you explicitly permit gets through.' : 'Default allow is risky: anything not blocked by a rule is let through.'}</p>
            </>
          )}
        </Panel>
        <Panel title="Bastion mode" subtitle="Single hardened entry point" tone="accent">
          {!policy ? <Spinner /> : (
            <>
              <Toggle checked={policy.bastion_mode} disabled={polBusy} onChange={(v) => savePolicy({ bastion_mode: v })} label={policy.bastion_mode ? 'Enforced' : 'Off'} />
              <p className="fw-note">When on, inbound traffic from external sources to any internal host that is not the bastion is denied <em>before</em> rules run (reason "Bastion policy"). Designate the bastion on the <Link to="/hosts">Hosts page</Link>.</p>
            </>
          )}
        </Panel>
      </div>

      <Panel
        className="fw-rules" pad={false} title="Rules"
        subtitle={rulesQ.data ? `${counts.all} total, ${rules.filter((r) => r.enabled).length} enabled` : ''}
        actions={<div className="fw-tools">
          <div className="fw-search"><Icon name="search" size={14} /><input aria-label="Search rules" placeholder="Search rules..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>}
      >
        <div className="fw-tabs"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'all', label: 'All', count: counts.all }, { key: 'allow', label: 'Allow', count: counts.allow }, { key: 'deny', label: 'Deny', count: counts.deny }]} /></div>
        {rulesQ.loading && !rulesQ.data ? <div className="fw-load"><Spinner size={24} /></div>
          : shown.length === 0 ? (
            <EmptyState title={rules.length ? 'No rules match your filter' : 'No firewall rules'} hint={rules.length ? 'Try clearing the search or switching tabs.' : 'With no rules, the default policy decides everything. Add your first rule or pick a template.'} icon="flame"
              action={!rules.length && <Button variant="primary" icon="plus" onClick={() => setModal({ initial: null })}>Add rule</Button>} />
          ) : (
            <Table>
              <THead><TR><TH>Prio</TH><TH>Name</TH><TH>Action</TH><TH>Proto</TH><TH>Source</TH><TH>Destination</TH><TH>Hits</TH><TH>On</TH><TH style={{ textAlign: 'right' }}>Actions</TH></TR></THead>
              <TBody>
                {shown.map((r) => {
                  const idx = rules.findIndex((x) => x.id === r.id)
                  return (
                    <TR key={r.id} className={r.enabled ? '' : 'fw-off'}>
                      <TD className="mono fw-prio">{r.priority}</TD>
                      <TD><div className="fw-name">{r.name}</div>{r.description && <div className="fw-desc">{r.description}</div>}</TD>
                      <TD><Badge tone={r.action}>{r.action === 'allow' ? '✓ ALLOW' : '✕ DENY'}</Badge></TD>
                      <TD><Badge tone="neutral">{r.protocol}</Badge></TD>
                      <TD className="mono fw-ep">{r.src_ip}<span>:{r.src_port}</span></TD>
                      <TD className="mono fw-ep">{r.dst_ip}<span>:{r.dst_port}</span></TD>
                      <TD><div className="fw-hits mono"><span>{formatNumber(r.hit_count || 0)}</span><i><b style={{ width: `${((r.hit_count || 0) / maxHits) * 100}%` }} /></i></div></TD>
                      <TD><Toggle checked={r.enabled} disabled={busyId === r.id} ariaLabel={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`} onChange={() => wrap(r.id, () => api.toggleRule(r.id))} /></TD>
                      <TD>
                        <div className="fw-act">
                          <Button size="sm" variant="subtle" aria-label={`Move ${r.name} up`} title="Higher priority (runs earlier)" icon="arrowUp" disabled={idx <= 0 || busyId === r.id} onClick={() => move(r, -1)} />
                          <Button size="sm" variant="subtle" aria-label={`Move ${r.name} down`} title="Lower priority (runs later)" icon="arrowDown" disabled={idx >= rules.length - 1 || busyId === r.id} onClick={() => move(r, 1)} />
                          <Button size="sm" variant="subtle" aria-label={`Edit ${r.name}`} icon="edit" onClick={() => setModal({ initial: r })} />
                          <Button size="sm" variant="subtle" aria-label={`Delete ${r.name}`} icon="trash" onClick={() => setDel(r)} />
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
      </Panel>

      <div className="fw-bottom"><PacketTester rules={rules} policy={policy} /></div>

      <RuleModal open={!!modal} initial={modal?.initial} existing={rules} onClose={() => setModal(null)} onSaved={rulesQ.refresh} />
      <Modal
        open={!!del} onClose={() => setDel(null)} title="Delete rule?"
        footer={<><Button onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" icon="trash" onClick={async () => { const r = del; setDel(null); await wrap(r.id, () => api.deleteRule(r.id), `Deleted "${r.name}".`) }}>Delete</Button></>}
      >
        <p>Remove <strong>{del?.name}</strong>? Traffic it matched will fall through to later rules or the default policy.</p>
      </Modal>
    </>
  )
}
