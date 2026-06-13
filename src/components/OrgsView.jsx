import { useEffect, useState } from 'react'
import { Briefcase, ChevronRight, Plus, CheckSquare } from 'react-feather'
import { linkedTasksFor } from '../lib/tasks'
import Avatar from './Avatar'
import AvatarUpload from './AvatarUpload'
import PageHeader from './PageHeader'
import LinkTaskForm from './LinkTaskForm'

export default function OrgsView({ data, openId, onEdit, onAdd, onOpenTask, isDemo = false }) {
  const { orgs, people, tasks, taskLinks, addTask, addTaskLink, saveOrg, loading, deleteOrg } = data
  const [expandedId, setExpandedId] = useState(openId || null)
  const [linkingOrg, setLinkingOrg] = useState(null)

  // Deep link from Quick Find (#/orgs/<id>): land with that org expanded.
  useEffect(() => {
    if (openId) setExpandedId(openId)
  }, [openId])

  if (loading) return <p className="empty dots">Loading</p>

  return (
    <div>
      <PageHeader
        title="Organizations"
        subtitle={orgs.length ? `${orgs.length} ${orgs.length === 1 ? 'org' : 'orgs'}` : null}
        action={onAdd}
        actionLabel="Add organization"
      />

      {orgs.length === 0 ? (
        <div className="empty">
          <Briefcase size={28} className="empty-icon" />
          No organizations yet.
          {onAdd && <button className="text-btn" onClick={onAdd}><Plus size={14} /> Add one</button>}
        </div>
      ) : (
        <div className="list">
          {orgs.map((org) => {
            const members = people.filter((p) => !p.deleted_at && p.organization_id === org.id)
            const linkedOpen = linkedTasksFor('organization', org.id, tasks, taskLinks).filter((t) => !t.completed_at)
            const expanded = expandedId === org.id
            const sub = [org.type, members.length ? `${members.length} ${members.length === 1 ? 'person' : 'people'}` : null]
              .filter(Boolean)
              .join(' · ')
            return (
              <div key={org.id}>
                <div className="list-row" onClick={() => setExpandedId(expanded ? null : org.id)}>
                  {/* Display-only when collapsed (tap expands the row); becomes
                      editable once expanded, so the camera affordance only shows
                      where you're focused — not on every row. */}
                  {expanded ? (
                    <AvatarUpload
                      variant="menu"
                      size={42}
                      value={org.avatar_url}
                      onChange={(v) => saveOrg({ avatar_url: v }, org.id)}
                      name={org.name}
                      kind="org"
                      icon={Briefcase}
                      entity="orgs"
                      demo={isDemo}
                    />
                  ) : (
                    <Avatar name={org.name} src={org.avatar_url} kind="org" icon={Briefcase} size={42} />
                  )}
                  <div className="row-body">
                    <div className="row-title">{org.name}</div>
                    {sub && <div className="row-sub">{sub}</div>}
                  </div>
                  <ChevronRight
                    size={18}
                    className="row-chevron"
                    style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms ease' }}
                  />
                </div>
                {expanded && (
                  <div style={{ padding: '4px 14px 14px 68px', background: 'var(--surface)', borderBottom: '0.5px solid var(--separator)' }}>
                    {org.description && <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>{org.description}</p>}
                    {(org.tags || []).length > 0 && (
                      <div className="chips" style={{ marginBottom: 12 }}>
                        {org.tags.map((t) => <span className="chip" key={t}>{t}</span>)}
                      </div>
                    )}
                    {members.length > 0 && (
                      <div className="chips" style={{ marginBottom: 12 }}>
                        {members.map((m) => (
                          <span className="chip" key={m.id}>{m.name}{m.role ? ` · ${m.role}` : ''}</span>
                        ))}
                      </div>
                    )}
                    {linkedOpen.length > 0 && (
                      <div className="chips" style={{ marginBottom: 12 }}>
                        {linkedOpen.map((t) => (
                          <span className="chip" key={t.id} style={{ cursor: 'pointer' }} onClick={() => onOpenTask(t)}>
                            <CheckSquare size={11} /> {t.title}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16 }}>
                      <button className="text-btn" onClick={() => onEdit(org)}>Edit</button>
                      <button className="text-btn" onClick={() => setLinkingOrg(org)}>Link a task</button>
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
          })}
        </div>
      )}

      {linkingOrg && (
        <LinkTaskForm
          entityType="organization"
          entityId={linkingOrg.id}
          entityName={linkingOrg.name}
          tasks={tasks}
          existingTaskIds={new Set(linkedTasksFor('organization', linkingOrg.id, tasks, taskLinks).map((t) => t.id))}
          addTask={addTask}
          addTaskLink={addTaskLink}
          onClose={() => setLinkingOrg(null)}
        />
      )}
    </div>
  )
}
