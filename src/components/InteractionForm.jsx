import { useState } from 'react'
import Modal from './Modal'
import Segmented from './Segmented'
import { INTERACTION_TYPES } from '../lib/constants'

// Log (or edit context for) a touchpoint. Opens prefilled with a type when the
// user taps a quick-log chip; the date defaults to today but is editable so
// past interactions can be backfilled.
function todayLocal() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export default function InteractionForm({ person, presetType = 'call', onSave, onClose }) {
  const [type, setType] = useState(presetType)
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Store at noon local on the chosen day → stable date regardless of tz.
      const occurred_at = new Date(`${date}T12:00:00`).toISOString()
      await onSave({ person_id: person.id, type, occurred_at, note: note.trim() || null })
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Log · ${person.name}`} onClose={onClose}>
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
          <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Note <span className="muted">(optional)</span></label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was it about?"
            autoFocus
          />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : 'Log it'}
        </button>
      </form>
    </Modal>
  )
}
