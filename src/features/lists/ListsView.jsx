import { useMemo } from 'react'
import { ChevronRight, Plus, ShoppingCart, Edit2, Trash2 } from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import SharedDot from '../../components/ui/SharedDot'
import { dueLabel, dueState } from '../../lib/tasks'
import { openCountsByList } from '../../lib/listItems'
import { isCollection, listIcon } from '../../lib/listKinds'
import EmptyState from '../../components/ui/EmptyState'
import SwipeRow from '../../components/ui/SwipeRow'
import UnfiledSection from '../../components/ui/UnfiledSection'
import { ALL_AREAS, scopeToArea } from '../../lib/areas'

// All household lists. Tap one to open it; swipe a row to edit or delete it. The
// chrome (add) is driven by the page-aware FAB on mobile and the header action
// on desktop.
export default function ListsView({ data, onOpenList, onEditList, onAdd, onSearch, area }) {
  const { lists, listItems, tasks, deleteList } = data

  const counts = useMemo(() => openCountsByList(listItems), [listItems])

  // Project titles, so a project-scoped list can show "for «Kitchen Reno»" —
  // the same list lives here and inside its project (lists.project_id).
  const projectName = useMemo(() => {
    const m = new Map()
    for (const t of tasks) if (t.is_project) m.set(t.id, t.title)
    return m
  }, [tasks])

  // The lens. `unfiled` is what it excluded only for having no area — shown in
  // its own collapsed section below rather than dropped, so a list you never
  // filed can't quietly disappear (docs/scopes/areas-and-tags.md §3.5).
  const { scoped, unfiled } = scopeToArea(lists, area)

  const renderList = (l) => {
    const open = counts[l.id] || 0
    const due = dueState(l.due_date)
    return (
      <SwipeRow
        key={l.id}
        label={l.name}
        onClick={() => onOpenList(l.id)}
        actions={[
          { label: 'Edit', icon: Edit2, onClick: () => onEditList?.(l) },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'danger',
            onClick: () => deleteList(l.id),
          },
        ]}
      >
        <div className="list-row">
          <span className="list-emoji" style={l.color ? { background: l.color } : undefined}>
            {listIcon(l)}
          </span>
          <div className="row-body">
            <div className="row-titleline">
              <div className="row-title">{l.name}</div>
              <SharedDot item={l} />
            </div>
            <div className="row-sub">
              {/* "3 items left" and "All done" both assume the list
                          is work. A collection is a total. */}
              {isCollection(l)
                ? `${open} item${open === 1 ? '' : 's'}`
                : open
                  ? `${open} item${open === 1 ? '' : 's'} left`
                  : 'All done'}
              {l.project_id && projectName.has(l.project_id) && (
                <span className="chip" style={{ marginLeft: 8 }}>
                  for {projectName.get(l.project_id)}
                </span>
              )}
            </div>
          </div>
          <div className="row-meta">
            {l.due_date && (
              <span className={`row-time ${due === 'overdue' || due === 'today' ? 'warn' : ''}`}>
                {dueLabel(l.due_date)}
              </span>
            )}
            <ChevronRight size={18} className="row-chevron" />
          </div>
        </div>
      </SwipeRow>
    )
  }

  return (
    <div>
      <PageHeader title="Lists" createAction={onAdd} actionLabel="New list" onSearch={onSearch} />
      {/* Unfiled items don't count: they aren't in this area, so letting them
          stand in for content leaves an empty area explained by nothing but a
          collapsed "No area" row. It renders below either way. */}
      {scoped.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          action={
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> New list
            </button>
          }
        >
          {area && area !== ALL_AREAS ? 'No lists in this area.' : 'No lists yet.'}
        </EmptyState>
      ) : (
        <div className="list">{scoped.map(renderList)}</div>
      )}

      <UnfiledSection count={unfiled.length}>
        <div className="list">{unfiled.map(renderList)}</div>
      </UnfiledSection>
    </div>
  )
}
