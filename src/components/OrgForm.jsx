import { useState } from 'react'
import Modal from './Modal'
import TagInput from './TagInput'

const ORG_TYPES = ['Company', 'Government', 'Nonprofit', 'Community']

export default function OrgForm({ org, onSave, onClose }) {
  const [form, setForm] = useState({
    name: org?.name || '',
    type: org?.type || '',
    description: org?.description || '',
    tags: org?.tags || [],
    privacy_level: org?.privacy_level || 'shared',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(form, org?.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={org ? 'Edit organization' : 'Add organization'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Name</label>
          <input value={form.name} onChange={set('name')} required autoFocus />
        </div>
        <div className="field">
          <label className="label">Type</label>
          <select value={form.type} onChange={set('type')}>
            <option value="">—</option>
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Description</label>
          <textarea value={form.description} onChange={set('description')} />
        </div>
        <div className="field">
          <label className="label">Tags</label>
          <TagInput tags={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
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
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : org ? 'Save changes' : 'Add organization'}
        </button>
      </form>
    </Modal>
  )
}
