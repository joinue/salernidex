import { useMemo } from 'react'
import { ArrowLeft } from 'react-feather'
import { PRIVACY_LABELS, formatDate } from '../lib/constants'

export default function PersonPage({ data, personId, onOpenPerson, onBack, onEdit, onConnect }) {
  const { people, relationships, deletePerson, restorePerson, deleteRelationship } = data
  const person = people.find((p) => p.id === personId)
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  if (!person) {
    return (
      <div>
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Back
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

  return (
    <div className="detail" style={{ animation: 'fade-in 200ms ease-out' }}>
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="person-name">
        {person.name}
        {person.deleted_at && <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> (deleted)</span>}
      </h1>
      {(person.role || person.organization) && (
        <p className="person-sub">{[person.role, person.organization].filter(Boolean).join(' · ')}</p>
      )}
      {(person.tags || []).length > 0 && (
        <div className="result-tags" style={{ marginTop: 8 }}>{person.tags.join('  ·  ')}</div>
      )}

      {(person.email || person.phone || person.address || person.birthday) && (
        <div className="detail-section">
          <span className="label">Contact</span>
          {person.email && <div className="contact-line">{person.email}</div>}
          {person.phone && <div className="contact-line">{person.phone}</div>}
          {person.address && <div className="contact-line">{person.address}</div>}
          {person.birthday && (
            <div className="contact-line">
              🎂 {formatDate(person.birthday)}
            </div>
          )}
        </div>
      )}

      {connections.length > 0 && (
        <div className="detail-section">
          <span className="label">Also knows</span>
          {connections.map(({ rel, other }) => (
            <div className="connection" key={rel.id}>
              <span className="conn-type">{rel.relationship_type.replace(/_/g, ' ')}</span>
              <span className="conn-name" onClick={() => onOpenPerson(other.id)}>
                {other.name}
              </span>
              {other.organization && <span className="muted" style={{ fontSize: 13 }}>{other.organization}</span>}
              {rel.notes && <span className="muted" style={{ fontSize: 12 }}>— {rel.notes}</span>}
              <button className="conn-remove" onClick={() => deleteRelationship(rel.id)}>
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      {person.notes && (
        <div className="detail-section">
          <span className="label">Notes</span>
          <p className="notes">{person.notes}</p>
        </div>
      )}

      <div className="detail-section">
        <span className="label">Privacy</span>
        <span style={{ fontSize: 14 }}>{PRIVACY_LABELS[person.privacy_level] || person.privacy_level}</span>
      </div>

      <div className="detail-actions">
        <button className="text-btn" onClick={() => onEdit(person)}>Edit</button>
        <button className="text-btn" onClick={() => onConnect(person)}>Add connection</button>
        {person.deleted_at ? (
          <button className="text-btn" onClick={() => restorePerson(person.id)}>Restore</button>
        ) : (
          <button className="text-btn danger" onClick={() => deletePerson(person.id)}>Delete</button>
        )}
      </div>
    </div>
  )
}
