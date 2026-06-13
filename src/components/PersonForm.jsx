import { useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'react-feather'
import Modal from './Modal'
import TagInput from './TagInput'
import Avatar from './Avatar'
import AvatarUpload from './AvatarUpload'
import DatePicker from './DatePicker'
import AddressFields from './AddressFields'
import PrivacyField from './PrivacyField'
import { KEEP_IN_TOUCH_OPTIONS, TIERS, focusOnDesktop } from '../lib/constants'
import { findDuplicates } from '../lib/duplicates'
import { personMatchesGroup, groupJoinTags } from '../lib/groups'
import { isSolo } from '../lib/household'
import { PRIVATE_LEVEL } from '../lib/privacy'

const NEW_FAMILY = '__new__'
const NEW_ORG = '__new_org__'

export default function PersonForm({
  person,
  orgs,
  people = [],
  families = [],
  groups = [],
  existingTags,
  onSave,
  onCreateFamily,
  onCreateOrg,
  onClose,
  onOpenPerson,
  defaultPrivacy = 'shared',
  isDemo = false,
}) {
  const [form, setForm] = useState({
    name: person?.name || '',
    avatar_url: person?.avatar_url || null,
    organization_id: person?.organization_id || '',
    role: person?.role || '',
    email: person?.email || '',
    phone: person?.phone || '',
    birthday: person?.birthday || '',
    address: person?.address || '',
    tags: person?.tags || [],
    tier: person?.tier || '',
    family_id: person?.family_id || '',
    keep_in_touch_days: person?.keep_in_touch_days || 0,
    privacy_level: person?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
    notes: person?.notes || '',
  })
  const [newFamilyName, setNewFamilyName] = useState('')
  const [newOrgName, setNewOrgName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  // Smart groups are tag-rule based, so "join/leave a group" edits the person's
  // tags. Joining adds the group's required tags (and clears any it excludes).
  // Leaving strips the group's rule tags one by one — but never a tag whose
  // removal would also eject the person from another group they belong to, so
  // shared label tags survive. (If every removable tag is locked by another
  // group, they stay in this one; that's a genuine rule conflict, not a bug.)
  const ruleTags = (g) => [...(g.all_tags || []), ...(g.any_tags || [])]
  const toggleGroup = (group) => {
    if (personMatchesGroup(group, form)) {
      let next = [...form.tags]
      for (const t of ruleTags(group)) {
        if (!next.includes(t)) continue
        const trial = next.filter((x) => x !== t)
        const breaksOther = groups.some(
          (o) =>
            o.id !== group.id &&
            personMatchesGroup(o, form) &&
            !personMatchesGroup(o, { tags: trial }),
        )
        if (!breaksOther) next = trial
      }
      setForm({ ...form, tags: next })
    } else {
      const excluded = new Set(group.none_tags || [])
      const next = [...new Set([...form.tags, ...groupJoinTags(group)])].filter(
        (t) => !excluded.has(t),
      )
      setForm({ ...form, tags: next })
    }
  }

  // Live, non-blocking duplicate check: as the user types a name/email/phone we
  // flag existing people that look like the same person, but never stop a save.
  const duplicates = useMemo(
    () => findDuplicates(form, people, person?.id).slice(0, 4),
    // Granular deps on purpose: only name/email/phone drive the duplicate check,
    // so other keystrokes in `form` shouldn't recompute it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.name, form.email, form.phone, people, person?.id],
  )

  // Only groups you can join by adding a tag (an AND or OR rule). A group
  // defined purely by "none of" can't be opted into, so it's left off the list.
  const joinableGroups = useMemo(() => groups.filter((g) => groupJoinTags(g).length > 0), [groups])

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
      // "New organization…" find-or-creates the org, then links by id.
      let orgId = form.organization_id || null
      if (orgId === NEW_ORG) {
        const name = newOrgName.trim()
        if (!name) {
          setError('Give the new organization a name.')
          setBusy(false)
          return
        }
        const org = await onCreateOrg(name)
        orgId = org?.id || null
      }
      await onSave(
        {
          ...form,
          birthday: form.birthday || null,
          tier: form.tier || null,
          family_id: familyId,
          organization_id: orgId,
          keep_in_touch_days: Number(form.keep_in_touch_days) || null,
        },
        person?.id,
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
          <input value={form.name} onChange={set('name')} required autoFocus={focusOnDesktop()} />
        </div>
        <div className="field">
          <label className="label">Photo</label>
          <AvatarUpload
            value={form.avatar_url}
            onChange={(v) => setForm({ ...form, avatar_url: v })}
            name={form.name}
            entity="people"
            demo={isDemo}
          />
        </div>
        {duplicates.length > 0 && (
          <div className="dup-warning" role="status">
            <div className="dup-warning-head">
              <AlertTriangle size={15} />
              <span>
                {duplicates.length === 1
                  ? 'This might already be in your contacts'
                  : 'These might already be in your contacts'}
              </span>
            </div>
            <ul className="dup-list">
              {duplicates.map(({ person: match, reasons }) => (
                <li key={match.id} className="dup-row">
                  <Avatar name={match.name} src={match.avatar_url} size={32} />
                  <div className="dup-row-text">
                    <span className="dup-row-name">{match.name}</span>
                    <span className="dup-row-meta">
                      {[orgsById.get(match.organization_id)?.name, reasons.join(' · ')]
                        .filter(Boolean)
                        .join(' — ')}
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
          <select value={form.organization_id} onChange={set('organization_id')}>
            <option value="">None</option>
            {[...orgs]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            <option value={NEW_ORG}>+ New organization…</option>
          </select>
          {form.organization_id === NEW_ORG && (
            <input
              style={{ marginTop: 8 }}
              placeholder="Organization name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="field">
          <label className="label">Role</label>
          <input value={form.role} onChange={set('role')} />
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
          <label className="label">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={set('phone')}
            inputMode="tel"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label className="label">Birthday</label>
          <DatePicker value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} />
        </div>
        <div className="field">
          <label className="label">Address</label>
          <AddressFields value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        </div>
        <div className="field">
          <label className="label">Tags</label>
          <TagInput
            tags={form.tags}
            onChange={(tags) => setForm({ ...form, tags })}
            suggestions={existingTags}
          />
        </div>
        {joinableGroups.length > 0 && (
          <div className="field">
            <label className="label">Groups</label>
            <div className="group-chips">
              {joinableGroups.map((g) => {
                const inGroup = personMatchesGroup(g, form)
                return (
                  <button
                    type="button"
                    key={g.id}
                    className={`group-chip ${inGroup ? 'on' : ''}`}
                    onClick={() => toggleGroup(g)}
                    aria-pressed={inGroup}
                  >
                    {inGroup && <Check size={13} />}
                    {g.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="field">
          <label className="label">Tier</label>
          <select value={form.tier} onChange={set('tier')}>
            <option value="">Not sorted yet</option>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Family</label>
          <select value={form.family_id} onChange={set('family_id')}>
            <option value="">None</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
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
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <PrivacyField
          value={form.privacy_level}
          onChange={(v) => setForm({ ...form, privacy_level: v })}
          label="Privacy"
        />
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
