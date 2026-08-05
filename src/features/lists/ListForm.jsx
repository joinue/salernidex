import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import PrivacyField from '../../components/ui/PrivacyField'
import Segmented from '../../components/ui/Segmented'
import { focusOnDesktop } from '../../lib/constants'
import { isSolo } from '../../lib/household'
import { PRIVATE_LEVEL } from '../../lib/privacy'
import { isoDateIn } from '../../lib/tasks'
import IconPicker from '../../components/ui/IconPicker'
import ColorPicker from '../../components/ui/ColorPicker'
import { COLORS } from '../../lib/colors'

const KIND_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'grocery', label: 'Grocery' },
]

// Create or edit a list (name + an emoji icon for quick recognition). An
// optional due date puts the list on Today; an optional reminder time fires a
// push on the due date (mirrors habits' reminder_time/reminder_enabled).
export default function ListForm({ list, onSave, onClose, defaultPrivacy = 'family_shared' }) {
  const [name, setName] = useState(list?.name || '')
  const [kind, setKind] = useState(list?.kind || 'standard')
  const [icon, setIcon] = useState(list?.icon || '🛒')
  const [color, setColor] = useState(list?.color || COLORS[0])
  const [privacy, setPrivacy] = useState(
    list?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
  )
  const [dueDate, setDueDate] = useState(list?.due_date || '')
  const [reminderEnabled, setReminderEnabled] = useState(list?.reminder_enabled ?? false)
  const [reminderTime, setReminderTime] = useState(
    list?.reminder_time ? list.reminder_time.slice(0, 5) : '09:00',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // A reminder needs a date to fire on; drop it if the date was cleared.
      const remind = !!dueDate && reminderEnabled
      await onSave(
        {
          name,
          icon,
          color,
          // kind is fixed at creation — a list's grouping model can't flip later
          // without re-filing every item, so we only send it on a new list.
          ...(list ? {} : { kind }),
          privacy_level: privacy,
          due_date: dueDate || null,
          reminder_enabled: remind,
          reminder_time: remind ? reminderTime : null,
        },
        list?.id,
      )
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={list ? 'Edit list' : 'New list'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus={focusOnDesktop()}
            placeholder="Groceries, packing, …"
          />
        </div>

        {/* Type is chosen once, at creation — a grocery list groups by aisle, a
            standard list by hand-made sections. Editing a list can't flip it. */}
        {!list && (
          <div className="field">
            <label className="label">Type</label>
            <Segmented
              options={KIND_OPTIONS}
              value={kind}
              onChange={(v) => {
                setKind(v)
                if (v === 'grocery') setIcon('🛒')
              }}
            />
            <p className="muted" style={{ fontSize: 13, margin: '6px 2px 0' }}>
              {kind === 'grocery'
                ? 'Items sort into aisles automatically.'
                : 'A plain checklist you can split into sections.'}
            </p>
          </div>
        )}
        <div className="field">
          <label className="label">Icon</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <div className="field">
          <label className="label">Color</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className="field">
          <label className="label">Due date</label>
          <div className="due-row">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date (optional)"
            />
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            <button type="button" className="chip accent" onClick={() => setDueDate(isoDateIn(0))}>
              Today
            </button>
            <button type="button" className="chip accent" onClick={() => setDueDate(isoDateIn(1))}>
              Tomorrow
            </button>
            <button type="button" className="chip accent" onClick={() => setDueDate(isoDateIn(7))}>
              Next week
            </button>
            {dueDate && (
              <button type="button" className="chip" onClick={() => setDueDate('')}>
                Clear
              </button>
            )}
          </div>
        </div>

        {dueDate && (
          <>
            <div className="field toggle-field">
              <div>
                <label className="label" style={{ marginBottom: 2 }}>
                  Reminder
                </label>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  A push on the due date.
                </p>
              </div>
              <button
                type="button"
                className={`switch ${reminderEnabled ? 'on' : ''}`}
                role="switch"
                aria-checked={reminderEnabled}
                onClick={() => setReminderEnabled(!reminderEnabled)}
              >
                <span className="knob" />
              </button>
            </div>
            {reminderEnabled && (
              <div className="field">
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  aria-label="Reminder time"
                />
              </div>
            )}
          </>
        )}

        <PrivacyField value={privacy} onChange={setPrivacy} />
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : list ? 'Save changes' : 'Add list'}
        </button>
      </form>
    </Modal>
  )
}
