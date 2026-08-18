import { useMemo, useState } from 'react'
import {
  Mail,
  Phone,
  MapPin,
  Gift,
  Edit2,
  UserPlus,
  Archive,
  Trash2,
  RotateCcw,
  Lock,
  X,
  Bell,
  Calendar,
  Plus,
  Home,
  Download,
  ChevronRight,
  Globe,
  Briefcase,
} from 'react-feather'
import { downloadVcf } from '../../lib/vcard'
import { socialUrl } from '../../lib/contactChannels'
import {
  PRIVACY_LABELS,
  KEEP_IN_TOUCH_LABELS,
  TIER_LABELS,
  INTERACTION_TYPES,
  INTERACTION_BY_ID,
  SOCIAL_BY_ID,
  formatDate,
} from '../../lib/constants'
import { followUp, followUpLabel, lastInteraction, relativeTime } from '../../lib/contact'
import {
  personSummary,
  currentAffiliations,
  affiliationsFor,
  affiliationDetail,
} from '../../lib/orgs'
import { isProject, projectProgress, linkedTasksFor } from '../../lib/tasks'
import NoteBacklinks from '../../components/ui/NoteBacklinks'
import { memberName } from '../../lib/household'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import AvatarUpload from '../../components/ui/AvatarUpload'
import Button from '../../components/ui/Button'
import Chip from '../../components/ui/Chip'
import PressableRow from '../../components/ui/PressableRow'
import TaskRow from '../tasks/TaskRow'
import InteractionForm from './InteractionForm'
import KeyDateForm from './KeyDateForm'
import LinkTaskForm from './LinkTaskForm'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useConfirm } from '../../hooks/useConfirm'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'

