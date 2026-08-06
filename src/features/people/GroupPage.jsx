import { useMemo, useState } from 'react'
import { Edit2, Trash2, Download, Plus, Users, ChevronRight } from 'react-feather'
import { groupMembers, describeGroup } from '../../lib/groups'
import { isProject, projectProgress, linkedTasksFor } from '../../lib/tasks'
import { personSummary } from '../../lib/orgs'
import { downloadVcf } from '../../lib/vcard'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import AvatarUpload from '../../components/ui/AvatarUpload'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import PressableRow from '../../components/ui/PressableRow'
import TaskRow from '../tasks/TaskRow'
import NoteBacklinks from '../../components/ui/NoteBacklinks'
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
  onOpenNote,
  onBack,
  onEdit,
  isDemo = false,
}) {
  const {
    groups,
    people,
    orgs,
    affiliations,
    tasks,
    taskLinks,
    notes,
    addTask,
    addTaskLink,
    completeTask,
    saveGroup,
    deleteGroup,
  } = data
  const group = groups.find((g) => g.id === groupId)
  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])
  const summary = (p) => personSummary(p, affiliations, orgsById)
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

  // What "edit" means depends on the flavour, and the empty state has to offer
  // the same thing the action row does — otherwise an empty group is a page
  // telling you no one matches with no way to do anything about it.
  const editLabel = group?.kind === 'manual' ? 'Edit members' : 'Edit rules'

  // A smart group's rule was compressed into one prose line ("work AND client ·
  // not: former"), which is the thing you most need to read before pressing
  // "Edit rules". As chips each clause is scannable, and the tone says whether
  // it lets people in or keeps them out.
  const ruleChips =
    group && group.kind !== 'manual'
      ? [
          ...(group.all_tags || []).map((t) => ({ key: `all-${t}`, tone: 'accent', text: t })),
          ...(group.any_tags || []).map((t) => ({
            key: `any-${t}`,
            tone: 'neutral',
            text: `any: ${t}`,
          })),
          ...(group.none_tags || []).map((t) => ({
            key: `not-${t}`,
            tone: 'danger',
            text: `not: ${t}`,
          })),
        ]
      : []

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
            {members.length} {members.length === 1 ? 'person' : 'people'} ·{' '}
            {ruleChips.length ? 'Smart group' : describeGroup(group)}
          </p>
          {ruleChips.length > 0 && (
            <div className="chips profile-chips">
              {ruleChips.map((c) => (
                <Chip key={c.key} tone={c.tone}>
                  {c.text}
                </Chip>
              ))}
            </div>
          )}

          <div className="profile-actions">
            <Button variant="pill" icon={Edit2} onClick={() => onEdit(group)}>
              {editLabel}
            </Button>
            {members.length > 0 && (
              <Button
                variant="pill"
                icon={Download}
                className="neutral"
                onClick={() => downloadVcf(group.name, members, orgsById, affiliations)}
                title="Download a .vcf of everyone in this group"
              >
                Export contacts
              </Button>
            )}
          </div>
        </div>
      </NavBar>

      <SectionLabel>Members</SectionLabel>
      <div className="list">
        {members.length === 0 ? (
          <EmptyState
            inline
            action={
              <Button variant="text" icon={Edit2} onClick={() => onEdit(group)}>
                {editLabel}
              </Button>
            }
          >
            {group.kind === 'manual' ? 'No one added yet.' : 'No one matches these rules yet.'}
          </EmptyState>
        ) : (
          members.map((m) => (
            <PressableRow key={m.id} onClick={() => onOpenPerson(m.id)}>
              <Avatar name={m.name} src={m.avatar_url} size={38} />
              <div className="row-body">
                <div className="row-title">{m.name}</div>
                {summary(m) && <div className="row-sub">{summary(m)}</div>}
              </div>
              <ChevronRight size={18} className="row-chevron" />
            </PressableRow>
          ))
        )}
      </div>

      <SectionLabel
        action={
          <Button variant="text" icon={Plus} onClick={() => setLinkingTask(true)}>
            Add
          </Button>
        }
      >
        Tasks &amp; projects
      </SectionLabel>
      {linkedTasks.length > 0 && (
        <div className="list">
          {linkedTasks.map((t) => (
            <PressableRow key={t.id} onClick={() => onOpenTask(t)}>
              <TaskRow task={t} onToggle={toggleTask} progress={projectProgress(t.id, tasks)} />
              {isProject(t) && <ChevronRight size={18} className="row-chevron" />}
            </PressableRow>
          ))}
        </div>
      )}

      <NoteBacklinks notes={notes} type="group" id={groupId} onOpenNote={onOpenNote} />

      <div className="danger-zone">
        <Button variant="text" tone="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
          Delete group
        </Button>
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
