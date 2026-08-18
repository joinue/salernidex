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
  Bell,
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
import {
  followUp,
  followUpLabel,
  lastOrgInteraction,
  relativeTime,
  interactionsFor,
  localDay as dayOf,
} from '../../lib/contact'
import { contextAreaFor } from '../../lib/areas'
import {
  KEEP_IN_TOUCH_LABELS,
  INTERACTION_TYPES,
  INTERACTION_BY_ID,
  formatDate,
} from '../../lib/constants'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import AvatarUpload from '../../components/ui/AvatarUpload'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import PressableRow from '../../components/ui/PressableRow'
import SwipeRow from '../../components/ui/SwipeRow'
import TaskRow from '../tasks/TaskRow'
import NoteBacklinks from '../../components/ui/NoteBacklinks'
import InteractionForm from './InteractionForm'
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
    interactions,
    areas,
    tasks,
    taskLinks,
    notes,
    addTask,
    addTaskLink,
    addInteraction,
    saveInteraction,
    deleteInteraction,
    completeTask,
    saveOrg,
    deleteOrg,
  } = data
  const org = orgs.find((o) => o.id === orgId)
  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])
  const [linkingTask, setLinkingTask] = useState(false)
  const [logType, setLogType] = useState(null) // null | type id → opens InteractionForm
  const [editingInteraction, setEditingInteraction] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The org's own touchpoint history (0042). Before it, an org could be phoned
  // but not followed up with: whatever you'd discussed with the account had to
  // be filed under whichever person happened to be your contact there, and it
  // went with them when they changed jobs.
  const timeline = useMemo(
    () => interactionsFor('organization', orgId, interactions || []),
    [interactions, orgId],
  )

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

  const last = lastOrgInteraction(org.id, interactions)
  // Same live status a person's profile shows, from the same helper — an account
  // you meant to check in on quarterly should read "Overdue by 12 days" here for
  // the same reason it does there.
  const due = followUpLabel(followUp(org, last?.occurred_at))
  const contextArea = contextAreaFor(org, areas)

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

          {/* Same chip row a person gets, and for the same reasons: the context
              explains the record, and the cadence status is the fact you came
              for. Rendered whenever any of the three has something to say. */}
          {(contextArea || due || last || (org.tags || []).length > 0) && (
            <div className="chips profile-chips">
              {contextArea && (
                <Chip title={`Filed under ${contextArea.name}`}>
                  {contextArea.icon ? `${contextArea.icon} ` : ''}
                  {contextArea.name}
                </Chip>
              )}
              {due && <Chip tone={due.tone}>{due.text}</Chip>}
              {last && <Chip>Last contact · {relativeTime(last.occurred_at)}</Chip>}
              {(org.tags || []).map((t) => (
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

      {/* Identical to PersonPage's, deliberately: logging a call with the
          account and logging one with a person are the same action, and giving
          the org a different-looking control would imply otherwise. */}
      <SectionLabel>Log a touchpoint</SectionLabel>
      <div className="quick-row">
        {INTERACTION_TYPES.map((t) => (
          <button key={t.id} className="quick-chip" onClick={() => setLogType(t.id)}>
            <t.icon size={16} /> {t.verb}
          </button>
        ))}
      </div>

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

      {/* The account's own history, in the same shape PersonPage renders. */}
      {timeline.length > 0 && (
        <>
          <SectionLabel>Activity</SectionLabel>
          <div className="list">
            {timeline.map((it) => {
              const meta = INTERACTION_BY_ID[it.type] || INTERACTION_BY_ID.note
              const Icon = meta.icon
              return (
                <SwipeRow
                  key={it.id}
                  label={`${meta.label} · ${formatDate(dayOf(it.occurred_at))}`}
                  onClick={() => setEditingInteraction(it)}
                  actions={[
                    { label: 'Edit', icon: Edit2, onClick: () => setEditingInteraction(it) },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      variant: 'danger',
                      onClick: () => deleteInteraction(it.id),
                    },
                  ]}
                >
                  <div className="activity-row">
                    <span className="activity-icon">
                      <Icon size={16} />
                    </span>
                    <div className="row-body">
                      <div className="activity-head">
                        <span className="activity-label">{meta.label}</span>
                        <span className="activity-time">
                          {formatDate(dayOf(it.occurred_at))}
                          <span className="muted"> · {relativeTime(it.occurred_at)}</span>
                        </span>
                      </div>
                      {it.note && <div className="activity-note">{it.note}</div>}
                    </div>
                  </div>
                </SwipeRow>
              )
            })}
          </div>
        </>
      )}

      {/* Only when set — an org with no cadence has nothing to say here, unlike
          a person, whose profile always carries the row so it can be discovered.
          Most orgs are a phone number you call when the boiler breaks. */}
      {org.keep_in_touch_days ? (
        <>
          <SectionLabel>Details</SectionLabel>
          <div className="list">
            <div className="value-row">
              <Bell size={18} />
              <span className="v-label">Keep in touch</span>
              <span className="v-value">
                {KEEP_IN_TOUCH_LABELS[org.keep_in_touch_days] ||
                  `Every ${org.keep_in_touch_days} days`}
              </span>
            </div>
          </div>
        </>
      ) : null}

      <NoteBacklinks notes={notes} type="organization" id={orgId} onOpenNote={onOpenNote} />

      {/* Quiet, at the foot, with air above it — not a filled red pill beside
          Edit, where it carried the same weight as the safest action here. */}
      <div className="danger-zone">
        <Button variant="text" tone="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
          Delete organization
        </Button>
      </div>

      {logType && (
        <InteractionForm
          subject={org}
          subjectKind="organization"
          presetType={logType}
          onSave={addInteraction}
          onClose={() => setLogType(null)}
        />
      )}

      {editingInteraction && (
        <InteractionForm
          subject={org}
          subjectKind="organization"
          interaction={editingInteraction}
          onSave={saveInteraction}
          onClose={() => setEditingInteraction(null)}
        />
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
