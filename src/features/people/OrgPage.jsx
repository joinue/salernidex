import { useMemo, useState } from 'react'
import { Edit2, Trash2, Download, Plus, Briefcase, ChevronRight } from 'react-feather'
import { isProject, projectProgress, linkedTasksFor } from '../../lib/tasks'
import { downloadVcf } from '../../lib/vcard'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import AvatarUpload from '../../components/ui/AvatarUpload'
import TaskRow from '../tasks/TaskRow'
import { notesMentioning, noteTitle, noteSnippet } from '../../lib/notes'
import LinkTaskForm from './LinkTaskForm'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'

// Full detail page for an organization — mirrors PersonPage/GroupPage: editable
// avatar, an About blurb, the people who belong to it, and linked tasks, each in
// its own section rather than the old expand-in-place row.
export default function OrgPage({
  data,
  orgId,
  onOpenPerson,
  onOpenTask,
  onOpenNote,
  onBack,
  onEdit,
  isDemo = false,
}) {
  const {
    orgs,
    people,
    tasks,
    taskLinks,
    notes,
    addTask,
    addTaskLink,
    completeTask,
    saveOrg,
    deleteOrg,
  } = data
  const org = orgs.find((o) => o.id === orgId)
  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])
  const [linkingTask, setLinkingTask] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const members = useMemo(
    () => people.filter((p) => !p.deleted_at && p.organization_id === orgId),
    [people, orgId],
  )
  const linkedTasks = useMemo(
    () => linkedTasksFor('organization', orgId, tasks, taskLinks),
    [taskLinks, tasks, orgId],
  )
  const mentionedNotes = useMemo(
    () => notesMentioning(notes, 'organization', orgId),
    [notes, orgId],
  )

  const toggleTask = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  if (data.loading) return <EmptyState loading>Loading</EmptyState>
  if (!org) {
    return (
      <div>
        <NavBar backLabel="Back" onBack={onBack} title="Not found" />
        <EmptyState>Organization not found.</EmptyState>
      </div>
    )
  }

  return (
    <div className="detail">
      <NavBar backLabel="Organizations" onBack={onBack} title={org.name}>
        <div className="profile-head">
          <AvatarUpload
            variant="menu"
            size={88}
            value={org.avatar_url}
            onChange={(v) => saveOrg({ avatar_url: v }, org.id)}
            name={org.name}
            kind="org"
            icon={Briefcase}
            entity="orgs"
            demo={isDemo}
          />
          <h1 className="person-name">{org.name}</h1>
          {org.type && <p className="person-sub">{org.type}</p>}

          {(org.tags || []).length > 0 && (
            <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
              {org.tags.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="profile-actions">
            <button className="pill-btn" onClick={() => onEdit(org)}>
              <Edit2 size={15} /> Edit
            </button>
            {members.length > 0 && (
              <button
                className="pill-btn neutral"
                onClick={() => downloadVcf(org.name, members, orgsById)}
                title="Download a .vcf of everyone at this organization"
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

      {org.description && (
        <>
          <SectionLabel>About</SectionLabel>
          <div className="list">
            <p className="notes">{org.description}</p>
          </div>
        </>
      )}

      <SectionLabel>People</SectionLabel>
      <div className="list">
        {members.length === 0 ? (
          <EmptyState inline>No one is linked to this organization yet.</EmptyState>
        ) : (
          members.map((m) => (
            <div className="list-row" key={m.id} onClick={() => onOpenPerson(m.id)}>
              <Avatar name={m.name} src={m.avatar_url} size={38} />
              <div className="row-body">
                <div className="row-title">{m.name}</div>
                {m.role && <div className="row-sub">{m.role}</div>}
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
            No tasks linked yet — a contract to renew, a follow-up to send.
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

      {mentionedNotes.length > 0 && onOpenNote && (
        <>
          <div className="section-label">Mentioned in notes</div>
          <div className="list">
            {mentionedNotes.map((n) => (
              <div className="list-row" key={n.id} role="button" onClick={() => onOpenNote(n.id)}>
                <div className="row-body">
                  <div className="row-title">{noteTitle(n)}</div>
                  {noteSnippet(n) && <div className="row-sub">{noteSnippet(n, 60)}</div>}
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </div>
            ))}
          </div>
        </>
      )}

      {linkingTask && (
        <LinkTaskForm
          entityType="organization"
          entityId={org.id}
          entityName={org.name}
          tasks={tasks}
          existingTaskIds={new Set(linkedTasks.map((t) => t.id))}
          addTask={addTask}
          addTaskLink={addTaskLink}
          onClose={() => setLinkingTask(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${org.name}?`}
          message="This removes the organization. People linked to it are not deleted."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            setConfirmDelete(false)
            deleteOrg(org.id)
            onBack()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
