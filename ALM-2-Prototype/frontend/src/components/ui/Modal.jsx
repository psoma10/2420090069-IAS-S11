import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import './ui.css'

export default function Modal({ open, title, onClose, children, footer, width = 520 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose() }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button:not([disabled]),input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      const el = ref.current && ref.current.querySelector('input,select,textarea')
      ;(el || ref.current)?.focus()
    }, 30)
    const ov = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      document.body.style.overflow = ov
      prev && prev.focus && prev.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="ui-modal__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }} ref={ref} tabIndex={-1}>
        <div className="ui-modal__head">
          <h2>{title}</h2>
          <button type="button" className="ui-modal__close" onClick={onClose} aria-label="Close dialog"><Icon name="x" size={16} /></button>
        </div>
        <div className="ui-modal__body">{children}</div>
        {footer && <div className="ui-modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
