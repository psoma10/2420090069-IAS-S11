import { useEffect, useState } from 'react'

const CUSTOM = '__custom__'
const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}$/

export function isValidIp(v) {
  return IPV4.test(v) && v.split('.').every((n) => Number(n) <= 255)
}

/** Dropdown of known hosts plus a free-text IP option. value is always an IP string. */
export default function HostPicker({ label, value, onChange, hosts }) {
  const known = hosts.some((h) => h.ip === value)
  const [custom, setCustom] = useState(!known && !!value)
  useEffect(() => { if (known) setCustom(false) }, [known])
  const selectVal = custom || !known ? CUSTOM : value
  const invalid = custom && value && !isValidIp(value)
  return (
    <div className="tg-host">
      <label className="tg-label">{label}</label>
      <select
        className="ui-input ui-select"
        value={selectVal}
        aria-label={`${label} host`}
        onChange={(e) => {
          if (e.target.value === CUSTOM) { setCustom(true) } else { setCustom(false); onChange(e.target.value) }
        }}
      >
        {hosts.map((h) => (
          <option key={h.id} value={h.ip}>{h.name} ({h.ip}) {h.role}</option>
        ))}
        <option value={CUSTOM}>Custom IP...</option>
      </select>
      {(custom || !known) && (
        <input
          className="ui-input mono tg-host__custom"
          placeholder="e.g. 198.51.100.23"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          aria-label={`${label} custom IP`}
          aria-invalid={invalid || undefined}
        />
      )}
      {invalid && <div className="tg-err" role="alert">Not a valid IPv4 address</div>}
    </div>
  )
}
