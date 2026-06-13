import { useMemo, useState } from 'react'
import Modal from './Modal'
import Segmented from './Segmented'

const TYPE_LABEL = { person: 'Person', organization: 'Organization', group: 'Group' }

// Attach a person, organization, or group to a project. The select hides
// entities that are already linked so you can't add a duplicate (the DB also
// enforces this).
export default function LinkEntityForm({
  taskId,
  people,
  orgs,
  groups = [],
  existing,
  onSave,
  onClose,
}) {
  const [entityType, setEntityType] = useState('person')
  const [entityId, setEntityId] = useState('')
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const linked = useMemo(
    () => new Set((existing || []).map((l) => `${l.entity_type}:${l.entity_id}`)),
    [existing],
  )

  const options = useMemo(() => {
    const source =
      entityType === 'person'
        ? people.filter((p) => !p.deleted_at).map((p) => ({ id: p.id, name: p.name }))
        : entityType === 'organization'
          ? orgs.map((o) => ({ id: o.id, name: o.name }))
          : groups.map((g) => ({ id: g.id, name: g.name }))
    return source
      .filter((e) => !linked.has(`${entityType}:${e.id}`))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entityType, people, orgs, groups, linked])

  const submit = async (e) => {
    e.preventDefault()
    if (!entityId) {
      setError('Pick someone to link.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        task_id: taskId,
        entity_type: entityType,
        entity_id: entityId,
        role: role.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const switchType = (t) => {
    setEntityType(t)
    setEntityId('')
  }

  return (
    <Modal title="Link a person or org" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label className="label">Type</label>
          <Segmented
            options={[
              { value: 'person', label: 'Person' },
              { value: 'organization', label: 'Org' },
              { value: 'group', label: 'Group' },
            ]}
            value={entityType}
            onChange={switchType}
            size="sm"
          />
        </div>
        <div className="field">
          <label className="label">{TYPE_LABEL[entityType]}</label>
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)} required>
            <option value="">{options.length ? 'Select…' : 'Nothing left to link'}</option>
            {options.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">
            Role <span className="muted">(optional)</span>
          </label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. plumber, contractor"
          />
        </div>
        <button className="btn-primary" disabled={busy || !options.length}>
          {busy ? <span className="dots">Saving</span> : 'Link'}
        </button>
      </form>
    </Modal>
  )
}
