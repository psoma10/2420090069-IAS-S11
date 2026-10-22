import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client.js'
import { usePolling } from '../../hooks/usePolling.js'
import { useLiveStatus } from '../../hooks/useEvents.js'
import { Icon, Button, Modal, Spinner, ToastProvider, useToast } from '../ui/index.js'
import CommandPalette from '../palette/CommandPalette.jsx'
import { useTheme } from './theme.js'
import './Shell.css'

const NAV = [
  { group: 'Monitor', items: [
    { to: '/', label: 'Overview', icon: 'activity', end: true, key: 'o' },
    { to: '/alerts', label: 'Alerts', icon: 'bell', key: 'a', alerts: true },
    { to: '/anomaly', label: 'Anomaly', icon: 'radar', key: 'n' },
    { to: '/investigate', label: 'Investigate', icon: 'search', key: 'v' },
  ] },
  { group: 'Defend', items: [
    { to: '/firewall', label: 'Firewall', icon: 'flame', key: 'f' },
    { to: '/hosts', label: 'Hosts & Bastion', icon: 'server', key: 'h' },
    { to: '/ids-rules', label: 'Detection Rules', icon: 'target', key: 'r' },
  ] },
  { group: 'Simulate', items: [
    { to: '/traffic', label: 'Traffic Generator', icon: 'zap', key: 't' },
    { to: '/lab', label: 'Guided Labs', icon: 'flask', key: 'l' },
  ] },
  { group: 'Learn', items: [
    { to: '/encyclopedia', label: 'Threat Encyclopedia', icon: 'book', key: 'e' },
    { to: '/about', label: 'About', icon: 'info', key: 'i' },
  ] },
  { group: 'System', items: [
    { to: '/settings', label: 'Settings', icon: 'settings', key: 's' },
  ] },
]
const FLAT = NAV.flatMap((g) => g.items)
const LIVE_LABEL = { live: ['Live', 'Streaming updates'], polling: ['Polling', 'Stream unavailable'], offline: ['Offline', 'Backend unreachable'], connecting: ['Connecting', 'Opening stream'] }
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

function titleFor(path) {
  const hit = FLAT.find((i) => (i.end ? path === i.to : path === i.to || path.startsWith(`${i.to}/`)))
  return hit ? hit.label : 'Not found'
}

function BrandMark() {
  return (
    <svg className="brandmark" viewBox="0 0 48 48" width="38" height="38" aria-hidden="true">
      <path d="M24 3l17 7v12c0 11-7 18-17 23C14 40 7 33 7 22V10z" className="bm-shield" />
      <circle cx="24" cy="23" r="9" className="bm-ring" />
      <circle cx="24" cy="23" r="4.5" className="bm-ring" />
      <g className="bm-sweep"><path d="M24 23L24 14A9 9 0 0 1 32 18.5z" className="bm-wedge" /></g>
      <circle cx="29.5" cy="19" r="1.4" className="bm-blip" />
    </svg>
  )
}

