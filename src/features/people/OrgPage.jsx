import { useMemo, useState } from 'react'
import {
  Edit2,
  Trash2,
  Download,
  Plus,
  Briefcase,
  ChevronRight,
  UserPlus,
  Mail,
  Phone,
  MapPin,
  Globe,
} from 'react-feather'
import { isProject, projectProgress, linkedTasksFor } from '../../lib/tasks'
import {
  orgMembers,
  orgFormerMembers,
  orgHasContact,
  websiteUrl,
  affiliationsFor,
  affiliationDetail,
} from '../../lib/orgs'
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

// Full detail page for an organization — mirrors PersonPage/GroupPage: editable
// avatar, an About blurb, the people who belong to it, and linked tasks, each in
// its own section rather than the old expand-in-place row.
export default function OrgPage({
  data,
  orgId,
  onOpenPerson,
  onOpenTask,
  onOpenNote,
  onAddPerson,
  onBack,
  onEdit,
  isDemo = false,
}) {
  const {
    orgs,
    people,
    affiliations,
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
    () => orgMembers(orgId, people, affiliations),
    [people, affiliations, orgId],
  )
  // People whose link here has ended. Kept visible but apart — "who used to be
  // at this company" is the question a job change creates, and deleting the row
  // would have been the only other answer.
  const formerMembers = useMemo(
    () => orgFormerMembers(orgId, people, affiliations),
    [people, affiliations, orgId],
  )
  // Their title at THIS org, for the member rows.
  const roleAtOrg = (personId) =>
    affiliationDetail(
      affiliationsFor(personId, affiliations).find((a) => a.organization_id === orgId),
    )
  const linkedTasks = useMemo(
    () => linkedTasksFor('organization', orgId, tasks, taskLinks),
    [taskLinks, tasks, orgId],
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
          {/* The headcount is the fact you want from an org at a glance, and it
              was the one thing GroupPage showed that this page didn't. */}
          <p className="person-sub">
            {[org.type, `${members.length} ${members.length === 1 ? 'person' : 'people'}`]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {(org.tags || []).length > 0 && (
            <div className="chips profile-chips">
              {org.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          )}

          <div className="profile-actions">
            <Button variant="pill" icon={Edit2} onClick={() => onEdit(org)}>
              Edit
            </Button>
            {members.length > 0 && (
              <Button
                variant="pill"
                icon={Download}
                className="neutral"
                onClick={() => downloadVcf(org.name, members, orgsById, affiliations)}
                title="Download a .vcf of everyone at this organization"
              >
                Export contacts
              </Button>
            )}
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

      {/* The same value rows PersonPage uses, for the same reason: a vendor's
          main line is often the number you actually want, and before 0032 there
          was nowhere to put it but on whichever person you'd saved. */}
      {orgHasContact(org) && (
        <>
          <SectionLabel>Contact</SectionLabel>
          <div className="list value-stack">
            {org.phone && (
              <a className="value-row" href={`tel:${org.phone.trim()}`}>
                <Phone size={18} />
                <span className="v-col">
                  <span className="v-label">Phone</span>
                  <span className="v-value">{org.phone}</span>
                </span>
              </a>
            )}
            {org.email && (
              <a className="value-row" href={`mailto:${org.email.trim()}`}>
                <Mail size={18} />
                <span className="v-col">
                  <span className="v-label">Email</span>
                  <span className="v-value">{org.email}</span>
                </span>
              </a>
            )}
            {org.website && (
              <a
                className="value-row"
                href={websiteUrl(org.website)}
                target="_blank"
                rel="noreferrer"
              >
                <Globe size={18} />
                <span className="v-col">
                  <span className="v-label">Website</span>
                  <span className="v-value">{org.website}</span>
                </span>
              </a>
            )}
            {org.address && (
              <div className="value-row">
                <MapPin size={18} />
                <span className="v-col">
                  <span className="v-label">Address</span>
                  <span className="v-value">{org.address}</span>
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <SectionLabel
        action={
          onAddPerson &&
          members.length > 0 && (
            <Button variant="text" icon={UserPlus} onClick={() => onAddPerson(org)}>
              Add
            </Button>
          )
        }
      >
        People
      </SectionLabel>
      <div className="list">
        {members.length === 0 ? (
          <EmptyState
            inline
            action={
              onAddPerson && (
                <Button variant="text" icon={UserPlus} onClick={() => onAddPerson(org)}>
                  Add someone here
                </Button>
              )
            }
          >
            No one is linked to this organization yet.
          </EmptyState>
        ) : (
          members.map((m) => (
            <PressableRow key={m.id} onClick={() => onOpenPerson(m.id)}>
              <Avatar name={m.name} src={m.avatar_url} size={38} />
              <div className="row-body">
                <div className="row-title">{m.name}</div>
                {roleAtOrg(m.id) && <div className="row-sub">{roleAtOrg(m.id)}</div>}
              </div>
              <ChevronRight size={18} className="row-chevron" />
            </PressableRow>
          ))
        )}
      </div>

      {formerMembers.length > 0 && (
        <>
          <SectionLabel>Previously here</SectionLabel>
          <div className="list">
            {formerMembers.map((m) => (
              <PressableRow key={m.id} onClick={() => onOpenPerson(m.id)}>
                <Avatar name={m.name} src={m.avatar_url} size={38} />
                <div className="row-body">
                  <div className="row-title">{m.name}</div>
                  {roleAtOrg(m.id) && <div className="row-sub">{roleAtOrg(m.id)}</div>}
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </PressableRow>
            ))}
          </div>
        </>
      )}

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

      <NoteBacklinks notes={notes} type="organization" id={orgId} onOpenNote={onOpenNote} />

      {/* Quiet, at the foot, with air above it — not a filled red pill beside
          Edit, where it carried the same weight as the safest action here. */}
      <div className="danger-zone">
        <Button variant="text" tone="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
          Delete organization
        </Button>
      </div>

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
