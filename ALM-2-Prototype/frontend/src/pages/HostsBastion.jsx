import { useState } from 'react'
import { api } from '../api/client.js'
import { usePolling } from '../hooks/usePolling.js'
import {
  Badge, Button, Code, EmptyState, ErrorState, Field, Icon, Input, Modal, PageHeader, Panel,
  Select, Spinner, Table, TBody, TD, TH, THead, TR, useToast,
} from '../components/ui/index.js'
import { isExternalIp } from '../utils/format.js'
import { isIPv4 } from '../utils/net.js'
import IpLink from '../components/investigate/IpLink.jsx'
import './HostsBastion.css'

const ROLES = ['bastion', 'web', 'database', 'ssh', 'workstation', 'external']
const ROLE_ICON = { bastion: 'shield', web: 'globe', database: 'server', ssh: 'terminal', workstation: 'cpu', external: 'bug' }
const BLANK = { name: '', ip: '', role: 'workstation', description: '' }

function HostModal({ open, initial, onClose, onSaved }) {
  const toast = useToast()
  const editing = initial?.id != null
  const [f, setF] = useState(BLANK)
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const [seen, setSeen] = useState(null)
  const key = open ? String(initial?.id ?? 'new') : null
  if (key !== seen) { setSeen(key); if (open) { setF({ ...BLANK, ...(initial || {}) }); setErrs({}) } }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const submit = async (ev) => {
    ev?.preventDefault()
    const e = {}
    if (!f.name.trim()) e.name = 'Name is required.'
    if (!isIPv4(f.ip.trim())) e.ip = 'Enter a valid IPv4 address, e.g. 10.0.1.12.'
    setErrs(e)
    if (Object.keys(e).length) return
    const body = { name: f.name.trim(), ip: f.ip.trim(), role: f.role, is_bastion: f.role === 'bastion', description: f.description || '' }
    setBusy(true)
    try {
      if (editing) await api.updateHost(initial.id, body); else await api.createHost(body)
      toast.success(`Host "${body.name}" ${editing ? 'updated' : 'added'}.`)
      onSaved(); onClose()
    } catch (err) { toast.error(err.message, 'Host rejected') } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit host' : 'Add host'}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{editing ? 'Save' : 'Add host'}</Button></>}>
      <form className="hb-form" onSubmit={submit} noValidate>
        <Field label="Name" error={errs.name}><Input value={f.name} onChange={set('name')} placeholder="web-03" maxLength={60} /></Field>
        <Field label="IP address" error={errs.ip}><Input mono value={f.ip} onChange={set('ip')} placeholder="10.0.1.12" /></Field>
        <Field label="Role" hint="To make a bastion, use the Make bastion action so only one exists.">
          <Select value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
        </Field>
        <Field label="Description"><Input value={f.description} onChange={set('description')} maxLength={160} /></Field>
      </form>
    </Modal>
  )
}

function Node({ x, y, w, h, icon, title, sub, tone = 'neutral', glow }) {
  return (
    <g className={`tp-node tp-node--${tone} ${glow ? 'is-glow' : ''}`} transform={`translate(${x},${y})`}>
      <rect width={w} height={h} rx="8" />
      <g transform="translate(10,10)" className="tp-node__ic">{iconPath(icon)}</g>
      <text x="36" y="23" className="tp-node__t">{title}</text>
      <text x="36" y="38" className="tp-node__s">{sub}</text>
    </g>
  )
}
function iconPath(name) {
  const ic = {
    shield: <path d="M8 1l6 2.5v4c0 4-2.5 6.5-6 8-3.5-1.5-6-4-6-8v-4z" />,
    globe: <><circle cx="8" cy="8" r="7" /><path d="M1 8h14M8 1c2.5 2.5 2.5 11.5 0 14M8 1c-2.5 2.5-2.5 11.5 0 14" /></>,
    server: <><rect x="1" y="2" width="14" height="5" rx="1" /><rect x="1" y="9" width="14" height="5" rx="1" /></>,
    terminal: <><rect x="1" y="2" width="14" height="12" rx="1" /><path d="M4 6l2 2-2 2M8 11h4" /></>,
    cpu: <><rect x="3" y="3" width="10" height="10" rx="1" /><path d="M6 1v2M10 1v2M6 13v2M10 13v2" /></>,
    bug: <><rect x="5" y="5" width="6" height="9" rx="3" /><path d="M2 8h3M11 8h3M3 4l2 2M13 4l-2 2" /></>,
    flame: <path d="M8 1c1 3 5 4 5 8a5 5 0 01-10 0c0-1.500.5-2.500 1.500-3.500C5 7 6 8 7 8c0-3-1-5 1-7z" />,
  }
  return <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">{ic[name] || ic.server}</g>
}

