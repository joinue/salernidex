import { useState, useMemo } from 'react'
import { Users, Search, Check } from 'react-feather'
import Modal from '../../components/ui/Modal'
import TagInput from '../../components/ui/TagInput'
import AvatarUpload from '../../components/ui/AvatarUpload'
import Avatar from '../../components/ui/Avatar'
import Segmented from '../../components/ui/Segmented'
import { focusOnDesktop } from '../../lib/constants'

export default function GroupForm({
  group,
  people = [],
  existingTags,
  onSave,
  onClose,
  isDemo = false,
}) {
  const [form, setForm] = useState({
    name: group?.name || '',
    avatar_url: group?.avatar_url || null,
    // New groups default to manual — picking people is the common household case.
    kind: group?.kind || (group ? 'smart' : 'manual'),
    member_ids: group?.member_ids || [],
    all_tags: group?.all_tags || [],
    any_tags: group?.any_tags || [],
    none_tags: group?.none_tags || [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const livePeople = useMemo(
    () => [...people].filter((p) => !p.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  )
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return livePeople
    return livePeople.filter((p) => p.name.toLowerCase().includes(q))
  }, [livePeople, search])

  const selected = new Set(form.member_ids)
  const toggleMember = (id) =>
    setForm((f) => ({
      ...f,
      member_ids: selected.has(id) ? f.member_ids.filter((x) => x !== id) : [...f.member_ids, id],
    }))

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
            autoFocus={focusOnDesktop()}
            placeholder="Close friends"
          />
        </div>
        <div className="field">
          <label className="label">Photo</label>
          <AvatarUpload
            value={form.avatar_url}
            onChange={(v) => setForm({ ...form, avatar_url: v })}
            name={form.name}
            kind="group"
            icon={Users}
            entity="groups"
            demo={isDemo}
          />
        </div>

        <div className="field">
          <label className="label">Membership</label>
          <Segmented
            value={form.kind}
            onChange={(kind) => setForm({ ...form, kind })}
            options={[
              { value: 'manual', label: 'Pick people' },
              { value: 'smart', label: 'By tags' },
            ]}
          />
        </div>

        {form.kind === 'manual' ? (
          <div className="field">
            <label className="label">
              Members{form.member_ids.length ? ` · ${form.member_ids.length}` : ''}
            </label>
            <div className="search-wrap" style={{ marginBottom: 8 }}>
              <Search size={16} />
              <input
                className="search-input"
                placeholder="Search people…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="member-picker">
              {matches.length === 0 ? (
                <p className="muted" style={{ fontSize: 14, padding: '8px 4px' }}>
                  No people match “{search}”.
                </p>
              ) : (
                matches.map((p) => {
                  const on = selected.has(p.id)
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={`member-row ${on ? 'on' : ''}`}
                      onClick={() => toggleMember(p.id)}
                      aria-pressed={on}
                    >
                      <Avatar name={p.name} src={p.avatar_url} size={30} />
                      <span className="member-name">{p.name}</span>
                      <span className="member-check">{on && <Check size={16} />}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        ) : (
          <>
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
              Leave a rule empty to skip it. Example: any of "book club, neighbor", none of "work" =
              personal contacts outside the office.
            </p>
          </>
        )}

        <button className="btn-primary" disabled={busy}>
          {busy ? <span className="dots">Saving</span> : group ? 'Save group' : 'Create group'}
        </button>
      </form>
    </Modal>
  )
}
