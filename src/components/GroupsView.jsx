import { useEffect, useState } from 'react'
import { Users, ChevronRight, Plus, CheckSquare } from 'react-feather'
import { groupMembers, describeGroup } from '../lib/groups'
import { linkedTasksFor } from '../lib/tasks'
import { downloadVcf } from '../lib/vcard'
import Avatar from './Avatar'
import AvatarUpload from './AvatarUpload'
import PageHeader from './PageHeader'
import LinkTaskForm from './LinkTaskForm'

export default function GroupsView({
  data,
  openId,
  onOpenPerson,
  onOpenTask,
  onAdd,
  onEdit,
  isDemo = false,
}) {
  const {
    groups,
    people,
    orgs,
    tasks,
    taskLinks,
    addTask,
    addTaskLink,
    saveGroup,
    loading,
    deleteGroup,
  } = data
  const orgsById = new Map((orgs || []).map((o) => [o.id, o]))
  const [expandedId, setExpandedId] = useState(openId || null)
  const [linkingGroup, setLinkingGroup] = useState(null)

  // Deep link from Quick Find (#/groups/<id>): land with that group expanded.
  useEffect(() => {
    if (openId) setExpandedId(openId)
  }, [openId])

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
          <button className="text-btn" onClick={onAdd}>
            <Plus size={14} /> New group
          </button>
        </div>
      ) : (
        <div className="list">
          {groups.map((group) => {
            const members = groupMembers(group, people)
            const linkedOpen = linkedTasksFor('group', group.id, tasks, taskLinks).filter(
              (t) => !t.completed_at,
            )
            const expanded = expandedId === group.id
            return (
              <div key={group.id}>
                <div className="list-row" onClick={() => setExpandedId(expanded ? null : group.id)}>
                  {/* Display-only when collapsed (tap expands the row); becomes
                      editable once expanded, so the camera affordance only shows
                      where you're focused — not on every row. */}
                  {expanded ? (
                    <AvatarUpload
                      variant="menu"
                      size={42}
                      value={group.avatar_url}
                      onChange={(v) => saveGroup({ avatar_url: v }, group.id)}
                      name={group.name}
                      kind="group"
                      icon={Users}
                      entity="groups"
                      demo={isDemo}
                    />
                  ) : (
                    <Avatar
                      name={group.name}
                      src={group.avatar_url}
                      kind="group"
                      icon={Users}
                      size={42}
                    />
                  )}
                  <div className="row-body">
                    <div className="row-title">{group.name}</div>
                    <div className="row-sub">
                      {members.length} {members.length === 1 ? 'person' : 'people'} ·{' '}
                      {describeGroup(group)}
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="row-chevron"
                    style={{
                      transform: expanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 200ms ease',
                    }}
                  />
                </div>
                {expanded && (
                  <div
                    style={{
                      padding: '4px 14px 14px 68px',
                      background: 'var(--surface)',
                      borderBottom: '0.5px solid var(--separator)',
                    }}
                  >
                    {members.length === 0 ? (
                      <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
                        No one matches these rules yet.
                      </p>
                    ) : (
                      <div className="chips" style={{ marginBottom: 12 }}>
                        {members.map((m) => (
                          <span
                            className="chip accent"
                            key={m.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onOpenPerson(m.id)}
                          >
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {linkedOpen.length > 0 && (
                      <div className="chips" style={{ marginBottom: 12 }}>
                        {linkedOpen.map((t) => (
                          <span
                            className="chip"
                            key={t.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onOpenTask(t)}
                          >
                            <CheckSquare size={11} /> {t.title}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16 }}>
                      <button className="text-btn" onClick={() => onEdit(group)}>
                        Edit rules
                      </button>
                      <button className="text-btn" onClick={() => setLinkingGroup(group)}>
                        Link a task
                      </button>
                      {members.length > 0 && (
                        <button
                          className="text-btn"
                          onClick={() => downloadVcf(group.name, members, orgsById)}
                        >
                          Export contacts
                        </button>
                      )}
                      <button
                        className="text-btn danger"
                        onClick={() =>
                          window.confirm(
                            `Delete group "${group.name}"? (People are not affected.)`,
                          ) && deleteGroup(group.id)
                        }
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

      {linkingGroup && (
        <LinkTaskForm
          entityType="group"
          entityId={linkingGroup.id}
          entityName={linkingGroup.name}
          tasks={tasks}
          existingTaskIds={
            new Set(linkedTasksFor('group', linkingGroup.id, tasks, taskLinks).map((t) => t.id))
          }
          addTask={addTask}
          addTaskLink={addTaskLink}
          onClose={() => setLinkingGroup(null)}
        />
      )}
    </div>
  )
}
