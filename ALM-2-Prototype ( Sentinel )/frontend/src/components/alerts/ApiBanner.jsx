import { Button } from '../ui/index.js'
import '../traffic/traffic.css'

/** Friendly banner shown when the backend is unreachable. */
export default function ApiBanner({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="ap-banner" role="alert">
      <div>
        <b>Cannot reach the Sentinel backend.</b>
        <span> {error.message || 'Request failed'}. Start the backend with <code className="mono">start-all</code>; this page will recover on its own.</span>
      </div>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  )
}