function Topology({ hosts, bastion, bastionMode }) {
  const ext = hosts.filter((h) => !h.is_bastion && (h.role === 'external' || isExternalIp(h.ip)))
  const inn = hosts.filter((h) => !h.is_bastion && !(h.role === 'external' || isExternalIp(h.ip)))
  const extShown = ext.slice(0, 4), inShown = inn.slice(0, 6)
  const W = 900, H = 440
  const yOf = (i, n, top = 70, bot = 352) => (n <= 1 ? (top + bot) / 2 : top + (i * (bot - top)) / (n - 1))
  const fw = { x: 330, y: 195, w: 120, h: 60 }
  const bs = { x: 530, y: 52, w: 160, h: 52 }
  const fwOut = { x: fw.x + fw.w, y: fw.y + fw.h / 2 }
  const mode = bastionMode ? 'on' : 'off'
  return (
    <svg className={`tp tp--${mode}`} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Network topology. External zone connects through the firewall. Bastion mode is ${bastionMode ? 'on: only the bastion is reachable from outside' : 'off: external traffic may reach internal hosts directly'}. ${bastion ? `Bastion host is ${bastion.name}.` : 'No bastion designated.'}`}>
      <defs>
        <marker id="tpArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="context-stroke" /></marker>
        <pattern id="tpGrid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="var(--line)" strokeWidth=".5" opacity=".5" /></pattern>
      </defs>
      <rect width={W} height={H} fill="url(#tpGrid)" rx="10" />
      {/* zones */}
      <g className="tp-zone tp-zone--ext"><rect x="14" y="30" width="190" height="390" rx="12" /><text x="28" y="50">INTERNET / EXTERNAL</text></g>
      <g className="tp-zone tp-zone--dmz"><rect x="510" y="26" width="200" height="100" rx="12" /><text x="524" y="44">DMZ</text></g>
      <g className="tp-zone tp-zone--int"><rect x="716" y="30" width="172" height="390" rx="12" /><text x="730" y="50">INTERNAL</text></g>

      {/* links: external -> firewall */}
      {extShown.map((h, i) => <path key={h.id} className="tp-link tp-link--ext" d={`M170 ${yOf(i, extShown.length) + 22} C 250 ${yOf(i, extShown.length) + 22}, 260 ${fw.y + 30}, ${fw.x} ${fw.y + 30}`} markerEnd="url(#tpArrow)" />)}
      {extShown.length === 0 && <path className="tp-link tp-link--ext" d={`M170 225 L${fw.x} 225`} markerEnd="url(#tpArrow)" />}
      {/* firewall -> bastion */}
      {bastion && <path className="tp-link tp-link--bastion" d={`M${fw.x + 90} ${fw.y} C ${fw.x + 90} 110, 480 78, ${bs.x} 78`} markerEnd="url(#tpArrow)" />}
      {bastion && <text x="470" y="140" className="tp-lbl tp-lbl--ok">{bastionMode ? 'ONLY PATH IN' : 'allowed path'}</text>}
      {/* firewall -> internal direct, and bastion -> internal */}
      {inShown.map((h, i) => {
        const y = yOf(i, inShown.length, 90, 380) + 0
        return (
          <g key={h.id}>
            <path className={`tp-link tp-link--direct tp-link--direct-${mode}`} d={`M${fwOut.x} ${fwOut.y} L716 ${y}`} markerEnd="url(#tpArrow)" />
            {bastion && <path className="tp-link tp-link--bastion tp-link--inner" d={`M${bs.x + bs.w} ${bs.y + 26} C 700 ${bs.y + 26}, 700 ${y}, 722 ${y}`} markerEnd="url(#tpArrow)" />}
          </g>
        )
      })}
      {/* direct-path verdict label */}
      {inShown.length > 0 && (
        <g transform="translate(470,285)" className={`tp-chip tp-chip--${mode}`}>
          <rect x="-62" y="-13" width="124" height="26" rx="13" />
          <text textAnchor="middle" y="4">{bastionMode ? '✕ direct: DENIED' : '! direct: OPEN'}</text>
        </g>
      )}

      {/* nodes */}
      {extShown.map((h, i) => <Node key={h.id} x={30} y={yOf(i, extShown.length)} w={140} h={46} icon="bug" tone="danger" title={h.name} sub={h.ip} />)}
      {ext.length > extShown.length && <text x="30" y="414" className="tp-more">+{ext.length - extShown.length} more external</text>}
      {ext.length === 0 && <text x="108" y="130" className="tp-more" textAnchor="middle">no external hosts</text>}
      <Node x={fw.x} y={fw.y} w={fw.w} h={fw.h} icon="flame" tone="fw" title="Firewall" sub={bastionMode ? 'bastion mode' : 'rules only'} />
      {bastion ? <Node x={bs.x} y={bs.y} w={bs.w} h={bs.h} icon="shield" tone="bastion" glow title={bastion.name} sub={`${bastion.ip} · BASTION`} />
        : <g transform={`translate(${bs.x},${bs.y})`} className="tp-node tp-node--empty"><rect width={bs.w} height={bs.h} rx="8" strokeDasharray="4 4" /><text x={bs.w / 2} y="31" textAnchor="middle" className="tp-node__s">no bastion set</text></g>}
      {inShown.map((h, i) => <Node key={h.id} x={730} y={yOf(i, inShown.length, 90, 380) - 23} w={148} h={46} icon={ROLE_ICON[h.role] === 'globe' ? 'globe' : h.role === 'database' ? 'server' : h.role === 'ssh' ? 'terminal' : h.role === 'workstation' ? 'cpu' : 'server'} tone="int" title={h.name} sub={h.ip} />)}
      {inn.length > inShown.length && <text x="730" y="414" className="tp-more">+{inn.length - inShown.length} more internal</text>}
      {inn.length === 0 && <text x="802" y="230" className="tp-more" textAnchor="middle">no internal hosts</text>}
    </svg>
  )
}

export default function HostsBastion() {
  const toast = useToast()
  const hostsQ = usePolling(() => api.hosts(), 5000)
  const polQ = usePolling(() => api.policy(), 6000)
  const [modal, setModal] = useState(null)
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(null)
  const hosts = hostsQ.data || []
  const bastion = hosts.find((h) => h.is_bastion) || null
  const bastionMode = !!polQ.data?.bastion_mode

  const act = async (id, fn, ok) => {
    setBusy(id)
    try { await fn(); ok && toast.success(ok); await hostsQ.refresh() } catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }
  const toggleMode = async () => {
    try { await api.setPolicy({ default_action: polQ.data.default_action, bastion_mode: !bastionMode }); toast.success(`Bastion mode ${!bastionMode ? 'enabled' : 'disabled'}.`); polQ.refresh() } catch (e) { toast.error(e.message) }
  }

  return (
    <>
      <PageHeader kicker="Defend" title="Hosts & bastion" subtitle="Register the machines in your simulated network and choose which one acts as the hardened entry point."
        actions={<><Button variant="ghost" icon="lock" onClick={toggleMode} disabled={!polQ.data}>{bastionMode ? 'Disable bastion mode' : 'Enable bastion mode'}</Button><Button variant="primary" icon="plus" onClick={() => setModal({ initial: null })}>Add host</Button></>} />
      {hostsQ.error && !hostsQ.data && <ErrorState error={hostsQ.error} onRetry={hostsQ.refresh} title="Hosts unavailable" />}

      <Panel title="Network topology" tone="accent"
        subtitle={bastionMode ? 'Bastion mode ON: the firewall only lets external traffic reach the bastion.' : 'Bastion mode OFF: external traffic is judged by rules alone and can reach internal hosts.'}
        actions={<Badge tone={bastionMode ? 'allow' : 'medium'} dot>{bastionMode ? 'BASTION ENFORCED' : 'NOT ENFORCED'}</Badge>}>
        {hostsQ.loading && !hostsQ.data ? <div className="hb-load"><Spinner size={24} /></div> : (
          <>
            <div className="hb-topo"><Topology hosts={hosts} bastion={bastion} bastionMode={bastionMode} /></div>
            <ul className="hb-key">
              <li><i className="k-solid" /> allowed path</li>
              <li><i className="k-dash" /> direct route (denied when bastion mode is on)</li>
              <li><i className="k-glow" /> bastion path</li>
            </ul>
          </>
        )}
      </Panel>

      <div className="hb-grid">
        <Panel title="Hosts" subtitle={`${hosts.length} registered`} pad={false} className="hb-hosts">
          {hostsQ.loading && !hostsQ.data ? <div className="hb-load"><Spinner size={24} /></div>
            : hosts.length === 0 ? <EmptyState icon="server" title="No hosts yet" hint="Add hosts or use Reseed in the top bar to load the default lab network." action={<Button variant="primary" icon="plus" onClick={() => setModal({ initial: null })}>Add host</Button>} />
              : (
                <Table>
                  <THead><TR><TH>Host</TH><TH>IP</TH><TH>Role</TH><TH style={{ textAlign: 'right' }}>Actions</TH></TR></THead>
                  <TBody>
                    {hosts.map((h) => (
                      <TR key={h.id}>
                        <TD><div className="hb-hname"><Icon name={ROLE_ICON[h.role] || 'server'} size={15} />{h.name}</div>{h.description && <div className="hb-hdesc">{h.description}</div>}</TD>
                        <TD><IpLink ip={h.ip} /></TD>
                        <TD>{h.is_bastion ? <Badge tone="accent" dot>BASTION</Badge> : <Badge tone={h.role === 'external' ? 'high' : 'neutral'}>{h.role}</Badge>}</TD>
                        <TD>
                          <div className="hb-act">
                            {h.is_bastion
                              ? <Button size="sm" variant="ghost" disabled={busy === h.id} onClick={() => act(h.id, () => api.clearBastion(), 'Bastion designation removed.')}>Remove bastion</Button>
                              : <Button size="sm" variant="ghost" icon="shield" disabled={busy === h.id || h.role === 'external'} title={h.role === 'external' ? 'External hosts cannot be the bastion' : undefined} onClick={() => act(h.id, () => api.setBastion(h.id), `${h.name} is now the bastion.`)}>Make bastion</Button>}
                            <Button size="sm" variant="subtle" icon="edit" aria-label={`Edit ${h.name}`} onClick={() => setModal({ initial: h })} />
                            <Button size="sm" variant="subtle" icon="trash" aria-label={`Delete ${h.name}`} onClick={() => setDel(h)} />
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
        </Panel>

        <Panel title="What is a bastion host?" tone="violet" className="hb-learn">
          <p>A <strong>bastion host</strong> is a deliberately exposed, heavily hardened server that is the <em>only</em> way in from an untrusted network. Everything else stays hidden behind the firewall, so attackers have one door to attack instead of many.</p>
          <h3>Hardening principles</h3>
          <ul className="hb-list">
            <li><Icon name="check" size={14} /><span><b>Minimal surface.</b> Run only the services it needs (usually SSH). Remove everything else.</span></li>
            <li><Icon name="check" size={14} /><span><b>Strong authentication.</b> Keys or MFA, no shared passwords, no root login.</span></li>
            <li><Icon name="check" size={14} /><span><b>Patch fast.</b> It faces the internet, so it gets updates first.</span></li>
            <li><Icon name="check" size={14} /><span><b>Log everything.</b> Every session is recorded and shipped off-box.</span></li>
            <li><Icon name="check" size={14} /><span><b>No trust by default.</b> It reaches internal hosts only on the ports required.</span></li>
          </ul>
          <p className="hb-try">Try it: set a bastion, turn bastion mode on, then run the <Code>bastion_bypass</Code> scenario on the Overview page and watch IDS-008 fire.</p>
        </Panel>
      </div>

      <HostModal open={!!modal} initial={modal?.initial} onClose={() => setModal(null)} onSaved={hostsQ.refresh} />
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete host?"
        footer={<><Button onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" icon="trash" onClick={async () => { const h = del; setDel(null); await act(h.id, () => api.deleteHost(h.id), `Deleted "${h.name}".`) }}>Delete</Button></>}>
        <p>Remove <strong>{del?.name}</strong> ({del?.ip}){del?.is_bastion ? ', the current bastion' : ''}?</p>
      </Modal>
    </>
  )
}
