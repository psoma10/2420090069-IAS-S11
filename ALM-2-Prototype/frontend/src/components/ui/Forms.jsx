import { useId, cloneElement, isValidElement, forwardRef } from 'react'
import './ui.css'

export function Field({ label, hint, error, children }) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  const child = isValidElement(children)
    ? cloneElement(children, { id: children.props.id || id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children
  const forId = isValidElement(children) ? children.props.id || id : id
  return (
    <div className={`ui-field ${error ? 'ui-field--error' : ''}`}>
      {label && <label className="ui-field__label" htmlFor={forId}>{label}</label>}
      {child}
      {error ? <div className="ui-field__error" id={`${id}-err`} role="alert">{error}</div>
        : hint ? <div className="ui-field__hint" id={`${id}-hint`}>{hint}</div> : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ className = '', mono, ...rest }, ref) {
  return <input ref={ref} className={`ui-input ${mono ? 'mono' : ''} ${className}`} {...rest} />
})

export const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return <select ref={ref} className={`ui-input ui-select ${className}`} {...rest}>{children}</select>
})

export function Toggle({ checked, onChange, label, ariaLabel, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={!!checked} aria-label={label || ariaLabel}
      disabled={disabled}
      className={`ui-toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange && onChange(!checked)}
    >
      <span className="ui-toggle__knob" />
      {label && <span className="ui-toggle__label">{label}</span>}
    </button>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="ui-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key} role="tab" type="button" aria-selected={value === t.key}
          className={`ui-tab ${value === t.key ? 'is-active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className="ui-tab__count mono">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
