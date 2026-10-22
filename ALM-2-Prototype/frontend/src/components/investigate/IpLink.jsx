import { Link } from 'react-router-dom'
import './investigate.css'

/** Subtle link from an IP address to its investigation page. Renders a dash for empty values. */
export default function IpLink({ ip, className = '', children }) {
  if (!ip) return <span className={className}>-</span>
  return (
    <Link
      to={`/investigate/${encodeURIComponent(ip)}`}
      className={`ip-link mono ${className}`}
      onClick={(e) => e.stopPropagation()}
      title={`Investigate ${ip}`}
    >
      {children || ip}
    </Link>
  )
}
