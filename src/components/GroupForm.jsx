import { useState } from 'react'
import Modal from './Modal'
import TagInput from './TagInput'

export default function GroupForm({ group, existingTags, onSave, onClose }) {
  const [form, setForm] = useState({
    name: group?.name || '',
    all_tags: group?.all_tags || [],
    any_tags: group?.any_tags || [],
    none_tags: group?.none_tags || [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(form, group?.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={group ? 'Edit group' : 'New group'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Group name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
            placeholder="PACE Customers"
          />
        </div>
        <div className="field">
          <label className="label">Must have all of these tags (AND)</label>
          <TagInput
            tags={form.all_tags}
            onChange={(tags) => setForm({ ...form, all_tags: tags })}
            suggestions={existingTags}
          />
        </div>
        <div className="field">
          <label className="label">…and at least one of these (OR)</label>
          <TagInput
            tags={form.any_tags}
            onChange={(tags) => setForm({ ...form, any_tags: tags })}
            suggestions={existingTags}
          />
        </div>
        <div className="field">
          <label className="label">…and none of these (NOT)</label>
          <TagInput
            tags={form.none_tags}
            onChange={(tags) => setForm({ ...form, none_tags: tags })}
            suggestions={existingTags}
          />
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 24 }}>
          Leave a rule empty to skip it. Example: any of "MNA board, Tucson Compass partner",
          none of "Pima County" = civic contacts outside government.
        </p>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : group ? 'Save group' : 'Create group'}
        </button>
      </form>
    </Modal>
  )
}
