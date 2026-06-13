import { useMemo, useState } from 'react'
import { Share2, X, Plus } from 'react-feather'
import PageHeader from './PageHeader'

export default function RelationshipsView({ data, onOpenPerson, onAdd, hub }) {
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
      <PageHeader
        title="Network"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        subtitle={
          rows.length ? `${rows.length} ${rows.length === 1 ? 'connection' : 'connections'}` : null
        }
        action={onAdd}
        actionLabel="Add relationship"
      />

      <div className="filter-row">
        <select
          className="filter-select"
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
        >
          <option value="">Everyone</option>
          {[...people]
            .filter((p) => !p.deleted_at)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <Share2 size={28} className="empty-icon" />
          No relationships yet.
          <button className="text-btn" onClick={onAdd}>
            <Plus size={14} /> Add one
          </button>
        </div>
      ) : (
        <div className="list">
          {rows.map(({ rel, a, b }) => (
            <div className="rel-row" key={rel.id}>
              <span className="conn-name" onClick={() => onOpenPerson(a.id)}>
                {a.name}
              </span>
              <span className="arrow">— {rel.relationship_type.replace(/_/g, ' ')} →</span>
              <span className="conn-name" onClick={() => onOpenPerson(b.id)}>
                {b.name}
              </span>
              {rel.notes && (
                <span className="muted" style={{ fontSize: 13 }}>
                  · {rel.notes}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                className="icon-btn danger"
                onClick={() => deleteRelationship(rel.id)}
                aria-label="Remove"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
