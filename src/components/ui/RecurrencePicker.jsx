import { useState } from 'react'
import Segmented from './Segmented'
import { WEEKDAYS_MIN, WEEKDAYS_SHORT, SETPOS_LABEL, nextOccurrence } from '../../lib/recurrence'
import { isoDateIn } from '../../lib/tasks'

const FREQS = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]
const SETPOS = [1, 2, 3, 4, -1]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

// Repeat-rule builder. Emits an RRULE-lite object (see lib/recurrence.js) or
// null. Defaults its day-of-month / weekday from the task's due date so "the
// 20th" / "first Monday" pre-fill sensibly.
export default function RecurrencePicker({ value, dueDate, onChange }) {
  const refIso = dueDate || isoDateIn(0)
  const ref = parseISO(refIso)
  const refDow = new Date(ref.y, ref.m, ref.d).getDay()

  const [s, setS] = useState(() => ({
    freq: value?.freq || 'never',
    interval: value?.interval || 1,
    weekdays: value?.weekdays || [refDow],
    monthlyMode: value?.setpos ? 'weekday' : 'date',
    monthday: value?.monthday || ref.d,
    setpos: value?.setpos || 1,
    weekday: value?.weekday ?? refDow,
    until: value?.until || '',
    // skips are managed elsewhere (the "Skip this one" action), but carry them
    // through so editing the rule here doesn't drop them.
    exdates: value?.exdates || null,
  }))

  const build = (st) => {
    const anchor = refIso
    let rule
    switch (st.freq) {
      case 'daily':
        rule = { freq: 'daily', interval: st.interval, anchor }
        break
      case 'weekly':
        rule = {
          freq: 'weekly',
          interval: st.interval,
          weekdays: st.weekdays.length ? st.weekdays : [refDow],
          anchor,
        }
        break
      case 'monthly':
        rule =
          st.monthlyMode === 'weekday'
            ? {
                freq: 'monthly',
                interval: st.interval,
                setpos: st.setpos,
                weekday: st.weekday,
                anchor,
              }
            : { freq: 'monthly', interval: st.interval, monthday: st.monthday, anchor }
        break
      case 'yearly':
        rule = { freq: 'yearly', interval: st.interval, month: ref.m, monthday: ref.d, anchor }
        break
      default:
        return null
    }
    if (st.until) rule.until = st.until
    if (st.exdates?.length) rule.exdates = st.exdates
    return rule
  }

  const update = (patch) => {
    const st = { ...s, ...patch }
    setS(st)
    onChange(build(st))
  }

  // First date the rule would land on (ignoring the end date) — used to floor the
  // "Ends" picker and to flag an end date set before the series even starts.
  const rule = s.freq !== 'never' ? build(s) : null
  const firstOcc = rule
    ? nextOccurrence({ ...rule, until: undefined }, refIso, { inclusive: true })
    : null
  const endsTooEarly = !!(s.until && firstOcc && s.until < firstOcc)

  const toggleWeekday = (w) => {
    const set = new Set(s.weekdays)
    set.has(w) ? set.delete(w) : set.add(w)
    update({ weekdays: [...set].sort((a, b) => a - b) })
  }

  const Interval = ({ unit }) => (
    <label className="rec-interval">
      Every
      <input
        type="number"
        min="1"
        value={s.interval}
        onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
      />
      {unit}
      {s.interval > 1 ? 's' : ''}
    </label>
  )

  return (
    <div>
      <select
        className="rec-select"
        value={s.freq}
        onChange={(e) => update({ freq: e.target.value })}
      >
        {FREQS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {s.freq === 'daily' && (
        <div className="rec-row">
          <Interval unit="day" />
        </div>
      )}

      {s.freq === 'weekly' && (
        <>
          <div className="weekday-row">
            {WEEKDAYS_MIN.map((d, i) => (
              <button
                type="button"
                key={i}
                className={`weekday-chip ${s.weekdays.includes(i) ? 'on' : ''}`}
                onClick={() => toggleWeekday(i)}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="rec-row">
            <Interval unit="week" />
          </div>
        </>
      )}

      {s.freq === 'monthly' && (
        <>
          <Segmented
            size="sm"
            value={s.monthlyMode}
            onChange={(v) => update({ monthlyMode: v })}
            options={[
              { value: 'date', label: 'On a day' },
              { value: 'weekday', label: 'On a weekday' },
            ]}
          />
          {s.monthlyMode === 'date' ? (
            <div className="rec-row">
              <span>On the</span>
              <select
                className="rec-select inline"
                value={s.monthday}
                onChange={(e) => update({ monthday: Number(e.target.value) })}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rec-row">
              <select
                className="rec-select inline"
                value={s.setpos}
                onChange={(e) => update({ setpos: Number(e.target.value) })}
              >
                {SETPOS.map((p) => (
                  <option key={p} value={p}>
                    {SETPOS_LABEL[p]}
                  </option>
                ))}
              </select>
              <select
                className="rec-select inline"
                value={s.weekday}
                onChange={(e) => update({ weekday: Number(e.target.value) })}
              >
                {WEEKDAYS_SHORT.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="rec-row">
            <Interval unit="month" />
          </div>
        </>
      )}

      {s.freq === 'yearly' && (
        <div className="rec-row muted" style={{ fontSize: 14 }}>
          On {MONTHS[ref.m]} {ref.d} each year
        </div>
      )}

      {s.freq !== 'never' && (
        <>
          <div className="rec-row">
            <span>Ends</span>
            <input
              type="date"
              className="rec-select inline"
              value={s.until}
              min={firstOcc || refIso}
              onChange={(e) => update({ until: e.target.value })}
              aria-label="End date (optional)"
            />
            {s.until ? (
              <button type="button" className="text-btn" onClick={() => update({ until: '' })}>
                Clear
              </button>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>
                never
              </span>
            )}
          </div>
          {endsTooEarly && (
            <div className="rec-row error-text" style={{ fontSize: 13 }}>
              Ends before the first occurrence — this won’t repeat.
            </div>
          )}
        </>
      )}
    </div>
  )
}
