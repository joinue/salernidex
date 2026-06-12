import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronRight, Edit2, Archive, RotateCcw, Trash2, Users, MoreHorizontal, Sliders, UserPlus, Check, ArrowDown } from 'react-feather'
import { searchPeople, sortPeople, PEOPLE_SORTS } from '../lib/search'
import { groupMembers } from '../lib/groups'
import { PRIVACY_LABELS, TIERS } from '../lib/constants'
import { lastInteraction, relativeTime } from '../lib/contact'
import { personActions } from '../lib/personActions'
import Avatar from './Avatar'
import PageHeader from './PageHeader'
import Sheet from './Sheet'
import SwipeRow from './SwipeRow'
import ActionSheet from './ActionSheet'
import InteractionForm from './InteractionForm'
import ConfirmDialog from './ConfirmDialog'

export default function SearchView({ data, searchRef, query, setQuery, onOpen, onEdit, onAdd, onMore }) {
  const [orgFilter, setOrgFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [privacyFilter, setPrivacyFilter] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [sort, setSort] = useState(() => localStorage.getItem('salernidex-people-sort') || 'name')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [actionPerson, setActionPerson] = useState(null)
  const [logPerson, setLogPerson] = useState(null)
  const [purgePersonTarget, setPurgePersonTarget] = useState(null) // person pending permanent delete

  useEffect(() => { localStorage.setItem('salernidex-people-sort', sort) }, [sort])

  const { people, interactions, groups, loading, deletePerson, restorePerson, purgePerson, ownerId, addInteraction } = data

  // While searching, results are ordered by best match; the chosen sort governs
  // browsing (no query).
  const searching = query.trim().length > 0

  const allTags = useMemo(() => [...new Set(people.flatMap((p) => p.tags || []))].sort(), [people])
  const allOrgs = useMemo(() => [...new Set(people.map((p) => p.organization).filter(Boolean))].sort(), [people])

  // Most recent interaction timestamp per person, for the activity-based sorts.
  const lastByPerson = useMemo(() => {
    const m = new Map()
    for (const it of interactions || []) {
      const prev = m.get(it.person_id)
      if (!prev || prev < it.occurred_at) m.set(it.person_id, it.occurred_at)
    }
    return m
  }, [interactions])

  const results = useMemo(() => {
    let pool = people.filter((p) => (showDeleted ? p.deleted_at : !p.deleted_at))
    if (orgFilter) pool = pool.filter((p) => p.organization === orgFilter)
    if (tagFilter) pool = pool.filter((p) => (p.tags || []).includes(tagFilter))
    if (groupFilter) {
      const g = groups.find((x) => x.id === groupFilter)
      if (g) {
        const ids = new Set(groupMembers(g, people).map((p) => p.id))
        pool = pool.filter((p) => ids.has(p.id))
      }
    }
    if (tierFilter) pool = pool.filter((p) => p.tier === tierFilter)
    if (privacyFilter) pool = pool.filter((p) => p.privacy_level === privacyFilter)
    return sortPeople(searchPeople(pool, query), searching ? 'relevance' : sort, lastByPerson)
  }, [people, groups, query, orgFilter, tagFilter, groupFilter, tierFilter, privacyFilter, showDeleted, sort, searching, lastByPerson])

  const activeCount = [orgFilter, tagFilter, groupFilter, tierFilter, privacyFilter, showDeleted].filter(Boolean).length

  const clearAll = () => {
    setOrgFilter('')
    setTagFilter('')
    setGroupFilter('')
    setTierFilter('')
    setPrivacyFilter('')
    setShowDeleted(false)
  }

  return (
    <div>
      {/* Mobile: "More" overflow (the FAB handles adds). Desktop: add a person. */}
      <PageHeader
        title="People"
        action={onMore || onAdd}
        actionIcon={onMore ? MoreHorizontal : UserPlus}
        actionLabel={onMore ? 'More' : 'Add person'}
      />

      <div className="search-wrap">
        <Search size={16} />
        <input
          ref={searchRef}
          className="search-input"
          placeholder="Search people, orgs, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={window.matchMedia('(min-width: 721px)').matches}
        />
      </div>

      <div className="filter-bar">
        <button className={`filter-btn ${activeCount ? 'on' : ''}`} onClick={() => setFilterOpen(true)}>
          <Sliders size={15} />
          Filter
          {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
        </button>
        {!searching && (
          <button className={`filter-btn ${sort !== 'name' ? 'on' : ''}`} onClick={() => setSortOpen(true)}>
            <ArrowDown size={15} />
            {PEOPLE_SORTS.find((s) => s.value === sort)?.label}
          </button>
        )}
        {activeCount > 0 && <button className="filter-clear" onClick={clearAll}>Clear</button>}
      </div>

      {loading ? (
        <p className="empty dots">Loading</p>
      ) : results.length === 0 ? (
        <div className="empty">
          <Users size={28} className="empty-icon" />
          {query || activeCount ? 'No matches.' : 'Search by name, org, or tag.'}
        </div>
      ) : (
        <div className="list">
          {results.map((person) => {
            const sub = [person.role, person.organization].filter(Boolean).join(' · ')
            const last = lastInteraction(person.id, interactions)
            const mine = !person.created_by || person.created_by === ownerId
            const actions = showDeleted
              ? [
                  { label: 'Restore', icon: RotateCcw, onClick: () => restorePerson(person.id) },
                  // Only the creator can permanently delete (legacy null = yours).
                  ...(mine ? [{ label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => setPurgePersonTarget(person) }] : []),
                ]
              : [
                  { label: 'Edit', icon: Edit2, onClick: () => onEdit(person) },
                  { label: 'Archive', icon: Archive, variant: 'danger', onClick: () => deletePerson(person.id) },
                ]
            return (
              <SwipeRow
                key={person.id}
                actions={actions}
                onClick={() => onOpen(person.id)}
                onLongPress={() => setActionPerson(person)}
              >
                <div className="list-row">
                  <Avatar name={person.name} size={42} />
                  <div className="row-body">
                    <div className="row-title">{person.name}</div>
                    {sub && <div className="row-sub">{sub}</div>}
                    {(person.tags || []).length > 0 && (
                      <div className="row-chips">
                        {person.tags.slice(0, 2).map((t) => (
                          <span className="chip" key={t}>{t}</span>
                        ))}
                        {person.tags.length > 2 && <span className="chip">+{person.tags.length - 2}</span>}
                      </div>
                    )}
                  </div>
                  <div className="row-meta">
                    {last && <span className="row-time">{relativeTime(last.occurred_at)}</span>}
                    <ChevronRight size={18} className="row-chevron" />
                  </div>
                </div>
              </SwipeRow>
            )
          })}
        </div>
      )}

      {filterOpen && (
        <Sheet title="Filter people" onClose={() => setFilterOpen(false)}>
          <div className="filter-sheet">
            <div className="field">
              <label className="label">Organization</label>
              <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
                <option value="">All organizations</option>
                {allOrgs.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Group</label>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">All groups</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Tag</label>
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="">All tags</option>
                {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Tier</label>
              <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
                <option value="">All tiers</option>
                {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Privacy</label>
              <select value={privacyFilter} onChange={(e) => setPrivacyFilter(e.target.value)}>
                <option value="">All privacy levels</option>
                {Object.entries(PRIVACY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Status</label>
              <select value={showDeleted ? '1' : ''} onChange={(e) => setShowDeleted(Boolean(e.target.value))}>
                <option value="">Active</option>
                <option value="1">Archived</option>
              </select>
            </div>
            <div className="filter-sheet-actions">
              <button className="text-btn" onClick={clearAll} disabled={!activeCount}>Clear all</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '0 28px', height: 44 }} onClick={() => setFilterOpen(false)}>
                Show {results.length}
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {sortOpen && (
        <Sheet title="Sort people" onClose={() => setSortOpen(false)}>
          {PEOPLE_SORTS.map((s) => (
            <button
              key={s.value}
              className="sheet-item"
              onClick={() => { setSort(s.value); setSortOpen(false) }}
            >
              {s.value === sort ? <Check size={20} /> : <span className="sheet-item-spacer" />}
              {s.label}
            </button>
          ))}
        </Sheet>
      )}

      {actionPerson && (
        <ActionSheet
          title={actionPerson.name}
          actions={personActions(actionPerson, { onOpen, onLog: (p) => setLogPerson(p), onEdit })}
          onClose={() => setActionPerson(null)}
        />
      )}
      {logPerson && (
        <InteractionForm person={logPerson} presetType="call" onSave={addInteraction} onClose={() => setLogPerson(null)} />
      )}
      {purgePersonTarget && (
        <ConfirmDialog
          title={`Delete ${purgePersonTarget.name} forever?`}
          message="This permanently removes the contact along with their relationships and logged touchpoints. This can't be undone."
          confirmLabel="Delete forever"
          danger
          onConfirm={() => { purgePerson(purgePersonTarget.id); setPurgePersonTarget(null) }}
          onCancel={() => setPurgePersonTarget(null)}
        />
      )}
    </div>
  )
}
