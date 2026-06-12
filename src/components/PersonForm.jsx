import { useState } from 'react'
import Modal from './Modal'
import TagInput from './TagInput'

export default function PersonForm({ person, orgs, existingTags, onSave, onClose }) {
  const [form, setForm] = useState({
    name: person?.name || '',
    organization: person?.organization || '',
    role: person?.role || '',
    email: person?.email || '',
    phone: person?.phone || '',
    birthday: person?.birthday || '',
    address: person?.address || '',
    tags: person?.tags || [],
    privacy_level: person?.privacy_level || 'shared',
    notes: person?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({ ...form, birthday: form.birthday || null }, person?.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={person ? 'Edit person' : 'Add person'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Name</label>
          <input value={form.name} onChange={set('name')} required autoFocus />
        </div>
        <div className="field">
          <label className="label">Organization</label>
          <input value={form.organization} onChange={set('organization')} list="org-options" />
          <datalist id="org-options">
            {orgs.map((o) => (
              <option key={o.id} value={o.name} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="label">Role</label>
          <input value={form.role} onChange={set('role')} />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label className="label">Phone</label>
          <input value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field">
          <label className="label">Birthday</label>
          <input type="date" value={form.birthday} onChange={set('birthday')} />
        </div>
        <div className="field">
          <label className="label">Address</label>
          <input value={form.address} onChange={set('address')} />
        </div>
        <div className="field">
          <label className="label">Tags</label>
          <TagInput
            tags={form.tags}
            onChange={(tags) => setForm({ ...form, tags })}
            suggestions={existingTags}
          />
        </div>
        <div className="field">
          <label className="label">Privacy</label>
          <select value={form.privacy_level} onChange={set('privacy_level')}>
            <option value="marc_only">Marc only</option>
            <option value="shared">Shared</option>
            <option value="family_shared">Family shared</option>
            <option value="public">Public</option>
          </select>
        </div>
        <div className="field">
          <label className="label">Notes</label>
          <textarea value={form.notes} onChange={set('notes')} />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : person ? 'Save changes' : 'Add person'}
        </button>
      </form>
    </Modal>
  )
}
