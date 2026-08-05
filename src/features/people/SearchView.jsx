import { useMemo, useRef, useState } from 'react'
import {
  Search,
  ChevronRight,
  Edit2,
  Archive,
  RotateCcw,
  Trash2,
  Users,
  Sliders,
  UserPlus,
  Check,
  ArrowDown,
  Map as MapIcon,
} from 'react-feather'
import {
  searchPeople,
  sortPeople,
  groupPeopleByLetter,
  PEOPLE_SORTS,
  EMPTY_PEOPLE_FILTERS,
} from '../../lib/search'
import AlphaIndex from '../../components/ui/AlphaIndex'
import { groupMembers } from '../../lib/groups'
import { PRIVACY_LABELS, TIERS } from '../../lib/constants'
import { lastInteraction, relativeTime } from '../../lib/contact'
import { personActions } from '../../lib/personActions'
import Avatar from '../../components/ui/Avatar'
import PageHeader from '../../components/shell/PageHeader'
import SharedDot from '../../components/ui/SharedDot'
import Sheet from '../../components/ui/Sheet'
import SelectRow from '../../components/ui/SelectRow'
import SwipeRow from '../../components/ui/SwipeRow'
import ActionSheet from '../../components/ui/ActionSheet'
import InteractionForm from './InteractionForm'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import PeopleMap from './PeopleMap'
import { useAppPrefs } from '../../hooks/useAppPrefs'
import EmptyState from '../../components/ui/EmptyState'

