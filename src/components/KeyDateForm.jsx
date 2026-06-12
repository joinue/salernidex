import { useState } from 'react'
import Modal from './Modal'
import Segmented from './Segmented'

// Add a key date to a person — anniversary, memorial, "started new job".
// Annual dates roll forward every year; one-time dates show until they pass.
export default function KeyDateForm({ person, onSave, onClose }) {
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const [annual, setAnnual] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({ person_id: person.id, label: label.trim(), date, annual })
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Key date — ${person.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">What is it?</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Wedding anniversary"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label className="label">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {annual && (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Use the original year if you know it — that's how "10 years" gets counted.
            </p>
          )}
        </div>
        <div className="field">
          <label className="label">Repeats</label>
          <Segmented
            options={[
              { value: true, label: 'Every year' },
              { value: false, label: 'One-time' },
            ]}
            value={annual}
            onChange={setAnnual}
          />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : 'Add date'}
        </button>
      </form>
    </Modal>
  )
}
