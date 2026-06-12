import { useMemo, useState } from 'react'

export default function RelationshipsView({ data, onOpenPerson, onAdd }) {
  const { relationships, people, loading, deleteRelationship } = data
  const [personFilter, setPersonFilter] = useState('')

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const rows = relationships
    .map((r) => ({ rel: r, a: byId.get(r.person_a_id), b: byId.get(r.person_b_id) }))
    .filter(({ a, b }) => a && b && !a.deleted_at && !b.deleted_at)
    .filter(({ a, b }) => !personFilter || a.id === personFilter || b.id === personFilter)
    .sort((x, y) => x.a.name.localeCompare(y.a.name))

  if (loading) return <p className="empty dots">Loading</p>

  return (
    <div>
      <h1 className="page-title">Relationships</h1>
      <div className="filter-row">
        <select className="filter-select" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
          <option value="">Everyone</option>
          {[...people]
            .filter((p) => !p.deleted_at)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
        </select>
        <button className="filter-clear" onClick={onAdd}>+ Add relationship</button>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No relationships yet. Add one to start mapping connections.</p>
      ) : (
        rows.map(({ rel, a, b }) => (
          <div className="rel-row" key={rel.id}>
            <span className="conn-name" onClick={() => onOpenPerson(a.id)}>{a.name}</span>
            <span className="arrow">— {rel.relationship_type.replace(/_/g, ' ')} →</span>
            <span className="conn-name" onClick={() => onOpenPerson(b.id)}>{b.name}</span>
            {rel.notes && <span className="muted" style={{ fontSize: 13 }}>· {rel.notes}</span>}
            <span style={{ flex: 1 }} />
            <button className="text-btn danger" style={{ fontSize: 12 }} onClick={() => deleteRelationship(rel.id)}>
              remove
            </button>
          </div>
        ))
      )}
    </div>
  )
}
