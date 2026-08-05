import { useState } from 'react'
import Modal from '../../components/ui/Modal'

const TYPES = ['knows', 'works_with', 'connected_to', 'reports_to']

export default function RelationshipForm({ from, people, onSave, onClose }) {
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name))
  const [personA, setPersonA] = useState(from?.id || '')
  const [personB, setPersonB] = useState('')
  const [type, setType] = useState('knows')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (personA === personB) {
      setError('Pick two different people.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        person_a_id: personA,
        person_b_id: personB,
        relationship_type: type,
        notes: notes || null,
      })
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Add relationship" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Person</label>
          <select value={personA} onChange={(e) => setPersonA(e.target.value)} required>
            <option value="">Select person…</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Relationship</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Second person</label>
          <select value={personB} onChange={(e) => setPersonB(e.target.value)} required>
            <option value="">Select second person…</option>
            {sorted
              .filter((p) => p.id !== personA)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Context (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Met at a conference, 2024"
          />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : 'Add relationship'}
        </button>
      </form>
    </Modal>
  )
}
