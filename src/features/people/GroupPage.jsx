import { useMemo, useState } from 'react'
import { Edit2, Trash2, Download, Plus, Users, ChevronRight } from 'react-feather'
import { groupMembers, describeGroup } from '../../lib/groups'
import { isProject, projectProgress, linkedTasksFor } from '../../lib/tasks'
import { downloadVcf } from '../../lib/vcard'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import AvatarUpload from '../../components/ui/AvatarUpload'
import TaskRow from '../tasks/TaskRow'
import LinkTaskForm from './LinkTaskForm'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'

// Full detail page for a group — the People-page treatment applied to a group:
// editable avatar, members, and linked tasks each get their own section instead
// of the old cramped expand-in-place row.
export default function GroupPage({
  data,
  groupId,
  onOpenPerson,
  onOpenTask,
  onBack,
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
    completeTask,
    saveGroup,
    deleteGroup,
  } = data
  const group = groups.find((g) => g.id === groupId)
  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])
  const orgName = (p) => orgsById.get(p?.organization_id)?.name
  const [linkingTask, setLinkingTask] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const members = useMemo(() => (group ? groupMembers(group, people) : []), [group, people])
  const linkedTasks = useMemo(
    () => linkedTasksFor('group', groupId, tasks, taskLinks),
    [taskLinks, tasks, groupId],
  )

  const toggleTask = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  if (data.loading) return <EmptyState loading>Loading</EmptyState>
  if (!group) {
    return (
      <div>
        <NavBar backLabel="Back" onBack={onBack} title="Not found" />
        <EmptyState>Group not found.</EmptyState>
      </div>
    )
  }

  return (
    <div className="detail">
      <NavBar backLabel="Groups" onBack={onBack} title={group.name}>
        <div className="profile-head">
          <AvatarUpload
            variant="menu"
            size={88}
            value={group.avatar_url}
            onChange={(v) => saveGroup({ avatar_url: v }, group.id)}
            name={group.name}
            kind="group"
            icon={Users}
            entity="groups"
            demo={isDemo}
          />
          <h1 className="person-name">{group.name}</h1>
          <p className="person-sub">
            {members.length} {members.length === 1 ? 'person' : 'people'} · {describeGroup(group)}
          </p>

          <div className="profile-actions">
            <button className="pill-btn" onClick={() => onEdit(group)}>
              <Edit2 size={15} /> {group.kind === 'manual' ? 'Edit members' : 'Edit rules'}
            </button>
            {members.length > 0 && (
              <button
                className="pill-btn neutral"
                onClick={() => downloadVcf(group.name, members, orgsById)}
                title="Download a .vcf of everyone in this group"
              >
                <Download size={15} /> Export contacts
              </button>
            )}
            <button className="pill-btn danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      </NavBar>

      <SectionLabel>Members</SectionLabel>
      <div className="list">
        {members.length === 0 ? (
          <EmptyState inline>
            {group.kind === 'manual' ? 'No one added yet.' : 'No one matches these rules yet.'}
          </EmptyState>
        ) : (
          members.map((m) => (
            <div className="list-row" key={m.id} onClick={() => onOpenPerson(m.id)}>
              <Avatar name={m.name} src={m.avatar_url} size={38} />
              <div className="row-body">
                <div className="row-title">{m.name}</div>
                {(m.role || orgName(m)) && (
                  <div className="row-sub">{[m.role, orgName(m)].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <ChevronRight size={18} className="row-chevron" />
            </div>
          ))
        )}
      </div>

      <div className="section-head">
        <SectionLabel>Tasks &amp; projects</SectionLabel>
        <button className="see-all" onClick={() => setLinkingTask(true)}>
          <Plus size={14} style={{ verticalAlign: '-2px' }} /> Add
        </button>
      </div>
      <div className="list">
        {linkedTasks.length === 0 ? (
          <EmptyState inline>
            No tasks linked yet — a shared project, an errand for the group.
          </EmptyState>
        ) : (
          linkedTasks.map((t) => (
            <div className="list-row" key={t.id} role="button" onClick={() => onOpenTask(t)}>
              <TaskRow task={t} onToggle={toggleTask} progress={projectProgress(t.id, tasks)} />
              {isProject(t) && <ChevronRight size={18} className="row-chevron" />}
            </div>
          ))
        )}
      </div>

      {linkingTask && (
        <LinkTaskForm
          entityType="group"
          entityId={group.id}
          entityName={group.name}
          tasks={tasks}
          existingTaskIds={new Set(linkedTasks.map((t) => t.id))}
          addTask={addTask}
          addTaskLink={addTaskLink}
          onClose={() => setLinkingTask(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete group "${group.name}"?`}
          message="This removes the group. The people in it are not affected."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            setConfirmDelete(false)
            deleteGroup(group.id)
            onBack()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