export default function PersonPage({
  data,
  personId,
  onOpenPerson,
  onOpenOrg,
  onOpenTask,
  onOpenNote,
  onBack,
  onEdit,
  onConnect,
  isDemo = false,
}) {
  const {
    people,
    orgs,
    affiliations,
    relationships,
    interactions,
    families,
    keyDates,
    tasks,
    taskLinks,
    notes,
    completeTask,
    addTask,
    addTaskLink,
    savePerson,
    deletePerson,
    restorePerson,
    purgePerson,
    userId,
    deleteRelationship,
    addInteraction,
    deleteInteraction,
    addKeyDate,
    deleteKeyDate,
  } = data
  const person = people.find((p) => p.id === personId)
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])
  const summary = (p) => personSummary(p, affiliations, orgsById)
  const [logType, setLogType] = useState(null) // null | type id → opens InteractionForm
  const [addingDate, setAddingDate] = useState(false)
  const [linkingTask, setLinkingTask] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false) // permanent-delete confirmation
  const confirm = useConfirm()

  // Both of these wipe a row with no undo toast behind them, so a quick tap on
  // the little X shouldn't be enough — ask first.
  const removeKeyDate = async (kd) => {
    if (await confirm({ title: `Remove “${kd.label}”?`, confirmLabel: 'Remove', danger: true }))
      deleteKeyDate(kd.id)
  }
  const removeConnection = async (rel, other) => {
    if (
      await confirm({
        title: `Remove your connection to ${other.name}?`,
        confirmLabel: 'Remove',
        danger: true,
      })
    )
      deleteRelationship(rel.id)
  }

  const timeline = useMemo(
    () =>
      (interactions || [])
        .filter((i) => i.person_id === personId)
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
    [interactions, personId],
  )

  // The reverse of ProjectDetail's "Related people": tasks/projects this person
  // is linked to via task_links. Open first (soonest-due), completed after.
  const linkedTasks = useMemo(
    () => linkedTasksFor('person', personId, tasks, taskLinks),
    [taskLinks, tasks, personId],
  )
  const toggleTask = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  if (!person) {
    return (
      <div>
        <NavBar backLabel="Back" onBack={onBack} title="Not found" />
        <EmptyState>Person not found.</EmptyState>
      </div>
    )
  }

  const connections = relationships
    .filter((r) => r.person_a_id === person.id || r.person_b_id === person.id)
    .map((r) => {
      const otherId = r.person_a_id === person.id ? r.person_b_id : r.person_a_id
      return { rel: r, other: byId.get(otherId) }
    })
    .filter((c) => c.other && !c.other.deleted_at)

  // An archived person is a record, not a working contact: the page keeps every
  // fact readable but stops offering the edits (log a touchpoint, add a date,
  // link a task, change the photo) that only made sense while they were active.
  const archived = !!person.deleted_at
  const last = lastInteraction(person.id, interactions)
  // The cadence the user set, stated as a live status rather than as a setting
  // buried in Details — "Overdue by 12 days", not "every 30 days" plus mental
  // arithmetic against "last contact · 5w ago".
  const due = followUpLabel(followUp(person, last?.occurred_at))
  const hasContact = Boolean(
    person.email ||
    person.phone ||
    person.address ||
    person.birthday ||
    (person.emails || []).length ||
    (person.phones || []).length ||
    (person.socials || []).length,
  )
  const family = person.family_id ? families.find((f) => f.id === person.family_id) : null
  const familyMembers = family
    ? people.filter((p) => p.family_id === family.id && p.id !== person.id && !p.deleted_at)
    : []
  // Current links first (primary at the top), then the ended ones as history.
  const personAffiliations = [
    ...currentAffiliations(person.id, affiliations, orgsById),
    ...affiliationsFor(person.id, affiliations).filter((a) => a.ended_on),
  ]
    .map((link) => ({ link, org: orgsById.get(link.organization_id) }))
    .filter((row) => row.org)
  const personDates = keyDates
    .filter((kd) => kd.person_id === person.id)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  // Ownership: only the creator may permanently delete. Null created_by (legacy
  // data) counts as yours so it isn't stranded.
  const mine = !person.created_by || person.created_by === userId
  const ownerName = memberName(person.created_by)

  return (
    <div className="detail">
      <NavBar backLabel="People" onBack={onBack} title={person.name}>
        <div className="profile-head">
          {archived ? (
            <Avatar name={person.name} src={person.avatar_url} size={88} />
          ) : (
            <AvatarUpload
              variant="menu"
              size={88}
              value={person.avatar_url}
              onChange={(v) => savePerson({ avatar_url: v }, person.id)}
              name={person.name}
              entity="people"
              demo={isDemo}
            />
          )}
          <h1 className="person-name">{person.name}</h1>
          {summary(person) && <p className="person-sub">{summary(person)}</p>}

          <div className="chips profile-chips">
            {archived && <Chip>Archived</Chip>}
            {person.tier && (
              <Chip className={`tier-${person.tier}`}>{TIER_LABELS[person.tier]}</Chip>
            )}
            {due && <Chip tone={due.tone}>{due.text}</Chip>}
            {last && <Chip>Last contact · {relativeTime(last.occurred_at)}</Chip>}
            {(person.tags || []).map((t) => (
              <Chip tone="accent" key={t}>
                {t}
              </Chip>
            ))}
          </div>

          {/* Safe actions only. Archive and Delete forever live in the danger
              zone at the foot of the page — beside Edit they read as routine,
              and five pills wrapped onto three lines pushed the first real
              content below the fold. */}
          <div className="profile-actions">
            {archived && (
              <Button variant="pill" icon={RotateCcw} onClick={() => restorePerson(person.id)}>
                Restore
              </Button>
            )}
            <Button variant="pill" icon={Edit2} onClick={() => onEdit(person)}>
              Edit
            </Button>
            {!archived && (
              <Button
                variant="pill"
                icon={UserPlus}
                className="neutral"
                onClick={() => onConnect(person)}
              >
                Connect
              </Button>
            )}
            <Button
              variant="pill"
              icon={Download}
              className="neutral"
              onClick={() => downloadVcf(person.name, [person], orgsById, affiliations)}
              title="Download a .vcf for your phone's address book"
            >
              Save contact
            </Button>
          </div>
          {archived && !mine && (
            <p className="profile-note">
              Added by {ownerName || 'another member'}. Only they can delete it permanently.
            </p>
          )}
        </div>
      </NavBar>

      {/* Quick-log: tap a type to log a touchpoint */}
      {!archived && (
        <>
          <SectionLabel>Log a touchpoint</SectionLabel>
          <div className="quick-row">
            {INTERACTION_TYPES.map((t) => (
              <button key={t.id} className="quick-chip" onClick={() => setLogType(t.id)}>
                <t.icon size={16} /> {t.verb}
              </button>
            ))}
          </div>
        </>
      )}

      {hasContact && (
        <>
          <SectionLabel>Contact</SectionLabel>
          <div className="list value-stack">
            {person.email && (
              <a className="value-row" href={`mailto:${person.email.trim()}`}>
                <Mail size={18} />
                <span className="v-col">
                  <span className="v-label">Email</span>
                  <span className="v-value">{person.email}</span>
                </span>
              </a>
            )}
            {(person.emails || []).map((em, i) => (
              <a className="value-row" key={`em-${i}`} href={`mailto:${em.value.trim()}`}>
                <Mail size={18} />
                <span className="v-col">
                  <span className="v-label">{em.label || 'Email'}</span>
                  <span className="v-value">{em.value}</span>
                </span>
              </a>
            ))}
            {person.phone && (
              <a className="value-row" href={`tel:${person.phone.trim()}`}>
                <Phone size={18} />
                <span className="v-col">
                  <span className="v-label">Phone</span>
                  <span className="v-value">{person.phone}</span>
                </span>
              </a>
            )}
            {(person.phones || []).map((ph, i) => (
              <a className="value-row" key={`ph-${i}`} href={`tel:${ph.value.trim()}`}>
                <Phone size={18} />
                <span className="v-col">
                  <span className="v-label">{ph.label || 'Phone'}</span>
                  <span className="v-value">{ph.value}</span>
                </span>
              </a>
            ))}
            {(person.socials || []).map((s, i) => {
              const url = socialUrl(s)
              const label = SOCIAL_BY_ID[s.platform]?.label || 'Link'
              return url ? (
                <a
                  className="value-row"
                  key={`so-${i}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Globe size={18} />
                  <span className="v-col">
                    <span className="v-label">{label}</span>
                    <span className="v-value">{s.value}</span>
                  </span>
                </a>
              ) : (
                <div className="value-row" key={`so-${i}`}>
                  <Globe size={18} />
                  <span className="v-col">
                    <span className="v-label">{label}</span>
                    <span className="v-value">{s.value}</span>
                  </span>
                </div>
              )
            })}
            {person.address && (
              <div className="value-row">
                <MapPin size={18} />
                <span className="v-col">
                  <span className="v-label">Address</span>
                  <span className="v-value">{person.address}</span>
                </span>
              </div>
            )}
            {person.birthday && (
              <div className="value-row">
                <Gift size={18} />
                <span className="v-col">
                  <span className="v-label">Birthday</span>
                  <span className="v-value">{formatDate(person.birthday)}</span>
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Every org they're attached to, current and former. The header line
          shows at most one of these (and often none — see personSummary); this
          is where the rest of the picture lives, including the employer we
          deliberately keep out from under their name. */}
      {personAffiliations.length > 0 && (
        <>
          <SectionLabel>Organizations</SectionLabel>
          <div className="list">
            {personAffiliations.map(({ link, org }) => (
              <PressableRow key={link.id} onClick={() => onOpenOrg?.(org.id)}>
                <Avatar
                  name={org.name}
                  src={org.avatar_url}
                  kind="org"
                  icon={Briefcase}
                  size={38}
                />
                <div className="row-body">
                  <div className="row-title">{org.name}</div>
                  {affiliationDetail(link) && (
                    <div className="row-sub">{affiliationDetail(link)}</div>
                  )}
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </PressableRow>
            ))}
          </div>
        </>
      )}

      {/* Key dates — anniversaries and the like, beyond birthday.
          The card only renders when there's something in it: an always-present
          "nothing yet" card in each of three sections put ~400px of empty state
          between a new contact's header and anything real. The label keeps its
          "+ Add", so the way in survives. */}
      {(personDates.length > 0 || !archived) && (
        <>
          <SectionLabel
            action={
              !archived && (
                <Button variant="text" icon={Plus} onClick={() => setAddingDate(true)}>
                  Add
                </Button>
              )
            }
          >
            Key dates
          </SectionLabel>
          {personDates.length > 0 && (
            <div className="list value-stack">
              {personDates.map((kd) => (
                <div className="value-row" key={kd.id}>
                  <Calendar size={18} />
                  {/* Stacked label-over-value, like Contact: side by side, a
                      long label ("Wedding anniversary") wouldn't shrink and
                      shoved the date off the row at 375px. */}
                  <span className="v-col">
                    <span className="v-label">{kd.label}</span>
                    <span className="v-value">
                      {formatDate(kd.date)}
                      <span className="muted"> · {kd.annual ? 'every year' : 'one-time'}</span>
                    </span>
                  </span>
                  {!archived && (
                    <IconButton
                      icon={X}
                      variant="danger"
                      label={`Delete ${kd.label}`}
                      onClick={() => removeKeyDate(kd)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {family && familyMembers.length > 0 && (
        <>
          <SectionLabel>
            <Home size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            {family.name}
          </SectionLabel>
          <div className="list">
            {familyMembers.map((m) => (
              <PressableRow key={m.id} onClick={() => onOpenPerson(m.id)}>
                <Avatar name={m.name} src={m.avatar_url} size={38} />
                <div className="row-body">
                  <div className="row-title">{m.name}</div>
                  {summary(m) && <div className="row-sub">{summary(m)}</div>}
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </PressableRow>
            ))}
          </div>
        </>
      )}

      {/* Linked tasks & projects — the reverse of ProjectDetail's related people */}
      {(linkedTasks.length > 0 || !archived) && (
        <>
          <SectionLabel
            action={
              !archived && (
                <Button variant="text" icon={Plus} onClick={() => setLinkingTask(true)}>
                  Add
                </Button>
              )
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
        </>
      )}

      <NoteBacklinks notes={notes} type="person" id={personId} onOpenNote={onOpenNote} />

      {/* Activity timeline. No empty state: the quick-log row at the top of the
          page is the invitation to start one, so an empty "no touchpoints yet"
          card underneath it just says the same thing twice. */}
      {timeline.length > 0 && (
        <>
          <SectionLabel>Activity</SectionLabel>
          <div className="list">
            {timeline.map((it) => {
              const meta = INTERACTION_BY_ID[it.type] || INTERACTION_BY_ID.note
              const Icon = meta.icon
              return (
                <div className="activity-row" key={it.id}>
                  <span className="activity-icon">
                    <Icon size={16} />
                  </span>
                  <div className="row-body">
                    <div className="activity-head">
                      <span className="activity-label">{meta.label}</span>
                      <span className="activity-time">{relativeTime(it.occurred_at)}</span>
                    </div>
                    {it.note && <div className="activity-note">{it.note}</div>}
                  </div>
                  {!archived && (
                    <IconButton
                      icon={X}
                      variant="danger"
                      label="Delete entry"
                      onClick={() => deleteInteraction(it.id)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {connections.length > 0 && (
        <>
          <SectionLabel>Also knows</SectionLabel>
          <div className="list">
            {connections.map(({ rel, other }) => (
              <PressableRow key={rel.id} onClick={() => onOpenPerson(other.id)}>
                <Avatar name={other.name} src={other.avatar_url} size={38} />
                <div className="row-body">
                  <div className="row-title">{other.name}</div>
                  <div className="row-sub">
                    {rel.relationship_type.replace(/_/g, ' ')}
                    {summary(other) ? ` · ${summary(other)}` : ''}
                    {rel.notes ? ` · ${rel.notes}` : ''}
                  </div>
                </div>
                {!archived && (
                  <IconButton
                    icon={X}
                    variant="danger"
                    label={`Remove connection to ${other.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeConnection(rel, other)
                    }}
                  />
                )}
              </PressableRow>
            ))}
          </div>
        </>
      )}

      {person.notes && (
        <>
          <SectionLabel>Notes</SectionLabel>
          <div className="list">
            <p className="notes">{person.notes}</p>
          </div>
        </>
      )}

      <SectionLabel>Details</SectionLabel>
      <div className="list">
        <div className="value-row">
          <Bell size={18} />
          <span className="v-label">Keep in touch</span>
          <span className="v-value">
            {KEEP_IN_TOUCH_LABELS[person.keep_in_touch_days] || 'No reminder'}
          </span>
        </div>
        <div className="value-row">
          <Lock size={18} />
          <span className="v-label">Privacy</span>
          <span className="v-value">
            {PRIVACY_LABELS[person.privacy_level] || person.privacy_level}
          </span>
        </div>
      </div>

      {/* Destructive actions live at the foot of the page and read quietly —
          the same treatment ProjectDetail got. Archive is reversible and backed
          by an undo toast, so it commits directly; Delete forever confirms. */}
      {(!archived || mine) && (
        <div className="danger-zone">
          {archived ? (
            <Button
              variant="text"
              tone="danger"
              icon={Trash2}
              onClick={() => setConfirmPurge(true)}
            >
              Delete forever
            </Button>
          ) : (
            <Button
              variant="text"
              tone="danger"
              icon={Archive}
              onClick={() => deletePerson(person.id)}
            >
              Archive
            </Button>
          )}
        </div>
      )}

      {logType && (
        <InteractionForm
          person={person}
          presetType={logType}
          onSave={addInteraction}
          onClose={() => setLogType(null)}
        />
      )}

      {addingDate && (
        <KeyDateForm person={person} onSave={addKeyDate} onClose={() => setAddingDate(false)} />
      )}

      {linkingTask && (
        <LinkTaskForm
          entityType="person"
          entityId={person.id}
          entityName={person.name}
          tasks={tasks}
          existingTaskIds={new Set(linkedTasks.map((t) => t.id))}
          addTask={addTask}
          addTaskLink={addTaskLink}
          onClose={() => setLinkingTask(false)}
        />
      )}

      {confirmPurge && (
        <ConfirmDialog
          title={`Delete ${person.name} forever?`}
          message="This permanently removes the contact along with their relationships and logged touchpoints. This can't be undone."
          confirmLabel="Delete forever"
          danger
          onConfirm={() => {
            setConfirmPurge(false)
            purgePerson(person.id)
            onBack()
          }}
          onCancel={() => setConfirmPurge(false)}
        />
      )}
    </div>
  )
}
