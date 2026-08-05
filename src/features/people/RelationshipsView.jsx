import { useMemo, useState } from 'react'
import { Share2, X, Plus, Search } from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'

export default function RelationshipsView({ data, onOpenPerson, onAdd, hub }) {
  const { relationships, people, loading, deleteRelationship } = data
  const [personFilter, setPersonFilter] = useState('')
  const [query, setQuery] = useState('')

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  // Every live relationship, resolved to its two people. Shared by the row list
  // and the person dropdown so the dropdown only offers people who actually
  // appear in a relationship — it stays short even when the rolodex is huge.
  const resolved = useMemo(
    () =>
      relationships
        .map((r) => ({ rel: r, a: byId.get(r.person_a_id), b: byId.get(r.person_b_id) }))
        .filter(({ a, b }) => a && b && !a.deleted_at && !b.deleted_at),
    [relationships, byId],
  )

  // People who have at least one relationship, name-sorted — the dropdown set.
  const connectedPeople = useMemo(() => {
    const seen = new Map()
    for (const { a, b } of resolved) {
      seen.set(a.id, a)
      seen.set(b.id, b)
    }
    return [...seen.values()].sort((x, y) => x.name.localeCompare(y.name))
  }, [resolved])

  const q = query.trim().toLowerCase()
  const rows = resolved
    .filter(({ a, b }) => !personFilter || a.id === personFilter || b.id === personFilter)
    .filter(({ rel, a, b }) => {
      if (!q) return true
      const hay = `${a.name} ${b.name} ${rel.relationship_type.replace(/_/g, ' ')} ${
        rel.notes || ''
      }`.toLowerCase()
      return hay.includes(q)
    })
    .sort((x, y) => x.a.name.localeCompare(y.a.name))

  if (loading) return <EmptyState loading>Loading</EmptyState>

  return (
    <div>
      <PageHeader
        title="Relationships"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        createAction={onAdd}
        actionLabel="Add relationship"
      />

      <div className="search-wrap">
        <Search size={16} />
        <input
          className="search-input"
          placeholder="Search by name, type, or note…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
      </div>

      <div className="filter-row">
        <select
          className="filter-select"
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
        >
          <option value="">Everyone</option>
          {connectedPeople.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        resolved.length === 0 ? (
          <EmptyState
            icon={Share2}
            action={
              <button className="text-btn" onClick={onAdd}>
                <Plus size={14} /> Add one
              </button>
            }
          >
            No relationships yet.
          </EmptyState>
        ) : (
          <EmptyState icon={Search}>No matches.</EmptyState>
        )
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
              <IconButton
                icon={X}
                variant="danger"
                label="Remove"
                onClick={() => deleteRelationship(rel.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