export default function SearchView({
  data,
  searchRef,
  query,
  setQuery,
  filters,
  setFilters,
  onOpen,
  onEdit,
  onAdd,
  memberId,
  hub,
}) {
  // Filters live in the parent so they survive leaving and returning to the
  // page (like `query`). Destructure for readability; each setter patches one key.
  const {
    org: orgFilter,
    tag: tagFilter,
    group: groupFilter,
    tier: tierFilter,
    privacy: privacyFilter,
    showDeleted,
  } = filters
  const setOrgFilter = (v) => setFilters((f) => ({ ...f, org: v }))
  const setTagFilter = (v) => setFilters((f) => ({ ...f, tag: v }))
  const setGroupFilter = (v) => setFilters((f) => ({ ...f, group: v }))
  const setTierFilter = (v) => setFilters((f) => ({ ...f, tier: v }))
  const setPrivacyFilter = (v) => setFilters((f) => ({ ...f, privacy: v }))
  const setShowDeleted = (v) => setFilters((f) => ({ ...f, showDeleted: v }))
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [actionPerson, setActionPerson] = useState(null)
  const [logPerson, setLogPerson] = useState(null)
  const [purgePersonTarget, setPurgePersonTarget] = useState(null) // person pending permanent delete

  // People sort is a per-member preference (shared app-prefs store).
  const [appPrefs, updateAppPrefs] = useAppPrefs(memberId)
  const sort = appPrefs.peopleSort
  const setSort = (v) => updateAppPrefs({ peopleSort: v })

  const {
    people,
    interactions,
    groups,
    orgs,
    loading,
    savePerson,
    deletePerson,
    restorePerson,
    purgePerson,
    userId,
    addInteraction,
  } = data
  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])

  // While searching, results are ordered by best match; the chosen sort governs
  // browsing (no query).
  const searching = query.trim().length > 0

  const allTags = useMemo(() => [...new Set(people.flatMap((p) => p.tags || []))].sort(), [people])
  // Active people with an address — fed to the map, and used to hide the map
  // button entirely when there's nothing to plot.
  const mappable = useMemo(
    () => people.filter((p) => !p.deleted_at && p.address && p.address.trim()),
    [people],
  )
  // Orgs actually in use by a (non-archived) person — the org filter only offers
  // values that can match. Stored/compared by id; shown by name.
  const allOrgs = useMemo(() => {
    const used = new Set(
      people.filter((p) => !p.deleted_at && p.organization_id).map((p) => p.organization_id),
    )
    return [...used]
      .map((id) => orgsById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [people, orgsById])

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
    if (orgFilter) pool = pool.filter((p) => p.organization_id === orgFilter)
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
    return sortPeople(
      searchPeople(pool, query, orgsById),
      searching ? 'relevance' : sort,
      lastByPerson,
    )
  }, [
    people,
    groups,
    orgsById,
    query,
    orgFilter,
    tagFilter,
    groupFilter,
    tierFilter,
    privacyFilter,
    showDeleted,
    sort,
    searching,
    lastByPerson,
  ])

  const activeCount = [
    orgFilter,
    tagFilter,
    groupFilter,
    tierFilter,
    privacyFilter,
    showDeleted,
  ].filter(Boolean).length

  const clearAll = () => setFilters(EMPTY_PEOPLE_FILTERS)

  // Apple-Contacts browse mode: only when sorting A–Z and not searching, slice
  // the list into letter sections with a jump bar. Any other sort/search stays
  // a flat list (sections only make sense in alphabetical order).
  const browsing = !searching && sort === 'name'
  const sections = useMemo(
    () => (browsing ? groupPeopleByLetter(results) : []),
    [browsing, results],
  )
  const presentLetters = useMemo(() => new Set(sections.map((s) => s.letter)), [sections])
  const sectionRefs = useRef({})

  const jumpTo = (letter) => {
    // Tapping an empty letter lands on the next populated section (Apple does
    // the same), so the bar never feels dead.
    const target = sections.find((s) => s.letter >= letter) || sections[sections.length - 1]
    sectionRefs.current[target?.letter]?.scrollIntoView({ block: 'start' })
  }

  const renderPerson = (person) => {
    const sub = [person.role, orgsById.get(person.organization_id)?.name]
      .filter(Boolean)
      .join(' · ')
    const last = lastInteraction(person.id, interactions)
    const mine = !person.created_by || person.created_by === userId
    const actions = showDeleted
      ? [
          { label: 'Restore', icon: RotateCcw, onClick: () => restorePerson(person.id) },
          // Only the creator can permanently delete (legacy null = yours).
          ...(mine
            ? [
                {
                  label: 'Delete',
                  icon: Trash2,
                  variant: 'danger',
                  onClick: () => setPurgePersonTarget(person),
                },
              ]
            : []),
        ]
      : [
          { label: 'Edit', icon: Edit2, onClick: () => onEdit(person) },
          {
            label: 'Archive',
            icon: Archive,
            variant: 'danger',
            onClick: () => deletePerson(person.id),
          },
        ]
    return (
      <SwipeRow
        key={person.id}
        actions={actions}
        onClick={() => onOpen(person.id)}
        onLongPress={() => setActionPerson(person)}
      >
        <div className="list-row">
          <Avatar name={person.name} src={person.avatar_url} size={42} />
          <div className="row-body">
            <div className="row-titleline">
              <div className="row-title">{person.name}</div>
              <SharedDot item={person} />
            </div>
            {sub && <div className="row-sub">{sub}</div>}
            {(person.tags || []).length > 0 && (
              <div className="row-chips">
                {person.tags.slice(0, 2).map((t) => (
                  <span className="chip" key={t}>
                    {t}
                  </span>
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
  }

  return (
    <div>
      {/* The hub switcher lives in the title dropdown; the header action adds a
          person (the FAB does the same on mobile). */}
      <PageHeader
        title="People"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        createAction={onAdd}
        actionIcon={UserPlus}
        actionLabel="Add person"
        secondaryAction={mappable.length > 0 ? () => setMapOpen(true) : undefined}
        secondaryActionIcon={MapIcon}
        secondaryActionLabel="Map"
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
          enterKeyHint="search"
        />
      </div>

      <div className="filter-bar">
        <button
          className={`filter-btn ${activeCount ? 'on' : ''}`}
          onClick={() => setFilterOpen(true)}
        >
          <Sliders size={15} />
          Filter
          {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
        </button>
        {!searching && (
          <button
            className={`filter-btn ${sort !== 'name' ? 'on' : ''}`}
            onClick={() => setSortOpen(true)}
          >
            <ArrowDown size={15} />
            {PEOPLE_SORTS.find((s) => s.value === sort)?.label}
          </button>
        )}
        {activeCount > 0 && (
          <button className="filter-clear" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <EmptyState loading>Loading</EmptyState>
      ) : results.length === 0 ? (
        <EmptyState icon={Users}>
          {query || activeCount ? 'No matches.' : 'Search by name, org, or tag.'}
        </EmptyState>
      ) : browsing ? (
        <div className="people-browse">
          <div>
            {sections.map((s) => (
              <section
                key={s.letter}
                ref={(el) => (sectionRefs.current[s.letter] = el)}
                className="people-section"
              >
                <div className="people-section-head">{s.letter}</div>
                <div className="list">{s.items.map(renderPerson)}</div>
              </section>
            ))}
          </div>
          {sections.length > 1 && <AlphaIndex present={presentLetters} onJump={jumpTo} />}
        </div>
      ) : (
        <div className="list">{results.map(renderPerson)}</div>
      )}

      {filterOpen && (
        <Sheet title="Filter people" onClose={() => setFilterOpen(false)}>
          {/* Drill-in rows, not native selects: six <select>s stacked in a sheet
              put four of them underneath the iOS picker wheel. See SelectRow. */}
          <div className="filter-sheet">
            <SelectRow
              label="Organization"
              value={orgFilter}
              onChange={setOrgFilter}
              placeholder="All organizations"
              options={[
                { value: '', label: 'All organizations' },
                ...allOrgs.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <SelectRow
              label="Group"
              value={groupFilter}
              onChange={setGroupFilter}
              placeholder="All groups"
              options={[
                { value: '', label: 'All groups' },
                ...groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
            <SelectRow
              label="Tag"
              value={tagFilter}
              onChange={setTagFilter}
              placeholder="All tags"
              options={[
                { value: '', label: 'All tags' },
                ...allTags.map((t) => ({ value: t, label: t })),
              ]}
            />
            <SelectRow
              label="Tier"
              value={tierFilter}
              onChange={setTierFilter}
              placeholder="All tiers"
              options={[
                { value: '', label: 'All tiers' },
                ...TIERS.map((t) => ({ value: t.value, label: t.label })),
              ]}
            />
            <SelectRow
              label="Privacy"
              value={privacyFilter}
              onChange={setPrivacyFilter}
              placeholder="All privacy levels"
              options={[
                { value: '', label: 'All privacy levels' },
                ...Object.entries(PRIVACY_LABELS).map(([v, l]) => ({ value: v, label: l })),
              ]}
            />
            <SelectRow
              label="Status"
              value={showDeleted ? '1' : ''}
              onChange={(v) => setShowDeleted(Boolean(v))}
              options={[
                { value: '', label: 'Active' },
                { value: '1', label: 'Archived' },
              ]}
            />
            <div className="filter-sheet-actions">
              <button className="text-btn" onClick={clearAll} disabled={!activeCount}>
                Clear all
              </button>
              <button
                className="btn-primary"
                style={{ width: 'auto', padding: '0 28px', height: 44 }}
                onClick={() => setFilterOpen(false)}
              >
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
              onClick={() => {
                setSort(s.value)
                setSortOpen(false)
              }}
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
        <InteractionForm
          person={logPerson}
          presetType="call"
          onSave={addInteraction}
          onClose={() => setLogPerson(null)}
        />
      )}
      {purgePersonTarget && (
        <ConfirmDialog
          title={`Delete ${purgePersonTarget.name} forever?`}
          message="This permanently removes the contact along with their relationships and logged touchpoints. This can't be undone."
          confirmLabel="Delete forever"
          danger
          onConfirm={() => {
            purgePerson(purgePersonTarget.id)
            setPurgePersonTarget(null)
          }}
          onCancel={() => setPurgePersonTarget(null)}
        />
      )}
      {mapOpen && (
        <PeopleMap
          people={mappable}
          orgsById={orgsById}
          onOpen={onOpen}
          onSave={savePerson}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  )
}
