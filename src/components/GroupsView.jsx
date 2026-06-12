import { useState } from 'react'
import { Users, ChevronRight, Plus } from 'react-feather'
import { groupMembers, describeGroup } from '../lib/groups'
import Avatar from './Avatar'
import PageHeader from './PageHeader'

export default function GroupsView({ data, onOpenPerson, onAdd, onEdit }) {
  const { groups, people, loading, deleteGroup } = data
  const [expandedId, setExpandedId] = useState(null)

  if (loading) return <p className="empty dots">Loading</p>

  return (
    <div>
      <PageHeader
        title="Groups"
        subtitle="Saved tag rules — membership stays in sync automatically"
        action={onAdd}
        actionLabel="New group"
      />

      {groups.length === 0 ? (
        <div className="empty">
          <Users size={28} className="empty-icon" />
          No groups yet.
          <button className="text-btn" onClick={onAdd}><Plus size={14} /> New group</button>
        </div>
      ) : (
        <div className="list">
          {groups.map((group) => {
            const members = groupMembers(group, people)
            const expanded = expandedId === group.id
            return (
              <div key={group.id}>
                <div className="list-row" onClick={() => setExpandedId(expanded ? null : group.id)}>
                  <Avatar name={group.name} kind="group" icon={Users} size={42} />
                  <div className="row-body">
                    <div className="row-title">{group.name}</div>
                    <div className="row-sub">
                      {members.length} {members.length === 1 ? 'person' : 'people'} · {describeGroup(group)}
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="row-chevron"
                    style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms ease' }}
                  />
                </div>
                {expanded && (
                  <div style={{ padding: '4px 14px 14px 68px', background: 'var(--surface)', borderBottom: '0.5px solid var(--separator)' }}>
                    {members.length === 0 ? (
                      <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>No one matches these rules yet.</p>
                    ) : (
                      <div className="chips" style={{ marginBottom: 12 }}>
                        {members.map((m) => (
                          <span className="chip accent" key={m.id} style={{ cursor: 'pointer' }} onClick={() => onOpenPerson(m.id)}>
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16 }}>
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
          })}
        </div>
      )}
    </div>
  )
}
