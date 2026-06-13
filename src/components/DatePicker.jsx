import { useEffect, useRef, useState } from 'react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad = (n) => String(n).padStart(2, '0')

function parse(value) {
  if (!value || typeof value !== 'string') return { y: '', m: '', d: '' }
  const [y, m, d] = value.split('-')
  return { y: y || '', m: m ? String(Number(m)) : '', d: d ? String(Number(d)) : '' }
}

// month is 1-12; day 0 of the next month is the last day of this one.
function daysInMonth(y, m) {
  if (!m) return 31
  return new Date(Number(y) || 2000, Number(m), 0).getDate()
}

// Month / Day / Year selects that read & write an ISO `YYYY-MM-DD` string —
// a drop-in for `<input type="date">`. Built for dates that reach far back
// (birthdays, anniversaries), where the native picker buries the year and
// commits a day before you mean to. Emits '' until all three are chosen;
// callers treat '' as "no date".
export default function DatePicker({ value, onChange, fromYear = 1900, toYear, required = false }) {
  const [parts, setParts] = useState(() => parse(value))
  const lastEmitted = useRef(value || '')

  // Re-seed only on a genuinely external change (e.g. opening to edit), never
  // from the '' we ourselves emit while the user is still picking.
  useEffect(() => {
    if ((value || '') !== lastEmitted.current) {
      setParts(parse(value))
      lastEmitted.current = value || ''
    }
  }, [value])

  const maxYear = toYear ?? new Date().getFullYear()
  const years = []
  for (let yr = maxYear; yr >= fromYear; yr--) years.push(yr)
  const dim = daysInMonth(parts.y, parts.m)

  const update = (patch) => {
    const next = { ...parts, ...patch }
    // Clamp the day if the new month/year is shorter (e.g. 31 → Feb).
    if (next.d && Number(next.d) > daysInMonth(next.y, next.m)) {
      next.d = String(daysInMonth(next.y, next.m))
    }
    setParts(next)
    const iso = next.y && next.m && next.d ? `${next.y}-${pad(next.m)}-${pad(next.d)}` : ''
    lastEmitted.current = iso
    onChange(iso)
  }

  return (
    <div className="date-picker">
      <select className="dp-month" value={parts.m} onChange={(e) => update({ m: e.target.value })} required={required}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i} value={i + 1}>{name}</option>
        ))}
      </select>
      <select className="dp-day" value={parts.d} onChange={(e) => update({ d: e.target.value })} required={required}>
        <option value="">Day</option>
        {Array.from({ length: dim }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <select className="dp-year" value={parts.y} onChange={(e) => update({ y: e.target.value })} required={required}>
        <option value="">Year</option>
        {years.map((yr) => (
          <option key={yr} value={yr}>{yr}</option>
        ))}
      </select>
    </div>
  )
}
