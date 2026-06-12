import { useMemo, useState } from 'react'
import { Search } from 'react-feather'
import { searchPeople } from '../lib/search'
import { PRIVACY_LABELS } from '../lib/constants'

export default function SearchView({ data, searchRef, query, setQuery, onOpen }) {
  const [orgFilter, setOrgFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [privacyFilter, setPrivacyFilter] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const { people, loading } = data

  const allTags = useMemo(
    () => [...new Set(people.flatMap((p) => p.tags || []))].sort(),
    [people]
  )
  const allOrgs = useMemo(
    () => [...new Set(people.map((p) => p.organization).filter(Boolean))].sort(),
    [people]
  )

  const results = useMemo(() => {
    let pool = people.filter((p) => (showDeleted ? p.deleted_at : !p.deleted_at))
    if (orgFilter) pool = pool.filter((p) => p.organization === orgFilter)
    if (tagFilter) pool = pool.filter((p) => (p.tags || []).includes(tagFilter))
    if (privacyFilter) pool = pool.filter((p) => p.privacy_level === privacyFilter)
    return searchPeople(pool, query)
  }, [people, query, orgFilter, tagFilter, privacyFilter, showDeleted])

  const hasFilters = orgFilter || tagFilter || privacyFilter || showDeleted || query

  return (
    <div>
      <div className="search-wrap">
        <Search size={16} />
        <input
          ref={searchRef}
          className="search-input"
          placeholder="Search by name, org, or tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={window.matchMedia('(min-width: 721px)').matches}
        />
      </div>

      <div className="filter-row">
        <select className="filter-select" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
          <option value="">All organizations</option>
          {allOrgs.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select className="filter-select" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select className="filter-select" value={privacyFilter} onChange={(e) => setPrivacyFilter(e.target.value)}>
          <option value="">All privacy levels</option>
          {Object.entries(PRIVACY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select className="filter-select" value={showDeleted ? '1' : ''} onChange={(e) => setShowDeleted(Boolean(e.target.value))}>
          <option value="">Active</option>
          <option value="1">Deleted</option>
        </select>
        {hasFilters && (
          <button
            className="filter-clear"
            onClick={() => {
              setQuery('')
              setOrgFilter('')
              setTagFilter('')
              setPrivacyFilter('')
              setShowDeleted(false)
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {loading ? (
        <p className="empty dots">Loading</p>
      ) : results.length === 0 ? (
        <p className="empty">No results. Search by name, org, or tag.</p>
      ) : (
        results.map((person) => (
          <div key={person.id} className="result-item" onClick={() => onOpen(person.id)}>
            <div className="result-name">{person.name}</div>
            {(person.organization || person.role) && (
              <div className="result-org">
                {[person.role, person.organization].filter(Boolean).join(' · ')}
              </div>
            )}
            {(person.tags || []).length > 0 && (
              <div className="result-tags">{person.tags.join('  ·  ')}</div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
