import { useEffect, useRef, useState } from 'react'
import { formatAddress, parseAddress } from '../lib/address'

// Structured address entry that still stores a single, Maps-friendly string.
// We hold the broken-out fields internally and only re-seed them from `value`
// on a genuinely external change (opening the form to edit) — never while the
// user is typing, which would fight the cursor.
export default function AddressFields({ value, onChange }) {
  const [parts, setParts] = useState(() => parseAddress(value))
  const lastEmitted = useRef(value || '')

  useEffect(() => {
    if ((value || '') !== lastEmitted.current) {
      setParts(parseAddress(value))
      lastEmitted.current = value || ''
    }
  }, [value])

  const set = (key) => (e) => {
    const next = { ...parts, [key]: e.target.value }
    setParts(next)
    const str = formatAddress(next)
    lastEmitted.current = str
    onChange(str)
  }

  return (
    <div className="address-fields">
      <input value={parts.street} onChange={set('street')} placeholder="Street address" autoComplete="address-line1" />
      <div className="addr-row">
        <input value={parts.city} onChange={set('city')} placeholder="City" autoComplete="address-level2" />
        <input className="addr-state" value={parts.state} onChange={set('state')} placeholder="State" autoComplete="address-level1" />
      </div>
      <div className="addr-row">
        <input className="addr-zip" value={parts.zip} onChange={set('zip')} placeholder="ZIP / Postal" autoComplete="postal-code" />
        <input value={parts.country} onChange={set('country')} placeholder="Country" autoComplete="country-name" />
      </div>
    </div>
  )
}
