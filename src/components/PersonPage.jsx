import { useMemo, useState } from 'react'
import {
  ArrowLeft,
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
} from 'react-feather'
import { downloadVcf } from '../lib/vcard'
import { socialUrl } from '../lib/contactChannels'
import {
  PRIVACY_LABELS,
  KEEP_IN_TOUCH_LABELS,
  TIER_LABELS,
  INTERACTION_TYPES,
  INTERACTION_BY_ID,
  SOCIAL_BY_ID,
  formatDate,
} from '../lib/constants'
import { lastInteraction, relativeTime } from '../lib/contact'
import { isProject, projectProgress, linkedTasksFor } from '../lib/tasks'
import { memberName } from '../lib/household'
import haptics from '../lib/haptics'
import Avatar from './Avatar'
import AvatarUpload from './AvatarUpload'
import TaskRow from './TaskRow'
import InteractionForm from './InteractionForm'
import KeyDateForm from './KeyDateForm'
import LinkTaskForm from './LinkTaskForm'
import ConfirmDialog from './ConfirmDialog'

export default function PersonPage({
  data,
  personId,
  onOpenPerson,
  onOpenTask,
  onBack,
  onEdit,
  onConnect,
  isDemo = false,
}) {
  const {
    people,
    orgs,
    relationships,
    interactions,
    families,
    keyDates,
    tasks,
    taskLinks,
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
  const orgName = (p) => orgsById.get(p?.organization_id)?.name
  const [logType, setLogType] = useState(null) // null | type id → opens InteractionForm
  const [addingDate, setAddingDate] = useState(false)
  const [linkingTask, setLinkingTask] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false) // permanent-delete confirmation

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
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <p className="empty">Person not found.</p>
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

  const last = lastInteraction(person.id, interactions)
  const hasContact =
    person.email ||
    person.phone ||
    person.address ||
    person.birthday ||
    (person.emails || []).length ||
    (person.phones || []).length ||
    (person.socials || []).length
  const family = person.family_id ? families.find((f) => f.id === person.family_id) : null
  const familyMembers = family
    ? people.filter((p) => p.family_id === family.id && p.id !== person.id && !p.deleted_at)
    : []
  const personDates = keyDates
    .filter((kd) => kd.person_id === person.id)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  // Ownership: only the creator may permanently delete. Null created_by (legacy
  // data) counts as yours so it isn't stranded.
  const mine = !person.created_by || person.created_by === userId
  const ownerName = memberName(person.created_by)

  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="profile-head">
        <AvatarUpload
          variant="menu"
          size={88}
          value={person.avatar_url}
          onChange={(v) => savePerson({ avatar_url: v }, person.id)}
          name={person.name}
          entity="people"
          demo={isDemo}
        />
        <h1 className="person-name">
          {person.name}
          {person.deleted_at && (
            <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>
              {' '}
              · archived
            </span>
          )}
        </h1>
        {(person.role || orgName(person)) && (
          <p className="person-sub">{[person.role, orgName(person)].filter(Boolean).join(' · ')}</p>
        )}

        <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
          {person.tier && (
            <span className={`chip tier-${person.tier}`}>{TIER_LABELS[person.tier]}</span>
          )}
          {last && <span className="chip">Last contact · {relativeTime(last.occurred_at)}</span>}
          {(person.tags || []).map((t) => (
            <span className="chip accent" key={t}>
              {t}
            </span>
          ))}
        </div>

        <div className="profile-actions">
          <button className="pill-btn" onClick={() => onEdit(person)}>
            <Edit2 size={15} /> Edit
          </button>
          <button className="pill-btn neutral" onClick={() => onConnect(person)}>
            <UserPlus size={15} /> Connect
          </button>
          <button
            className="pill-btn neutral"
            onClick={() => downloadVcf(person.name, [person], orgsById)}
            title="Download a .vcf for your phone's address book"
          >
            <Download size={15} /> Save contact
          </button>
          {person.deleted_at ? (
            <>
              <button className="pill-btn" onClick={() => restorePerson(person.id)}>
                <RotateCcw size={15} /> Restore
              </button>
              {mine && (
                <button className="pill-btn danger" onClick={() => setConfirmPurge(true)}>
                  <Trash2 size={15} /> Delete forever
                </button>
              )}
            </>
          ) : (
            <button className="pill-btn danger" onClick={() => deletePerson(person.id)}>
              <Archive size={15} /> Archive
            </button>
          )}
        </div>
        {person.deleted_at && !mine && (
          <p className="muted" style={{ fontSize: 13, marginTop: 8, textAlign: 'center' }}>
            Added by {ownerName || 'another member'} — only they can delete it permanently.
          </p>
        )}
      </div>

      {/* Quick-log: tap a type to log a touchpoint */}
      <div className="section-label">Log a touchpoint</div>
      <div className="quick-row">
        {INTERACTION_TYPES.map((t) => (
          <button key={t.id} className="quick-chip" onClick={() => setLogType(t.id)}>
            <t.icon size={16} /> {t.verb}
          </button>
        ))}
      </div>

      {hasContact && (
        <>
          <div className="section-label">Contact</div>
          <div className="list">
            {person.email && (
              <a className="value-row" href={`mailto:${person.email}`}>
                <Mail size={18} />
                <span className="v-label">Email</span>
                <span className="v-value" style={{ color: 'var(--accent)' }}>
                  {person.email}
                </span>
              </a>
            )}
            {(person.emails || []).map((em, i) => (
              <a className="value-row" key={`em-${i}`} href={`mailto:${em.value}`}>
                <Mail size={18} />
                <span className="v-label">{em.label || 'Email'}</span>
                <span className="v-value" style={{ color: 'var(--accent)' }}>
                  {em.value}
                </span>
              </a>
            ))}
            {person.phone && (
              <a className="value-row" href={`tel:${person.phone}`}>
                <Phone size={18} />
                <span className="v-label">Phone</span>
                <span className="v-value" style={{ color: 'var(--accent)' }}>
                  {person.phone}
                </span>
              </a>
            )}
            {(person.phones || []).map((ph, i) => (
              <a className="value-row" key={`ph-${i}`} href={`tel:${ph.value}`}>
                <Phone size={18} />
                <span className="v-label">{ph.label || 'Phone'}</span>
                <span className="v-value" style={{ color: 'var(--accent)' }}>
                  {ph.value}
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
                  <span className="v-label">{label}</span>
                  <span className="v-value" style={{ color: 'var(--accent)' }}>
                    {s.value}
                  </span>
                </a>
              ) : (
                <div className="value-row" key={`so-${i}`}>
                  <Globe size={18} />
                  <span className="v-label">{label}</span>
                  <span className="v-value">{s.value}</span>
                </div>
              )
            })}
            {person.address && (
              <div className="value-row">
                <MapPin size={18} />
                <span className="v-label">Address</span>
                <span className="v-value">{person.address}</span>
              </div>
            )}
            {person.birthday && (
              <div className="value-row">
                <Gift size={18} />
                <span className="v-label">Birthday</span>
                <span className="v-value">{formatDate(person.birthday)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Key dates — anniversaries and the like, beyond birthday */}
      <div className="section-head">
        <div className="section-label">Key dates</div>
        <button className="see-all" onClick={() => setAddingDate(true)}>
          <Plus size={14} style={{ verticalAlign: '-2px' }} /> Add
        </button>
      </div>
      <div className="list">
        {personDates.length === 0 ? (
          <p className="empty-inline">No key dates yet — anniversaries, memorials, big days.</p>
        ) : (
          personDates.map((kd) => (
            <div className="value-row" key={kd.id}>
              <Calendar size={18} />
              <span className="v-label">{kd.label}</span>
              <span className="v-value">
                {formatDate(kd.date)}
                <span className="muted"> · {kd.annual ? 'every year' : 'one-time'}</span>
              </span>
              <button
                className="icon-btn danger"
                onClick={() => deleteKeyDate(kd.id)}
                aria-label={`Delete ${kd.label}`}
              >
                <X size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {family && familyMembers.length > 0 && (
        <>
          <div className="section-label">
            <Home size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            {family.name}
          </div>
          <div className="list">
            {familyMembers.map((m) => (
              <div className="list-row" key={m.id} onClick={() => onOpenPerson(m.id)}>
                <Avatar name={m.name} src={m.avatar_url} size={38} />
                <div className="row-body">
                  <div className="row-title">{m.name}</div>
                  {(m.role || orgName(m)) && (
                    <div className="row-sub">
                      {[m.role, orgName(m)].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Linked tasks & projects — the reverse of ProjectDetail's related people */}
      <div className="section-head">
        <div className="section-label">Tasks &amp; projects</div>
        <button className="see-all" onClick={() => setLinkingTask(true)}>
          <Plus size={14} style={{ verticalAlign: '-2px' }} /> Add
        </button>
      </div>
      <div className="list">
        {linkedTasks.length === 0 ? (
          <p className="empty-inline">
            No tasks linked yet — a “follow up”, a gift to buy, a shared project.
          </p>
        ) : (
          linkedTasks.map((t) => (
            <div className="list-row" key={t.id} role="button" onClick={() => onOpenTask(t)}>
              <TaskRow task={t} onToggle={toggleTask} progress={projectProgress(t.id, tasks)} />
              {isProject(t) && <ChevronRight size={18} className="row-chevron" />}
            </div>
          ))
        )}
      </div>

      {/* Activity timeline */}
      <div className="section-label">Activity</div>
      <div className="list">
        {timeline.length === 0 ? (
          <p className="empty-inline">No touchpoints logged yet.</p>
        ) : (
          timeline.map((it) => {
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
                <button
                  className="icon-btn danger"
                  onClick={() => deleteInteraction(it.id)}
                  aria-label="Delete entry"
                >
                  <X size={15} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {connections.length > 0 && (
        <>
          <div className="section-label">Also knows</div>
          <div className="list">
            {connections.map(({ rel, other }) => (
              <div className="list-row" key={rel.id} onClick={() => onOpenPerson(other.id)}>
                <Avatar name={other.name} src={other.avatar_url} size={38} />
                <div className="row-body">
                  <div className="row-title">{other.name}</div>
                  <div className="row-sub">
                    {rel.relationship_type.replace(/_/g, ' ')}
                    {orgName(other) ? ` · ${orgName(other)}` : ''}
                    {rel.notes ? ` — ${rel.notes}` : ''}
                  </div>
                </div>
                <button
                  className="icon-btn danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteRelationship(rel.id)
                  }}
                  aria-label="Remove connection"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {person.notes && (
        <>
          <div className="section-label">Notes</div>
          <div className="list">
            <p className="notes">{person.notes}</p>
          </div>
        </>
      )}

      <div className="section-label">Details</div>
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
