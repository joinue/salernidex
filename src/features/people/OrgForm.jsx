import { useState } from 'react'
import { Briefcase } from 'react-feather'
import Modal from '../../components/ui/Modal'
import TagInput from '../../components/ui/TagInput'
import AvatarUpload from '../../components/ui/AvatarUpload'
import PrivacyField from '../../components/ui/PrivacyField'
import AddressFields from '../../components/ui/AddressFields'
import { focusOnDesktop } from '../../lib/constants'
import { orgNameTaken, ORG_TYPES, isCounterparty } from '../../lib/orgs'
import { friendlyError } from '../../lib/errors'
import { isSolo } from '../../lib/household'
import { PRIVATE_LEVEL } from '../../lib/privacy'

export default function OrgForm({
  org,
  orgs = [],
  onSave,
  onClose,
  isDemo = false,
  defaultPrivacy = 'shared',
}) {
  const [form, setForm] = useState({
    name: org?.name || '',
    avatar_url: org?.avatar_url || null,
    type: org?.type || '',
    description: org?.description || '',
    phone: org?.phone || '',
    email: org?.email || '',
    website: org?.website || '',
    address: org?.address || '',
    tags: org?.tags || [],
    privacy_level: org?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
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
          {/* The type isn't only a label: it decides whether this org reads
              under the name of everyone linked to it. Say so here rather than
              letting the effect look arbitrary later. */}
          <p className="field-hint">
            {isCounterparty(form)
              ? 'Shown under the name of people linked here — this is how you know them.'
              : 'Kept on their profile and in search, but not shown under their name.'}
          </p>
        </div>
        <div className="field">
          <label className="label">Description</label>
          <textarea value={form.description} onChange={set('description')} />
        </div>
        {/* An org you deal with needs its own way in — the shop's main line,
            not whichever person you happened to save. */}
        <div className="field">
          <label className="label">Phone</label>
          <input type="tel" value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label className="label">Website</label>
          <input
            type="url"
            inputMode="url"
            placeholder="example.com"
            value={form.website}
            onChange={set('website')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label className="label">Address</label>
          <AddressFields
            value={form.address}
            onChange={(address) => setForm({ ...form, address })}
          />
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
