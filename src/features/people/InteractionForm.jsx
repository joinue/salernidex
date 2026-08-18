import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import Segmented from '../../components/ui/Segmented'
import { INTERACTION_TYPES, focusOnDesktop } from '../../lib/constants'
import { localDay } from '../../lib/contact'

// Log a touchpoint — or correct one you already logged.
//
// Two things changed here in 0042, both of them about the log being a RECORD
// rather than a streak counter:
//
//   • the subject can be an organization, not only a person. The client company
//     is the thing you manage, and its contact person may change twice a year.
//   • an existing touchpoint can be EDITED. It was insert-and-delete only, so a
//     call logged on the wrong day, or a note you meant to finish, could only be
//     destroyed and retyped — and destroying it moved the cadence clock, which
//     is the one thing you were trying not to disturb.
//
// `subject` is the person or org row; `subjectKind` says which, and decides
// which column the row is written to (the DB check constraint refuses both).
// Passing `interaction` switches the sheet into edit mode.
function todayLocal() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export default function InteractionForm({
  subject,
  subjectKind = 'person',
  interaction = null,
  presetType = 'call',
  onSave,
  onClose,
}) {
  const editing = !!interaction?.id
  const [type, setType] = useState(interaction?.type || presetType)
  const [date, setDate] = useState(
    interaction?.occurred_at ? localDay(interaction.occurred_at) : todayLocal(),
  )
  const [note, setNote] = useState(interaction?.note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Store at noon local on the chosen day → stable date regardless of tz.
      const occurred_at = new Date(`${date}T12:00:00`).toISOString()
      const fields = { type, occurred_at, note: note.trim() || null }
      if (editing) {
        // Deliberately does NOT rewrite the subject: an edit corrects what
        // happened, never who it happened with. Moving a touchpoint to a
        // different contact would silently move the cadence clock on two
        // records at once, and "log it again on the right one" is both clearer
        // and already possible.
        await onSave(fields, interaction.id)
      } else {
        await onSave({
          ...fields,
          [subjectKind === 'organization' ? 'organization_id' : 'person_id']: subject.id,
        })
      }
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`${editing ? 'Edit' : 'Log'} · ${subject.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Type</label>
          <Segmented
            options={INTERACTION_TYPES.map((t) => ({ value: t.id, label: t.verb }))}
            value={type}
            onChange={setType}
            size="sm"
          />
        </div>
        <div className="field">
          <label className="label">When</label>
          <input
            type="date"
            value={date}
            max={todayLocal()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">
            Note <span className="muted">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was it about?"
            autoFocus={focusOnDesktop()}
          />
          {/* Said here because this is where the note gets written, and until
              0042 it was write-only: notes are searchable now, so there is a
              reason to put the detail in beyond your own future re-reading. */}
          <p className="field-hint">Searchable later — worth the detail.</p>
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : editing ? 'Save changes' : 'Log it'}
        </button>
      </form>
    </Modal>
  )
}
