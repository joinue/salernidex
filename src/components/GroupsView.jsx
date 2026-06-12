import { useState } from 'react'
import { groupMembers, describeGroup } from '../lib/groups'

export default function GroupsView({ data, onOpenPerson, onAdd, onEdit }) {
  const { groups, people, loading, deleteGroup } = data
  const [expandedId, setExpandedId] = useState(null)

  if (loading) return <p className="empty dots">Loading</p>

  return (
    <div>
      <h1 className="page-title">Groups</h1>
      <div className="filter-row">
        <button className="filter-clear" onClick={onAdd}>+ New group</button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Groups are saved tag rules — people matching the rules are always in sync, no manual lists.
      </p>

      {groups.length === 0 ? (
        <p className="empty">No groups yet. Create one from tags — e.g. everyone tagged "PACE customer".</p>
      ) : (
        groups.map((group) => {
          const members = groupMembers(group, people)
          const expanded = expandedId === group.id
          return (
            <div
              key={group.id}
              className="result-item"
              onClick={() => setExpandedId(expanded ? null : group.id)}
            >
              <div className="result-name">{group.name}</div>
              <div className="result-org">
                {members.length} {members.length === 1 ? 'person' : 'people'}
              </div>
              <div className="rule-text">{describeGroup(group)}</div>
              {expanded && (
                <div className="detail" onClick={(e) => e.stopPropagation()}>
                  <div className="detail-section" style={{ marginTop: 8 }}>
                    <span className="label">Members</span>
                    {members.length === 0 ? (
                      <p className="muted" style={{ fontSize: 14 }}>No one matches these rules yet.</p>
                    ) : (
                      members.map((m) => (
                        <div className="connection" key={m.id}>
                          <span className="conn-name" onClick={() => onOpenPerson(m.id)}>{m.name}</span>
                          {(m.role || m.organization) && (
                            <span className="muted" style={{ fontSize: 13 }}>
                              {[m.role, m.organization].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="detail-actions">
                    <button className="text-btn" onClick={() => onEdit(group)}>Edit rules</button>
                    <button
                      className="text-btn danger"
                      onClick={() => window.confirm(`Delete group "${group.name}"? (People are not affected.)`) && deleteGroup(group.id)}
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
