import { useState } from 'react'
import Modal from './Modal'
import Segmented from './Segmented'
import RecurrencePicker from './RecurrencePicker'
import IconPicker from './IconPicker'
import ColorPicker from './ColorPicker'
import { COLORS } from '../lib/colors'
import { describeRecurrence } from '../lib/recurrence'
import { focusOnDesktop } from '../lib/constants'
import { isSolo } from '../lib/household'

const POLARITIES = [
  { value: 'build', label: 'Build' },
  { value: 'limit', label: 'Limit' },
  { value: 'track', label: 'Track' },
]
const MEASURES = [
  { value: 'count', label: 'Count' },
  { value: 'binary', label: 'Yes / no' },
]
// index = Date.getDay() (0=Sun..6=Sat)
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const POLARITY_HINT = {
  build: 'Build — do more of a good thing. A day counts when you hit your goal.',
  limit: 'Limit — keep a habit down. A day counts when you stay at or under your cap.',
  track: 'Track — just log the number. No goal, no streak, just the trend.',
}

export default function HabitForm({ habit, onSave, onClose }) {
  const [form, setForm] = useState({
    name: habit?.name || '',
    icon: habit?.icon || '',
    shared: habit?.shared ?? false,
    polarity: habit?.polarity || 'build',
    measure: habit?.measure || 'count',
    unit: habit?.unit || '',
    target: habit?.target ?? '',
    track_streak: habit?.track_streak ?? true,
    freq: habit?.rrule ? 'custom' : habit?.weekly_target ? 'weekly' : 'days',
    active_days: habit?.active_days || [],
    weekly_target: habit?.weekly_target ?? 3,
    rule: habit?.rrule || null,
    color: habit?.color || COLORS[0],
    show_on_today: habit?.show_on_today ?? false,
    reminder_enabled: habit?.reminder_enabled ?? false,
    reminder_time: habit?.reminder_time ? habit.reminder_time.slice(0, 5) : '20:00',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const toggleDay = (d) =>
    setForm((f) => ({
      ...f,
      active_days: f.active_days.includes(d)
        ? f.active_days.filter((x) => x !== d)
        : [...f.active_days, d].sort((a, b) => a - b),
    }))

  const isTrack = form.polarity === 'track'
  // Track is always a plain number; only Build/Limit choose yes-no vs count.
  const isCount = isTrack || form.measure === 'count'

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Give the habit a name.')
      return
    }
    const custom = !isTrack && form.freq === 'custom'
    if (custom && !form.rule) {
      setError('Pick how this habit repeats.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let target = null
      if (!isTrack) {
        if (isCount) target = form.target === '' ? null : Number(form.target)
        else target = form.polarity === 'limit' ? 0 : 1 // binary implies 1/0
      }
      const weekly = !isTrack && form.freq === 'weekly'
      await onSave(
        {
          name: form.name.trim(),
          polarity: form.polarity,
          measure: isTrack ? 'count' : form.measure,
          unit: isCount ? form.unit.trim() || null : null,
          target,
          track_streak: isTrack ? false : form.track_streak,
          // rrule overrides the other two modes; the unused ones are cleared so
          // a habit only ever carries one schedule.
          rrule: custom ? form.rule : null,
          weekly_target: weekly ? Math.max(1, Math.min(7, Number(form.weekly_target) || 1)) : null,
          active_days: weekly || custom ? [] : form.active_days,
          icon: form.icon || null,
          shared: form.shared,
          color: form.color,
          show_on_today: form.show_on_today,
          reminder_enabled: form.reminder_enabled,
          reminder_time: form.reminder_enabled ? form.reminder_time : null,
        },
        habit?.id,
      )
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const targetLabel = form.polarity === 'limit' ? 'Daily limit (at most)' : 'Daily goal (at least)'

  return (
    <Modal title={habit?.id ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}

        <div className="field">
          <label className="label">Name</label>
          <input
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            required
            autoFocus={focusOnDesktop()}
            placeholder="Workouts"
          />
        </div>

        <div className="field">
          <label className="label">Icon</label>
          <IconPicker
            value={form.icon}
            onChange={set('icon')}
            leading={
              <button
                type="button"
                className={`icon-pick letter ${form.icon ? '' : 'on'}`}
                style={{ '--c': form.color }}
                onClick={() => set('icon')('')}
                aria-label="No icon (use first letter)"
              >
                {form.name.trim().slice(0, 1).toUpperCase() || 'A'}
              </button>
            }
          />
        </div>

        <div className="field">
          <label className="label">Color</label>
          <ColorPicker value={form.color} onChange={set('color')} />
        </div>

        <div className="field">
          <label className="label">Type</label>
          <Segmented value={form.polarity} onChange={set('polarity')} options={POLARITIES} />
          <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
            {POLARITY_HINT[form.polarity]}
          </p>
        </div>

        {!isTrack && (
          <div className="field">
            <label className="label">Measure</label>
            <Segmented value={form.measure} onChange={set('measure')} options={MEASURES} />
          </div>
        )}

        {isCount && (
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Unit</label>
              <input
                value={form.unit}
                onChange={(e) => set('unit')(e.target.value)}
                placeholder={form.polarity === 'limit' ? 'drinks' : 'glasses'}
              />
            </div>
            {!isTrack && (
              <div className="field" style={{ flex: 1 }}>
                <label className="label">{targetLabel}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.target}
                  onChange={(e) => set('target')(e.target.value)}
                  placeholder={form.polarity === 'limit' ? '2' : '8'}
                />
              </div>
            )}
          </div>
        )}

        {!isTrack && (
          <div className="field">
            <label className="label">Frequency</label>
            <Segmented
              value={form.freq}
              onChange={set('freq')}
              options={[
                { value: 'days', label: 'Days' },
                { value: 'weekly', label: 'Per week' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </div>
        )}

        {isTrack || form.freq === 'days' ? (
          <div className="field">
            <label className="label">Active days</label>
            <div className="weekday-picker">
              {DOW.map((d, i) => (
                <button
                  type="button"
                  key={i}
                  className={`weekday ${form.active_days.length === 0 || form.active_days.includes(i) ? 'on' : ''}`}
                  onClick={() => toggleDay(i)}
                  aria-pressed={form.active_days.includes(i)}
                  aria-label={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              {form.active_days.length === 0 || form.active_days.length === 7
                ? 'Every day.'
                : 'Off-days don’t count against the streak.'}
            </p>
          </div>
        ) : form.freq === 'weekly' ? (
          <div className="field">
            <label className="label">Times per week</label>
            <div className="weekly-stepper">
              <button
                type="button"
                className="habit-step-btn"
                onClick={() => set('weekly_target')(Math.max(1, Number(form.weekly_target) - 1))}
                aria-label="Fewer"
              >
                −
              </button>
              <span className="weekly-count">{form.weekly_target}×</span>
              <button
                type="button"
                className="habit-step-btn"
                onClick={() => set('weekly_target')(Math.min(7, Number(form.weekly_target) + 1))}
                aria-label="More"
              >
                +
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Hit it any {form.weekly_target} days a week — the streak counts whole weeks.
            </p>
          </div>
        ) : (
          <div className="field">
            <label className="label">Repeats</label>
            <RecurrencePicker
              value={form.rule}
              dueDate={habit?.rrule?.anchor || habit?.created_at?.slice(0, 10)}
              onChange={set('rule')}
            />
            <p className="muted" style={{ fontSize: 13 }}>
              {form.rule
                ? `${describeRecurrence(form.rule)} — the streak counts each time it’s due.`
                : 'Repeat every few days, monthly, or yearly. Off-days don’t count against the streak.'}
            </p>
          </div>
        )}

        {!isTrack && (
          <div className="field toggle-field">
            <div>
              <label className="label" style={{ marginBottom: 2 }}>
                Track streak
              </label>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Count consecutive good days.
              </p>
            </div>
            <button
              type="button"
              className={`switch ${form.track_streak ? 'on' : ''}`}
              role="switch"
              aria-checked={form.track_streak}
              onClick={() => set('track_streak')(!form.track_streak)}
            >
              <span className="knob" />
            </button>
          </div>
        )}

        {!isSolo() && (
          <div className="field toggle-field">
            <div>
              <label className="label" style={{ marginBottom: 2 }}>
                Share with household
              </label>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Let the rest of your household see this habit and its streak.
              </p>
            </div>
            <button
              type="button"
              className={`switch ${form.shared ? 'on' : ''}`}
              role="switch"
              aria-checked={form.shared}
              onClick={() => set('shared')(!form.shared)}
            >
              <span className="knob" />
            </button>
          </div>
        )}

        <div className="field toggle-field">
          <div>
            <label className="label" style={{ marginBottom: 2 }}>
              Show on Today
            </label>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Pin to the Today screen for quick logging.
            </p>
          </div>
          <button
            type="button"
            className={`switch ${form.show_on_today ? 'on' : ''}`}
            role="switch"
            aria-checked={form.show_on_today}
            onClick={() => set('show_on_today')(!form.show_on_today)}
          >
            <span className="knob" />
          </button>
        </div>

        <div className="field toggle-field">
          <div>
            <label className="label" style={{ marginBottom: 2 }}>
              Reminder
            </label>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              A daily nudge to log this habit.
            </p>
          </div>
          <button
            type="button"
            className={`switch ${form.reminder_enabled ? 'on' : ''}`}
            role="switch"
            aria-checked={form.reminder_enabled}
            onClick={() => set('reminder_enabled')(!form.reminder_enabled)}
          >
            <span className="knob" />
          </button>
        </div>
        {form.reminder_enabled && (
          <div className="field">
            <input
              type="time"
              value={form.reminder_time}
              onChange={(e) => set('reminder_time')(e.target.value)}
            />
          </div>
        )}

        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : habit?.id ? 'Save habit' : 'Create habit'}
        </button>
      </form>
    </Modal>
  )
}
