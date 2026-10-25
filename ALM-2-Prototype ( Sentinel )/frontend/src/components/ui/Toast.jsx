import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import './ui.css'

const Ctx = createContext(null)
const ICON = { success: 'check', error: 'alert', info: 'info', warn: 'alert' }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const idRef = useRef(0)
  const dismiss = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const push = useCallback(({ tone = 'info', title, message, duration = 4200 }) => {
    const id = ++idRef.current
    setItems((l) => [...l.slice(-4), { id, tone, title, message }])
    if (duration) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])
  const api = useMemo(() => ({
    push,
    success: (message, title = 'Done') => push({ tone: 'success', title, message }),
    error: (message, title = 'Something went wrong') => push({ tone: 'error', title, message, duration: 7000 }),
  }), [push])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="ui-toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <Icon name={ICON[t.tone] || 'info'} size={18} />
            <div className="ui-toast__txt">
              {t.title && <strong>{t.title}</strong>}
              {t.message && <span>{t.message}</span>}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

const FALLBACK = { push: () => {}, success: () => {}, error: () => {} }
export function useToast() {
  return useContext(Ctx) || FALLBACK
}
