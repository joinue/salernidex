import { useState } from 'react'
import { Briefcase } from 'react-feather'
import Modal from './Modal'
import TagInput from './TagInput'
import AvatarUpload from './AvatarUpload'
import PrivacyField from './PrivacyField'
import { focusOnDesktop } from '../lib/constants'
import { orgNameTaken } from '../lib/orgs'
import { friendlyError } from '../lib/errors'
import { isSolo } from '../lib/household'
import { PRIVATE_LEVEL } from '../lib/privacy'

const ORG_TYPES = [
  'Company',
  'Government',
  'Nonprofit',
  'Community',
  'School / Education',
  'Healthcare',
  'Financial',
  'Insurance',
  'Utility',
  'Service Provider',
  'Contractor',
  'Retail / Store',
  'Restaurant',
  'Religious',
  'Club / Association',
  'Sports / Recreation',
  'Other',
]

export default function OrgForm({ org, orgs = [], onSave, onClose, isDemo = false }) {
  const [form, setForm] = useState({
    name: org?.name || '',
    avatar_url: org?.avatar_url || null,
    type: org?.type || '',
    description: org?.description || '',
    tags: org?.tags || [],
    privacy_level: org?.privacy_level || (isSolo() ? PRIVATE_LEVEL : 'shared'),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    // Pre-empt the DB's UNIQUE(name) — clearer than an optimistic insert that
    // gets rolled back a beat later.
    if (orgNameTaken(form.name, orgs, org?.id)) {
      setError(`An organization named “${form.name.trim()}” already exists.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(form, org?.id)
      onClose()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={org ? 'Edit organization' : 'Add organization'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Name</label>
          <input value={form.name} onChange={set('name')} required autoFocus={focusOnDesktop()} />
        </div>
        <div className="field">
          <label className="label">Logo</label>
          <AvatarUpload
            value={form.avatar_url}
            onChange={(v) => setForm({ ...form, avatar_url: v })}
            name={form.name}
            kind="org"
            icon={Briefcase}
            entity="orgs"
            demo={isDemo}
          />
        </div>
        <div className="field">
          <label className="label">Type</label>
          <select value={form.type} onChange={set('type')}>
            <option value="">—</option>
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
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
        <PrivacyField
          value={form.privacy_level}
          onChange={(v) => setForm({ ...form, privacy_level: v })}
          label="Privacy"
        />
        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : org ? 'Save changes' : 'Add organization'}
        </button>
      </form>
    </Modal>
  )
}
