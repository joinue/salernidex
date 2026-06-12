import { useMemo, useState } from 'react'
import { ArrowLeft, Mail, Phone, MapPin, Gift, Edit2, UserPlus, Archive, Trash2, RotateCcw, Lock, X, Bell } from 'react-feather'
import { PRIVACY_LABELS, KEEP_IN_TOUCH_LABELS, INTERACTION_TYPES, INTERACTION_BY_ID, formatDate } from '../lib/constants'
import { lastInteraction, relativeTime } from '../lib/contact'
import { memberName } from '../lib/household'
import Avatar from './Avatar'
import InteractionForm from './InteractionForm'
import ConfirmDialog from './ConfirmDialog'

export default function PersonPage({ data, personId, onOpenPerson, onBack, onEdit, onConnect }) {
  const { people, relationships, interactions, deletePerson, restorePerson, purgePerson, ownerId, deleteRelationship, addInteraction, deleteInteraction } = data
  const person = people.find((p) => p.id === personId)
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const [logType, setLogType] = useState(null) // null | type id → opens InteractionForm
  const [confirmPurge, setConfirmPurge] = useState(false) // permanent-delete confirmation

  const timeline = useMemo(
    () =>
      (interactions || [])
        .filter((i) => i.person_id === personId)
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
    [interactions, personId]
  )

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
  const hasContact = person.email || person.phone || person.address || person.birthday
  // Ownership: only the creator may permanently delete. Null created_by (legacy
  // data) counts as yours so it isn't stranded.
  const mine = !person.created_by || person.created_by === ownerId
  const ownerName = memberName(person.created_by)

  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="profile-head">
        <Avatar name={person.name} size={88} />
        <h1 className="person-name">
          {person.name}
          {person.deleted_at && <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}> · archived</span>}
        </h1>
        {(person.role || person.organization) && (
          <p className="person-sub">{[person.role, person.organization].filter(Boolean).join(' · ')}</p>
        )}

        <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
          {last && <span className="chip">Last contact · {relativeTime(last.occurred_at)}</span>}
          {(person.tags || []).map((t) => (
            <span className="chip accent" key={t}>{t}</span>
          ))}
        </div>

        <div className="profile-actions">
          <button className="pill-btn" onClick={() => onEdit(person)}>
            <Edit2 size={15} /> Edit
          </button>
          <button className="pill-btn neutral" onClick={() => onConnect(person)}>
            <UserPlus size={15} /> Connect
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
                <span className="v-value" style={{ color: 'var(--accent)' }}>{person.email}</span>
              </a>
            )}
            {person.phone && (
              <a className="value-row" href={`tel:${person.phone}`}>
                <Phone size={18} />
                <span className="v-label">Phone</span>
                <span className="v-value" style={{ color: 'var(--accent)' }}>{person.phone}</span>
              </a>
            )}
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
                <span className="activity-icon"><Icon size={16} /></span>
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
                <Avatar name={other.name} size={38} />
                <div className="row-body">
                  <div className="row-title">{other.name}</div>
                  <div className="row-sub">
                    {rel.relationship_type.replace(/_/g, ' ')}
                    {other.organization ? ` · ${other.organization}` : ''}
                    {rel.notes ? ` — ${rel.notes}` : ''}
                  </div>
                </div>
                <button
                  className="icon-btn danger"
                  onClick={(e) => { e.stopPropagation(); deleteRelationship(rel.id) }}
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
          <span className="v-value">{KEEP_IN_TOUCH_LABELS[person.keep_in_touch_days] || 'No reminder'}</span>
        </div>
        <div className="value-row">
          <Lock size={18} />
          <span className="v-label">Privacy</span>
          <span className="v-value">{PRIVACY_LABELS[person.privacy_level] || person.privacy_level}</span>
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

      {confirmPurge && (
        <ConfirmDialog
          title={`Delete ${person.name} forever?`}
          message="This permanently removes the contact along with their relationships and logged touchpoints. This can't be undone."
          confirmLabel="Delete forever"
          danger
          onConfirm={() => { setConfirmPurge(false); purgePerson(person.id); onBack() }}
          onCancel={() => setConfirmPurge(false)}
        />
      )}
    </div>
  )
}
