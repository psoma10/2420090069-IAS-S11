import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ui/index.js'
import './palette.css'

const RECENT_KEY = 'sentinel.palette.recent'
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

function loadRecent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function saveRecent(id) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...loadRecent().filter((x) => x !== id)].slice(0, 5))) } catch { /* ignore */ }
}

/** Higher = better; 0 = no match. Substring beats subsequence; earlier / word-start beats later. */
function score(q, text) {
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i >= 0) return 1000 - i * 5 + (i === 0 || t[i - 1] === ' ' ? 200 : 0) - t.length
  let k = 0
  let gaps = 0
  for (let j = 0; j < t.length && k < q.length; j++) {
    if (t[j] === q[k]) k++
    else if (k > 0) gaps++
  }
  return k === q.length ? 300 - gaps : 0
}

export function looksLikeIPv4(s) { return IPV4.test(s.trim()) }

/**
 * entries: [{ id, group, label, hint?, icon?, keywords?, run(ctx) }]
 * onClose(entry?) is called with the chosen entry (or nothing when dismissed).
 */
export default function CommandPalette({ open, onClose, entries }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const returnTo = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    returnTo.current = document.activeElement
    setQuery('')
    setActive(0)
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    const ov = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current() } }
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('keydown', onEsc)
      clearTimeout(t)
      document.body.style.overflow = ov
      const el = returnTo.current
      if (el && el.focus && document.contains(el)) el.focus()
    }
  }, [open])

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ip = query.trim()
    const extra = looksLikeIPv4(ip)
      ? [{ id: `investigate:${ip}`, group: 'Investigate', label: `Investigate ${ip}`, hint: 'Open IP profile', icon: 'search', run: ({ navigate }) => navigate(`/investigate/${ip}`) }]
      : []
    let list
    if (q) {
      list = entries
        .map((e) => ({ e, s: Math.max(score(q, e.label), score(q, `${e.group} ${e.label}`) - 50, e.keywords ? score(q, e.keywords) - 100 : 0) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.e)
      list = [...extra, ...list]
    } else {
      const recent = loadRecent().map((id) => entries.find((e) => e.id === id)).filter(Boolean)
      list = [...extra, ...recent.map((e) => ({ ...e, group: 'Recent', _k: `r:${e.id}` })), ...entries]
    }
    const groups = []
    list.forEach((e) => {
      let g = groups.find((x) => x.name === e.group)
      if (!g) { g = { name: e.group, items: [] }; groups.push(g) }
      g.items.push(e)
    })
    let n = 0
    return groups.map((g) => ({ ...g, items: g.items.map((e) => ({ ...e, idx: n++ })) }))
  }, [query, entries])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, flat])

  if (!open) return null

  const choose = (e) => {
    if (!e) return
    if (!e.id.startsWith('investigate:')) saveRecent(e.id)
    onClose(e)
  }
  const onKeyDown = (ev) => {
    if (ev.key === 'Escape') { /* handled by the document listener */ }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => (flat.length ? (a + 1) % flat.length : 0)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0)) }
    else if (ev.key === 'Home') { ev.preventDefault(); setActive(0) }
    else if (ev.key === 'End') { ev.preventDefault(); setActive(Math.max(0, flat.length - 1)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); choose(flat[active]) }
    else if (ev.key === 'Tab') { ev.preventDefault(); inputRef.current?.focus() } // focus trap: the input is the only tab stop
  }

  const optId = (i) => `cp-opt-${i}`
  return createPortal(
    <div className="cp__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cp" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="cp__search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef} className="cp__input" type="text" role="combobox" autoComplete="off" spellCheck={false}
            aria-expanded="true" aria-controls="cp-list" aria-autocomplete="list" aria-label="Search pages and actions"
            aria-activedescendant={flat.length ? optId(active) : undefined}
            placeholder="Search pages, actions, or type an IP address..."
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="cp__kbd" aria-hidden="true">Esc</kbd>
        </div>
        <div className="cp__list" id="cp-list" role="listbox" aria-label="Results" ref={listRef}>
          {flat.length === 0 && <div className="cp__empty" role="presentation">No matches for &ldquo;{query}&rdquo;</div>}
          {sections.map((s) => (
            <div role="group" aria-labelledby={`cp-g-${s.name}`} key={s.name}>
              <div className="cp__group" id={`cp-g-${s.name}`} role="presentation">{s.name}</div>
              {s.items.map((e) => (
                <div
                  key={e._k || e.id} id={optId(e.idx)} role="option" aria-selected={e.idx === active}
                  className={`cp__item ${e.idx === active ? 'is-active' : ''}`}
                  onMouseMove={() => active !== e.idx && setActive(e.idx)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => choose(e)}
                >
                  <Icon name={e.icon || 'chevron'} size={16} />
                  <span className="cp__label">{e.label}</span>
                  {e.hint && <span className="cp__hint">{e.hint}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="cp__foot" aria-hidden="true">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
          <span><kbd>Enter</kbd> select</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
