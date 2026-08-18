import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Plus } from 'react-feather'
import Modal from '../../components/ui/Modal'
import TagInput from '../../components/ui/TagInput'
import Avatar from '../../components/ui/Avatar'
import AvatarUpload from '../../components/ui/AvatarUpload'
import DatePicker from '../../components/ui/DatePicker'
import AddressFields from '../../components/ui/AddressFields'
import PrivacyField from '../../components/ui/PrivacyField'
import ChannelEditor from '../../components/ui/ChannelEditor'
import {
  KEEP_IN_TOUCH_OPTIONS,
  TIERS,
  EMAIL_LABELS,
  PHONE_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_BY_ID,
  focusOnDesktop,
} from '../../lib/constants'
import { cleanChannels } from '../../lib/contactChannels'
import { findDuplicates } from '../../lib/duplicates'
import { personMatchesGroup, groupJoinTags } from '../../lib/groups'
import { isSolo } from '../../lib/household'
import { PRIVATE_LEVEL } from '../../lib/privacy'
import { affiliationsFor, isCounterparty, personSummary } from '../../lib/orgs'

const NEW_FAMILY = '__new__'
const NEW_ORG = '__new_org__'

const today = () => new Date().toISOString().slice(0, 10)

// A blank row in the affiliations editor. `new_name` only matters while the
// picker sits on "+ New organization…".
const emptyAffiliation = () => ({
  organization_id: '',
  new_name: '',
  role: '',
  is_primary: false,
  show_in_summary: null,
  started_on: null,
  ended_on: null,
})

const EMAIL_OPTS = EMAIL_LABELS.map((l) => ({ value: l, label: l }))
const PHONE_OPTS = PHONE_LABELS.map((l) => ({ value: l, label: l }))
const SOCIAL_OPTS = SOCIAL_PLATFORMS.map((p) => ({ value: p.id, label: p.label }))
const socialPlaceholder = (id) => SOCIAL_BY_ID[id]?.placeholder || ''