function Frame() {
  const loc = useLocation()
  const nav = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'reset' | 'seed'
  const [busy, setBusy] = useState(false)
  const health = usePolling(() => api.health(), 5000, [], { relax: false }) // liveness probe: never relaxed by the event stream
  const sum = usePolling(() => api.summary(), 4000)
  const online = !!health.data && !health.error
  const unacked = sum.data?.alerts_unacked ?? 0
  const chord = useRef(0)
  const [palette, setPalette] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()
  const live = useLiveStatus()

  useEffect(() => {
    setOpen(false)
    if (loc.pathname.startsWith('/encyclopedia')) { try { localStorage.setItem('sentinel.visited.learn', '1') } catch { /* ignore */ } }
  }, [loc.pathname])

  useEffect(() => {
    if (!open) return undefined
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return }
      const t = e.target
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (chord.current && Date.now() - chord.current < 1200) {
        const hit = FLAT.find((i) => i.key === e.key.toLowerCase())
        chord.current = 0
        if (hit) { e.preventDefault(); nav(hit.to) }
      } else if (e.key === 'g') chord.current = Date.now()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const doAction = async () => {
    setBusy(true)
    try {
      if (confirm === 'reset') await api.reset(true)
      else await api.seed()
      toast.success(confirm === 'reset' ? 'Packets, alerts and stats cleared. Rules and hosts kept.' : 'Default hosts, rules and baseline traffic restored.', confirm === 'reset' ? 'Simulation reset' : 'Reseeded')
      window.dispatchEvent(new CustomEvent('sentinel:reset'))
      sum.refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const entries = useMemo(() => [
    ...NAV.flatMap((g) => g.items.map((i) => ({ id: `nav:${i.to}`, group: 'Pages', label: i.label, hint: `g ${i.key}`, icon: i.icon, keywords: g.group, run: ({ navigate }) => navigate(i.to) }))),
    { id: 'act:seed', group: 'Actions', label: 'Reseed default data', icon: 'download', keywords: 'restore defaults', run: ({ ask }) => ask('seed') },
    { id: 'act:reset', group: 'Actions', label: 'Reset simulation', icon: 'refresh', keywords: 'clear packets alerts', run: ({ ask }) => ask('reset') },
    { id: 'act:theme', group: 'Actions', label: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', icon: theme === 'light' ? 'moon' : 'sun', keywords: 'appearance mode', run: ({ toggleTheme: t }) => t() },
  ], [theme])
  const closePalette = useCallback((entry) => {
    setPalette(false)
    if (entry) setTimeout(() => entry.run({ navigate: nav, ask: setConfirm, toggleTheme }), 0)
  }, [nav, toggleTheme])
  const liveKey = !health.loading && !online ? 'offline' : live
  const [liveT, liveS] = LIVE_LABEL[liveKey] || LIVE_LABEL.connecting

  return (
    <div className="shell">
      <a href="#main" className="skip">Skip to content</a>
      <aside id="primary-nav" className={`side ${open ? 'is-open' : ''}`} aria-label="Primary">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand__name">SENTINEL</div>
            <div className="brand__tag">IDS &amp; Firewall Simulator</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((g) => (
            <div className="nav__group" key={g.group}>
              <div className="nav__label">{g.group}</div>
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav__item ${isActive ? 'is-active' : ''}`}>
                  <Icon name={i.icon} size={17} />
                  <span>{i.label}</span>
                  {i.alerts && unacked > 0 && <b className="nav__count" aria-label={`${unacked} unacknowledged alerts`}>{unacked > 99 ? '99+' : unacked}</b>}
                  <kbd className="nav__key" aria-hidden="true">g {i.key}</kbd>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side__foot">
          <div className={`status ${online ? 'is-on' : 'is-off'}`}>
            <i className="status__dot" aria-hidden="true" />
            <div>
              <div className="status__t">{online ? 'Backend online' : health.loading ? 'Connecting...' : 'Backend offline'}</div>
              <div className="status__s mono">{online ? `v${health.data.version ?? '?'} · up ${Math.round((health.data.uptime_seconds || 0) / 60)}m` : 'Not connected'}</div>
            </div>
          </div>
          <div className={`livechip is-${liveKey}`} role="status" aria-label={`Event stream: ${liveT}`} title={liveS}>
            <i className="livechip__dot" aria-hidden="true" /> {liveT}
            <span className="livechip__s">{liveS}</span>
          </div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="main">
        <header className="topbar">
          <button type="button" className="burger" aria-label="Toggle navigation" aria-controls="primary-nav" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Icon name="menu" size={20} />
          </button>
          <div className="crumb"><span>Sentinel</span><Icon name="chevron" size={12} /><b>{titleFor(loc.pathname)}</b></div>
          <div className="topbar__sp" />
          <button type="button" className="cp-trigger" onClick={() => setPalette(true)} aria-label="Search pages and actions" aria-keyshortcuts="Control+K Meta+K">
            <Icon name="search" size={15} /><span>Search&hellip;</span><kbd aria-hidden="true">{isMac ? '\u2318K' : 'Ctrl K'}</kbd>
          </button>
          <button type="button" className="cp-iconbtn" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} title="Toggle theme">
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
          </button>
          <Button size="sm" variant="subtle" icon="download" onClick={() => setConfirm('seed')} disabled={!online}>Reseed</Button>
          <Button size="sm" variant="danger" icon="refresh" onClick={() => setConfirm('reset')} disabled={!online}>Reset simulation</Button>
        </header>
        {!online && !health.loading && (
          <div className="offline" role="alert">
            <Icon name="alert" size={16} />
            <span>Cannot reach the Sentinel backend. Data will appear as soon as it is back.</span>
            <Button size="sm" icon="refresh" onClick={() => { health.refresh(); sum.refresh() }}>Retry</Button>
          </div>
        )}
        <main id="main" className="content" tabIndex={-1}>
          <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}><Spinner size={28} label="Loading page" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={palette} onClose={closePalette} entries={entries} />
      <Modal
        open={!!confirm} onClose={() => !busy && setConfirm(null)}
        title={confirm === 'reset' ? 'Reset the simulation?' : 'Reseed default data?'}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
          <Button variant={confirm === 'reset' ? 'danger' : 'primary'} loading={busy} onClick={doAction}>{confirm === 'reset' ? 'Reset' : 'Reseed'}</Button>
        </>}
      >
        {confirm === 'reset'
          ? <p>This clears all captured packets, alerts and statistics. Your firewall rules and hosts are kept.</p>
          : <p>This seeds the default hosts, firewall rules and baseline traffic. Use it to get back to a known-good lab state.</p>}
      </Modal>
    </div>
  )
}

export default function Shell() {
  return <ToastProvider><Frame /></ToastProvider>
}
