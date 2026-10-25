import Icon from './Icon.jsx'
import './ui.css'

export function PageHeader({ kicker, title, subtitle, actions }) {
  return (
    <header className="ui-pageheader">
      <div className="ui-pageheader__text">
        {kicker && <div className="ui-kicker">{kicker}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="ui-pageheader__actions">{actions}</div>}
    </header>
  )
}

export function Panel({ title, subtitle, actions, children, className = '', pad = true, tone, ...rest }) {
  return (
    <section className={`ui-panel ${tone ? `ui-panel--${tone}` : ''} ${className}`} {...rest}>
      {(title || actions) && (
        <div className="ui-panel__head">
          <div>
            {title && <h2 className="ui-panel__title">{title}</h2>}
            {subtitle && <div className="ui-panel__sub">{subtitle}</div>}
          </div>
          {actions && <div className="ui-panel__actions">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'ui-panel__body' : 'ui-panel__body ui-panel__body--flush'}>{children}</div>
    </section>
  )
}

export function Spinner({ size = 16, label = 'Loading' }) {
  return <span className="ui-spinner" role="status" aria-label={label} style={{ width: size, height: size }} />
}

export function Button({ variant = 'ghost', size = 'md', icon, loading, children, className = '', disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn--${variant} ui-btn--${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children != null && <span>{children}</span>}
    </button>
  )
}

export function Badge({ tone = 'neutral', dot, children, className = '' }) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`}>
      {dot && <i className="ui-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

const SEV_ICON = { low: 'info', medium: 'alert', high: 'flame', critical: 'zap' }
export function SeverityBadge({ severity }) {
  const s = (severity || 'low').toLowerCase()
  return (
    <Badge tone={s}>
      <Icon name={SEV_ICON[s] || 'info'} size={11} />
      {s.toUpperCase()}
    </Badge>
  )
}

export function StatTile({ label, value, sub, tone = 'accent', icon, children }) {
  return (
    <div className={`ui-stat ui-stat--${tone}`}>
      <div className="ui-stat__top">
        <span className="ui-stat__label">{label}</span>
        {icon && <Icon name={icon} size={16} className="ui-stat__icon" />}
      </div>
      <div className="ui-stat__value mono">{value}</div>
      {sub && <div className="ui-stat__sub">{sub}</div>}
      {children && <div className="ui-stat__slot">{children}</div>}
    </div>
  )
}

export function Code({ children, className = '' }) {
  return <code className={`ui-code ${className}`}>{children}</code>
}

export function EmptyState({ title, hint, icon = 'radar', action }) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__icon"><Icon name={icon} size={26} /></div>
      <div className="ui-empty__title">{title}</div>
      {hint && <div className="ui-empty__hint">{hint}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  )
}

/** Friendly inline error / offline notice with retry. */
export function ErrorState({ error, onRetry, title = 'Could not load data' }) {
  const msg = !error ? '' : (error.status === undefined ? 'The Sentinel backend is not reachable. Make sure it is running.' : error.message)
  return (
    <div className="ui-errstate" role="alert">
      <Icon name="alert" size={18} />
      <div><strong>{title}</strong><div>{msg}</div></div>
      {onRetry && <Button size="sm" icon="refresh" onClick={onRetry}>Retry</Button>}
    </div>
  )
}