export default function PersonForm({
  person,
  orgs,
  affiliations = [],
  people = [],
  families = [],
  groups = [],
  existingTags,
  onSave,
  onSaveAffiliations,
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
    role: person?.role || '',
    email: person?.email || '',
    phone: person?.phone || '',
    emails: person?.emails || [],
    phones: person?.phones || [],
    socials: person?.socials || [],
    birthday: person?.birthday || '',
    address: person?.address || '',
    tags: person?.tags || [],
    tier: person?.tier || '',
    family_id: person?.family_id || '',
    keep_in_touch_days: person?.keep_in_touch_days || 0,
    privacy_level: person?.privacy_level || (isSolo() ? PRIVATE_LEVEL : defaultPrivacy),
    notes: person?.notes || '',
  })
  // `person` may be a seed for a new contact (an org page passing its own id)
  // rather than an existing row, so identity comes from the id, not from the
  // prop being present — otherwise "Add someone here" opened a sheet titled
  // "Edit person" with a "Save changes" button.
  const isNew = !person?.id
  const [newFamilyName, setNewFamilyName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])

  // The person's org links, edited as a list. An existing contact loads their
  // rows; a seed from an org page ("Add someone here") starts with that org
  // pre-picked. Everyone else starts with none — an empty picker on every new
  // contact implied a person ought to have an employer.
  const [affs, setAffs] = useState(() => {
    const existing = affiliationsFor(person?.id, affiliations).map((a) => ({
      organization_id: a.organization_id,
      new_name: '',
      role: a.role || '',
      is_primary: !!a.is_primary,
      show_in_summary: a.show_in_summary ?? null,
      started_on: a.started_on || null,
      ended_on: a.ended_on || null,
    }))
    if (existing.length) return existing
    if (person?.organization_id)
      return [{ ...emptyAffiliation(), organization_id: person.organization_id, is_primary: true }]
    return []
  })

  const sortedOrgs = useMemo(() => [...orgs].sort((a, b) => a.name.localeCompare(b.name)), [orgs])

  const patchAff = (i, patch) =>
    setAffs((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const removeAff = (i) => setAffs((prev) => prev.filter((_, idx) => idx !== i))
  // Adding the first org moves any standalone role onto it, visibly, rather
  // than leaving the same title in two places (see people.role in 0033).
  const addAff = () =>
    setAffs((prev) => {
      if (prev.length === 0 && form.role.trim()) {
        const seeded = { ...emptyAffiliation(), role: form.role.trim(), is_primary: true }
        setForm((f) => ({ ...f, role: '' }))
        return [seeded]
      }
      return [...prev, emptyAffiliation()]
    })
  // Radios need exactly one winner; flipping one off the others.
  const setPrimaryAff = (i) =>
    setAffs((prev) => prev.map((a, idx) => ({ ...a, is_primary: idx === i })))

  // Whether this row currently reads under the person's name, and the toggle
  // that changes it. Falling back to null (rather than pinning the boolean)
  // whenever the choice agrees with the org's type keeps the row inheriting —
  // so retyping the org later still moves everyone linked to it.
  const summaryDefault = (a) => isCounterparty(orgsById.get(a.organization_id))
  const showsUnderName = (a) => (a.show_in_summary == null ? summaryDefault(a) : a.show_in_summary)
  const toggleShowsUnderName = (i, a) => {
    const next = !showsUnderName(a)
    patchAff(i, { show_in_summary: next === summaryDefault(a) ? null : next })
  }

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
      // Each row sitting on "+ New organization…" find-or-creates its org
      // first, so every link saves against a real id. Rows still on the empty
      // placeholder are dropped rather than treated as an error.
      const links = []
      // onCreateOrg reads the orgs list as it was at render, so it can't see an
      // org created a moment ago in this same loop. Remembering them here keeps
      // "+ New organization…" typed twice with the same name from creating two
      // rows that then collide on the unique index.
      const createdOrgs = new Map()
      for (const a of affs) {
        let orgId = a.organization_id
        if (orgId === NEW_ORG) {
          const name = a.new_name.trim()
          if (!name) {
            setError('Give the new organization a name.')
            setBusy(false)
            return
          }
          const key = name.toLowerCase()
          if (createdOrgs.has(key)) orgId = createdOrgs.get(key)
          else {
            const org = await onCreateOrg(name)
            orgId = org?.id || null
            if (orgId) createdOrgs.set(key, orgId)
          }
        }
        if (!orgId) continue
        links.push({
          organization_id: orgId,
          role: a.role,
          is_primary: a.is_primary,
          show_in_summary: a.show_in_summary,
          started_on: a.started_on,
          ended_on: a.ended_on,
        })
      }
      const savedId =
        (await onSave(
          {
            ...form,
            birthday: form.birthday || null,
            tier: form.tier || null,
            family_id: familyId,
            // people.role is only the standalone descriptor now; with any org
            // linked, the title lives on that link instead.
            role: links.length ? null : form.role || null,
            keep_in_touch_days: Number(form.keep_in_touch_days) || null,
            emails: cleanChannels(form.emails),
            phones: cleanChannels(form.phones),
            socials: cleanChannels(form.socials),
          },
          person?.id,
        )) || person?.id
      if (onSaveAffiliations && savedId) onSaveAffiliations(savedId, links)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? 'Add person' : 'Edit person'} onClose={onClose}>
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
                      {[personSummary(match, affiliations, orgsById), reasons.join(' · ')]
                        .filter(Boolean)
                        .join(' · ')}
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
          <label className="label">Organizations</label>
          {affs.map((a, i) => (
            <div className="affiliation-row" key={i}>
              <select
                value={a.organization_id}
                onChange={(e) => patchAff(i, { organization_id: e.target.value })}
              >
                <option value="">Select organization…</option>
                {sortedOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value={NEW_ORG}>+ New organization…</option>
              </select>
              {a.organization_id === NEW_ORG && (
                <input
                  placeholder="Organization name"
                  value={a.new_name}
                  onChange={(e) => patchAff(i, { new_name: e.target.value })}
                  autoFocus
                />
              )}
              <input
                placeholder="Role or title here (optional)"
                value={a.role}
                onChange={(e) => patchAff(i, { role: e.target.value })}
              />
              <div className="aff-toggle-row">
                <span className="aff-toggle-label">Show under their name</span>
                <button
                  type="button"
                  className={`switch ${showsUnderName(a) ? 'on' : ''}`}
                  role="switch"
                  aria-checked={showsUnderName(a)}
                  onClick={() => toggleShowsUnderName(i, a)}
                >
                  <span className="knob" />
                </button>
              </div>
              <div className="aff-opts">
                <button
                  type="button"
                  className={`aff-pill ${a.ended_on ? 'on' : ''}`}
                  aria-pressed={Boolean(a.ended_on)}
                  onClick={() => patchAff(i, { ended_on: a.ended_on ? null : today() })}
                >
                  No longer here
                </button>
                {affs.length > 1 && (
                  <button
                    type="button"
                    className={`aff-pill ${a.is_primary ? 'on' : ''}`}
                    aria-pressed={a.is_primary}
                    onClick={() => setPrimaryAff(i)}
                  >
                    Main one
                  </button>
                )}
                <button type="button" className="text-btn danger" onClick={() => removeAff(i)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="text-btn" onClick={addAff}>
            <Plus size={14} /> Add organization
          </button>
          {/* The whole point of the per-row toggle is that the result is
              predictable, so show the line it produces rather than making the
              user save and go looking for it. */}
          {affs.length > 0 && (
            <p className="field-hint">
              {personSummary(
                { id: '__preview__', role: form.role },
                affs
                  .filter((a) => a.organization_id && a.organization_id !== NEW_ORG)
                  .map((a) => ({ ...a, person_id: '__preview__' })),
                orgsById,
              ) || 'Nothing will show under their name.'}
            </p>
          )}
        </div>
        {/* Only offered when there's no org to hang a title on — otherwise the
            same fact would have two homes. Adding an org moves it onto the row. */}
        {affs.length === 0 && (
          <div className="field">
            <label className="label">Role</label>
            <input value={form.role} onChange={set('role')} placeholder="e.g. Babysitter" />
          </div>
        )}
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
          <ChannelEditor
            items={form.emails}
            onChange={(emails) => setForm({ ...form, emails })}
            field="label"
            options={EMAIL_OPTS}
            inputType="email"
            placeholder="email address"
            addLabel="Add email"
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
          <ChannelEditor
            items={form.phones}
            onChange={(phones) => setForm({ ...form, phones })}
            field="label"
            options={PHONE_OPTS}
            inputType="tel"
            inputMode="tel"
            placeholder="phone number"
            addLabel="Add phone"
          />
        </div>
        <div className="field">
          <label className="label">Social profiles</label>
          <ChannelEditor
            items={form.socials}
            onChange={(socials) => setForm({ ...form, socials })}
            field="platform"
            options={SOCIAL_OPTS}
            placeholder={socialPlaceholder}
            addLabel="Add profile"
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
              placeholder='Family name, like "The Parks"'
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
          ) : !isNew ? (
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
