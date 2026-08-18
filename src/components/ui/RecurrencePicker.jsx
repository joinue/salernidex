import { useEffect, useRef, useState } from 'react'
import Segmented from './Segmented'
import {
  WEEKDAYS_MIN,
  WEEKDAYS_SHORT,
  SETPOS_LABEL,
  firstOccurrence,
  describeRecurrence,
} from '../../lib/recurrence'
import { isoDateIn } from '../../lib/tasks'

// 'weekday' is a preset, not a frequency — it builds a weekly rule over Mon–Fri.
// It sits next to Daily because that's where people look for it.
const FREQS = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekday', label: 'Every weekday' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]
const WEEKDAY_SET = [1, 2, 3, 4, 5]
const SETPOS = [1, 2, 3, 4, -1]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const sameSet = (a = [], b = []) =>
  a.length === b.length &&
  [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join()

const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

// "Every N days/weeks/months/years". Declared at module scope, NOT inside the
// picker: a component defined in a render body is a brand-new type on every
// render, so React unmounted and remounted this input on each keystroke — the
// field lost focus after one character and every character after it went
// nowhere. "Every 12 days" was literally untypeable.
function Interval({ unit, value, onChange }) {
  return (
    <label className="rec-interval">
      Every
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
      />
      {unit}
      {value > 1 ? 's' : ''}
    </label>
  )
}

// Repeat-rule builder. Emits an RRULE-lite object (see lib/recurrence.js) or
// null. Defaults its day-of-month / weekday from the task's due date so "the
// 20th" / "first Monday" pre-fill sensibly.
export default function RecurrencePicker({ value, dueDate, onChange }) {
  const refIso = dueDate || isoDateIn(0)
  const ref = parseISO(refIso)
  const refDow = new Date(ref.y, ref.m, ref.d).getDay()

  const [s, setS] = useState(() => ({
    // An existing Mon–Fri weekly rule reads back as the preset it was made with.
    freq:
      value?.freq === 'weekly' && !(value.interval > 1) && sameSet(value.weekdays, WEEKDAY_SET)
        ? 'weekday'
        : value?.freq || 'never',
    // 'schedule' (calendar grid) | 'after' (interval from when it's checked off)
    mode: value?.mode === 'after_completion' ? 'after' : 'schedule',
    interval: value?.interval || 1,
    weekdays: value?.weekdays || [refDow],
    monthlyMode: value?.setpos ? 'weekday' : 'date',
    monthdays: value?.monthdays?.length ? value.monthdays : [value?.monthday || ref.d],
    setpos: value?.setpos || 1,
    weekday: value?.weekday ?? refDow,
    yearMonth: value?.month ?? ref.m,
    yearDay: value?.monthday || ref.d,
    // 'never' | 'on' (a date) | 'after' (N times)
    endMode: value?.count ? 'count' : value?.until ? 'on' : 'never',
    until: value?.until || '',
    count: value?.count || 5,
    // skips are managed elsewhere (the "Skip this one" action), but carry them
    // through so editing the rule here doesn't drop them.
    exdates: value?.exdates || null,
    done_count: value?.done_count || 0,
  }))

  const build = (st) => {
    const anchor = refIso
    const freq = st.freq === 'weekday' ? 'weekly' : st.freq
    if (freq === 'never') return null
    // An after-completion rule is just a frequency and an interval — there's no
    // grid, so weekday/month-day selections have nothing to attach to.
    let rule
    if (st.mode === 'after') {
      rule = { freq, interval: st.interval, mode: 'after_completion', anchor }
      if (st.done_count) rule.done_count = st.done_count
    } else {
      switch (freq) {
        case 'daily':
          rule = { freq: 'daily', interval: st.interval, anchor }
          break
        case 'weekly':
          rule = {
            freq: 'weekly',
            interval: st.freq === 'weekday' ? 1 : st.interval,
            weekdays: st.freq === 'weekday' ? WEEKDAY_SET : st.weekdays,
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
              : {
                  freq: 'monthly',
                  interval: st.interval,
                  monthdays: [...st.monthdays].sort((a, b) => a - b),
                  anchor,
                }
          break
        case 'yearly':
          rule = {
            freq: 'yearly',
            interval: st.interval,
            month: st.yearMonth,
            monthday: st.yearDay,
            anchor,
          }
          break
        default:
          return null
      }
      if (st.exdates?.length) rule.exdates = st.exdates
    }
    if (st.endMode === 'on' && st.until) rule.until = st.until
    if (st.endMode === 'count') rule.count = Math.max(1, st.count)
    return rule
  }

  const update = (patch) => {
    const st = { ...s, ...patch }
    setS(st)
    onChange(build(st))
  }

  // The rule's anchor — and, for a yearly rule, its month and day — are derived
  // from the due date at build time. Moving the due date afterwards used to
  // leave the stored rule pointing at the old one while this picker re-rendered
  // showing the new: set Yearly on Aug 5, change the due date to Mar 9, and the
  // form read "On Mar 9 each year" while saving "Every year on August 5".
  // Re-emit so what's shown is what's stored.
  const lastRef = useRef(refIso)
  useEffect(() => {
    if (lastRef.current === refIso) return
    lastRef.current = refIso
    if (s.freq !== 'never') onChange(build(s))
    // Deliberately keyed on the due date alone: `s`/`build`/`onChange` are read
    // for their current values, and adding them would re-fire this on every
    // keystroke — which is the update() path, not this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refIso])

  // First date the rule would land on (ignoring the end bound) — used to floor
  // the "Ends" picker and to flag an end date set before the series even starts.
  const rule = s.freq !== 'never' ? build(s) : null
  const firstOcc = rule
    ? firstOccurrence({ ...rule, until: undefined, count: undefined }, refIso)
    : null
  const endsTooEarly = !!(s.endMode === 'on' && s.until && firstOcc && s.until < firstOcc)

  // Turning the last day off would leave every chip dark while build() quietly
  // fell back to the due date's weekday — the picker showing one thing and the
  // saved rule meaning another. A weekly rule needs at least one day, so the
  // last one on stays on (this is what Apple does too).
  const toggleWeekday = (w) => {
    const set = new Set(s.weekdays)
    if (set.has(w)) {
      if (set.size === 1) return
      set.delete(w)
    } else set.add(w)
    update({ weekdays: [...set].sort((a, b) => a - b) })
  }

  // Same rule for days of the month: never let the selection empty out.
  const toggleMonthday = (n) => {
    const set = new Set(s.monthdays)
    if (set.has(n)) {
      if (set.size === 1) return
      set.delete(n)
    } else set.add(n)
    update({ monthdays: [...set].sort((a, b) => a - b) })
  }

  const interval = (unit) => (
    <Interval unit={unit} value={s.interval} onChange={(v) => update({ interval: v })} />
  )
  const afterCompletion = s.mode === 'after'
  // "Every weekday" fixes both the days and the interval, so neither control
  // has anything left to offer.
  const isPreset = s.freq === 'weekday'
  const unitFor = { daily: 'day', weekday: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }

  return (
    <div>
      <select
        className="rec-select"
        aria-label="How often this repeats"
        value={s.freq}
        onChange={(e) => update({ freq: e.target.value })}
      >
        {FREQS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Which clock the rule runs on. The difference only shows up when you're
          late — which is exactly when it matters — so the hint spells it out
          rather than leaving "After it's done" to be guessed at. */}
      {s.freq !== 'never' && !isPreset && (
        <>
          <Segmented
            size="sm"
            value={s.mode}
            onChange={(v) => update({ mode: v })}
            options={[
              { value: 'schedule', label: 'On a schedule' },
              { value: 'after', label: 'After it’s done' },
            ]}
          />
          <p className="rec-hint">
            {afterCompletion
              ? 'The clock restarts each time you check it off. Finish late and the next one moves with you.'
              : 'Lands on fixed dates whether or not you kept up.'}
          </p>
        </>
      )}

      {afterCompletion && !isPreset ? (
        <div className="rec-row">{interval(unitFor[s.freq] || 'day')}</div>
      ) : (
        <>
          {s.freq === 'daily' && <div className="rec-row">{interval('day')}</div>}

          {s.freq === 'weekly' && (
            <>
              <div className="weekday-row">
                {WEEKDAYS_MIN.map((d, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`weekday-chip ${s.weekdays.includes(i) ? 'on' : ''}`}
                    aria-pressed={s.weekdays.includes(i)}
                    aria-label={WEEKDAYS_SHORT[i]}
                    onClick={() => toggleWeekday(i)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="rec-row">{interval('week')}</div>
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
                // A grid, not a select: rent on the 1st *and* the 15th is one of
                // the most common monthly cadences there is, and a single-value
                // dropdown can't say it.
                <div className="monthday-grid" role="group" aria-label="Days of the month">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={`monthday-cell tap-target ${s.monthdays.includes(n) ? 'on' : ''}`}
                      aria-pressed={s.monthdays.includes(n)}
                      onClick={() => toggleMonthday(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rec-row">
                  <select
                    className="rec-select inline"
                    aria-label="Which week of the month"
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
                    aria-label="Day of the week"
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
              {s.monthdays.length > 1 && s.monthlyMode === 'date' && (
                <p className="rec-hint">
                  A day past the end of a short month lands on its last day.
                </p>
              )}
              <div className="rec-row">{interval('month')}</div>
            </>
          )}

          {/* Yearly seeds its month and day from the due date, but they're real
              controls — an anniversary and a due date aren't always the same. */}
          {s.freq === 'yearly' && (
            <>
              <div className="rec-row">
                <span>On</span>
                <select
                  className="rec-select inline"
                  aria-label="Month"
                  value={s.yearMonth}
                  onChange={(e) => update({ yearMonth: Number(e.target.value) })}
                >
                  {MONTHS_LONG.map((m, i) => (
                    <option key={i} value={i}>
                      {MONTHS[i]}
                    </option>
                  ))}
                </select>
                <select
                  className="rec-select inline"
                  aria-label="Day"
                  value={s.yearDay}
                  onChange={(e) => update({ yearDay: Number(e.target.value) })}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rec-row">{interval('year')}</div>
            </>
          )}
        </>
      )}

      {s.freq !== 'never' && (
        <>
          <div className="rec-row">
            <span>Ends</span>
            <select
              className="rec-select inline"
              aria-label="When the series ends"
              value={s.endMode}
              onChange={(e) => update({ endMode: e.target.value })}
            >
              <option value="never">Never</option>
              <option value="on">On a date</option>
              <option value="count">After…</option>
            </select>
            {s.endMode === 'on' && (
              <input
                type="date"
                className="rec-select inline"
                value={s.until}
                min={firstOcc || refIso}
                onChange={(e) => update({ until: e.target.value })}
                aria-label="End date"
              />
            )}
            {s.endMode === 'count' && (
              <label className="rec-interval">
                <input
                  type="number"
                  min="1"
                  value={s.count}
                  aria-label="Number of times"
                  onChange={(e) => update({ count: Math.max(1, Number(e.target.value) || 1) })}
                />
                {s.count > 1 ? 'times' : 'time'}
              </label>
            )}
          </div>
          {endsTooEarly && (
            <div className="rec-row error-text" style={{ fontSize: 13 }}>
              Ends before the first occurrence, so this won’t repeat.
            </div>
          )}
          {/* One plain-English read-back of the whole rule. With two clocks and
              three end modes, the controls alone no longer tell you what you
              built. */}
          {rule && <p className="rec-summary">{describeRecurrence(rule)}</p>}
        </>
      )}
    </div>
  )
}
