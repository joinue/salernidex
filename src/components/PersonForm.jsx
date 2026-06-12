import { useMemo, useState } from 'react'
import { AlertTriangle } from 'react-feather'
import Modal from './Modal'
import TagInput from './TagInput'
import Avatar from './Avatar'
import { KEEP_IN_TOUCH_OPTIONS, TIERS, PRIVACY_LABELS } from '../lib/constants'
import { findDuplicates } from '../lib/duplicates'

const NEW_FAMILY = '__new__'

export default function PersonForm({ person, orgs, people = [], families = [], existingTags, onSave, onCreateFamily, onClose, onOpenPerson }) {
  const [form, setForm] = useState({
    name: person?.name || '',
    organization: person?.organization || '',
    role: person?.role || '',
    email: person?.email || '',
    phone: person?.phone || '',
    birthday: person?.birthday || '',
    address: person?.address || '',
    tags: person?.tags || [],
    tier: person?.tier || '',
    family_id: person?.family_id || '',
    keep_in_touch_days: person?.keep_in_touch_days || 0,
    privacy_level: person?.privacy_level || 'shared',
    notes: person?.notes || '',
  })
  const [newFamilyName, setNewFamilyName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  // Live, non-blocking duplicate check: as the user types a name/email/phone we
  // flag existing people that look like the same person, but never stop a save.
  const duplicates = useMemo(
    () => findDuplicates(form, people, person?.id).slice(0, 4),
    [form.name, form.email, form.phone, people, person?.id]
  )

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // "New family…" creates the family first, then links the person to it.
      let familyId = form.family_id || null
      if (familyId === NEW_FAMILY) {
        const name = newFamilyName.trim()
        if (!name) {
          setError('Give the new family a name (e.g. "The Parks").')
          setBusy(false)
          return
        }
        const family = await onCreateFamily({ name })
        familyId = family.id
      }
      await onSave(
        {
          ...form,
          birthday: form.birthday || null,
          tier: form.tier || null,
          family_id: familyId,
          keep_in_touch_days: Number(form.keep_in_touch_days) || null,
        },
        person?.id
      )
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
        {duplicates.length > 0 && (
          <div className="dup-warning" role="status">
            <div className="dup-warning-head">
              <AlertTriangle size={15} />
              <span>
                {duplicates.length === 1 ? 'This might already be in your contacts' : 'These might already be in your contacts'}
              </span>
            </div>
            <ul className="dup-list">
              {duplicates.map(({ person: match, reasons }) => (
                <li key={match.id} className="dup-row">
                  <Avatar name={match.name} size={32} />
                  <div className="dup-row-text">
                    <span className="dup-row-name">{match.name}</span>
                    <span className="dup-row-meta">
                      {[match.organization, reasons.join(' · ')].filter(Boolean).join(' — ')}
                    </span>
                  </div>
                  {onOpenPerson && (
                    <button
                      type="button"
                      className="dup-row-view"
                      onClick={() => {
                        onOpenPerson(match.id)
                        onClose()
                      }}
                    >
                      View
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
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
          <input type="email" value={form.email} onChange={set('email')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="field">
          <label className="label">Phone</label>
          <input type="tel" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="off" />
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
          <label className="label">Tier</label>
          <select value={form.tier} onChange={set('tier')}>
            <option value="">Not sorted yet</option>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Family</label>
          <select value={form.family_id} onChange={set('family_id')}>
            <option value="">None</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value={NEW_FAMILY}>+ New family…</option>
          </select>
          {form.family_id === NEW_FAMILY && (
            <input
              style={{ marginTop: 8 }}
              placeholder='Family name — "The Parks"'
              value={newFamilyName}
              onChange={(e) => setNewFamilyName(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="field">
          <label className="label">Keep in touch</label>
          <select value={form.keep_in_touch_days} onChange={set('keep_in_touch_days')}>
            {KEEP_IN_TOUCH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Privacy</label>
          <select value={form.privacy_level} onChange={set('privacy_level')}>
            {Object.entries(PRIVACY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Notes</label>
          <textarea value={form.notes} onChange={set('notes')} />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? (
            <span className="dots">Saving</span>
          ) : person ? (
            'Save changes'
          ) : duplicates.length ? (
            'Add anyway'
          ) : (
            'Add person'
          )}
        </button>
      </form>
    </Modal>
  )
}
