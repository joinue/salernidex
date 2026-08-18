import { useState } from 'react'
import { ChevronRight } from 'react-feather'
import Modal from '../../components/ui/Modal'
import PrivacyField from '../../components/ui/PrivacyField'
import Segmented from '../../components/ui/Segmented'
import { focusOnDesktop } from '../../lib/constants'
import { isSolo } from '../../lib/household'
import { PRIVATE_LEVEL } from '../../lib/privacy'
import { isoDateIn } from '../../lib/tasks'
import IconPicker from '../../components/ui/IconPicker'
import AreaPicker from '../../components/ui/AreaPicker'
import { areaById, privacyForNewItem } from '../../lib/areas'
import ColorPicker from '../../components/ui/ColorPicker'
import { COLORS } from '../../lib/colors'
import { LIST_KINDS, isDueable, kindOf } from '../../lib/listKinds'

// Every kind, its icon and its one-line explanation come from the one table
// in lib/listKinds — adding a fifth is an entry there, not an edit here.
const KIND_OPTIONS = LIST_KINDS.map((k) => ({ value: k.value, label: k.label }))
const DEFAULT_ICONS = LIST_KINDS.map((k) => k.icon)

// Create or edit a list (name + an emoji icon for quick recognition). An
// optional due date puts the list on Today; an optional reminder time fires a
// push on the due date (mirrors habits' reminder_time/reminder_enabled).
export default function ListForm({
  list,
  onSave,
  onClose,
  defaultPrivacy = 'family_shared',
  areas = [],
  // Pre-filled from the active lens on a NEW list, so making a work shopping
  // list while scoped to Work takes zero extra taps. An edit keeps whatever the
  // list already had.
  defaultAreaId = null,
}) {
  const [name, setName] = useState(list?.name || '')
  const [kind, setKind] = useState(list?.kind || 'standard')
  // Default to the icon that matches the type, not always the cart — a new
  // standard list ("Packing") was shipping with a grocery trolley on it.
  const [icon, setIcon] = useState(list?.icon || kindOf(list).icon)
  const [color, setColor] = useState(list?.color || COLORS[0])
  const [areaId, setAreaId] = useState(list ? list.area_id || null : defaultAreaId)
  const [privacy, setPrivacy] = useState(
    list?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
  )
  // Until the control is touched, a NEW list filed into an area that keeps
  // things private follows it. An edit never re-decides — the list already has
  // a visibility somebody chose. Same precedence TaskForm uses.
  const [privacyTouched, setPrivacyTouched] = useState(false)
  const [dueDate, setDueDate] = useState(list?.due_date || '')
  const [reminderEnabled, setReminderEnabled] = useState(list?.reminder_enabled ?? false)
  const [reminderTime, setReminderTime] = useState(
    list?.reminder_time ? list.reminder_time.slice(0, 5) : '09:00',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const dueable = isDueable({ kind })
  // Everything below the name is decoration on the way to "Add list", and all
  // of it together made this sheet 848px of content. With a keyboard up a phone
  // leaves about 340px, so the common case — type a name, pick a type, commit —
  // meant scrolling 508px through a porthole. Editing opens expanded, because
  // then you came here deliberately to change one of these. Same rule TaskForm
  // uses for its own options.
  const [more, setMore] = useState(!!list)

  // An explicit pick wins; otherwise a NEW list follows its area's default.
  const effectivePrivacy =
    list || privacyTouched ? privacy : privacyForNewItem(areaById(areas, areaId), privacy)

  const submit = async (e) => {
    e.preventDefault()
    // `required` only rejects an empty string, so a name of spaces passes it
    // and lands as an untitled row.
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Give the list a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // A reminder needs a date to fire on; drop it if the date was cleared.
      const remind = dueable && !!dueDate && reminderEnabled
      await onSave(
        {
          name: cleanName,
          icon,
          color,
          area_id: areaId || null,
          // kind is fixed at creation — a list's grouping model can't flip later
          // without re-filing every item, so we only send it on a new list.
          ...(list ? {} : { kind }),
          privacy_level: effectivePrivacy,
          due_date: (dueable && dueDate) || null,
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
                // Follow the type, but never overwrite an icon the user picked
                // themselves — only one still sitting on a type's default.
                if (DEFAULT_ICONS.includes(icon)) setIcon(kindOf({ kind: v }).icon)
              }}
            />
            <p className="muted" style={{ fontSize: 13, margin: '6px 2px 0' }}>
              {kindOf({ kind: kind }).hint}
            </p>
          </div>
        )}
        {!more ? (
          <button type="button" className="form-more-btn" onClick={() => setMore(true)}>
            <ChevronRight size={15} />
            More options
            <span className="form-more-hint">
              icon · color{dueable ? ' · due date' : ''} · visibility
            </span>
          </button>
        ) : (
          <>
            <div className="field">
              <label className="label">Icon</label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>

            <div className="field">
              <label className="label">Color</label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            {/* A due date is "get this whole list done by then", which is
            meaningless on a meal plan (seven separate days) and on a
            collection (never done). Hidden rather than disabled — an input you
            can see but can't use is a worse answer than one that isn't there. */}
            {dueable && (
              <>
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
                    <button
                      type="button"
                      className="chip accent"
                      onClick={() => setDueDate(isoDateIn(0))}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="chip accent"
                      onClick={() => setDueDate(isoDateIn(1))}
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      className="chip accent"
                      onClick={() => setDueDate(isoDateIn(7))}
                    >
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
              </>
            )}

            <AreaPicker areas={areas} value={areaId} onChange={setAreaId} />

            <PrivacyField
              value={effectivePrivacy}
              onChange={(v) => {
                setPrivacyTouched(true)
                setPrivacy(v)
              }}
            />
          </>
        )}
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : list ? 'Save changes' : 'Add list'}
        </button>
      </form>
    </Modal>
  )
}
