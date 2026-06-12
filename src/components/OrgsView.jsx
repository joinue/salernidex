import { useState } from 'react'

export default function OrgsView({ data, onEdit }) {
  const { orgs, people, loading, deleteOrg } = data
  const [expandedId, setExpandedId] = useState(null)

  if (loading) return <p className="empty dots">Loading</p>

  return (
    <div>
      <h1 className="page-title">Organizations</h1>
      {orgs.length === 0 ? (
        <p className="empty">No organizations yet. Add one from the sidebar.</p>
      ) : (
        orgs.map((org) => {
          const members = people.filter((p) => !p.deleted_at && p.organization === org.name)
          const expanded = expandedId === org.id
          return (
            <div
              key={org.id}
              className="result-item"
              onClick={() => setExpandedId(expanded ? null : org.id)}
            >
              <div className="result-name">{org.name}</div>
              <div className="result-org">
                {[org.type, members.length ? `${members.length} ${members.length === 1 ? 'person' : 'people'}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {(org.tags || []).length > 0 && <div className="result-tags">{org.tags.join('  ·  ')}</div>}
              {expanded && (
                <div className="detail" onClick={(e) => e.stopPropagation()}>
                  {org.description && (
                    <div className="detail-section">
                      <span className="label">About</span>
                      <p className="notes">{org.description}</p>
                    </div>
                  )}
                  {members.length > 0 && (
                    <div className="detail-section">
                      <span className="label">People</span>
                      {members.map((m) => (
                        <div className="connection" key={m.id}>
                          <span>{m.name}</span>
                          {m.role && <span className="muted" style={{ fontSize: 13 }}>{m.role}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="detail-actions">
                    <button className="text-btn" onClick={() => onEdit(org)}>Edit</button>
                    <button
                      className="text-btn danger"
                      onClick={() => window.confirm(`Delete ${org.name}?`) && deleteOrg(org.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
