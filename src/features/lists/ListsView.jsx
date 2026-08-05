import { useMemo } from 'react'
import { ChevronRight, Plus, ShoppingCart, Edit2, Trash2 } from 'react-feather'
import PageHeader from '../../components/shell/PageHeader'
import SharedDot from '../../components/ui/SharedDot'
import { dueLabel, dueState } from '../../lib/tasks'
import EmptyState from '../../components/ui/EmptyState'
import SwipeRow from '../../components/ui/SwipeRow'

// All household lists. Tap one to open it; swipe a row to edit or delete it. The
// chrome (add) is driven by the page-aware FAB on mobile and the header action
// on desktop.
export default function ListsView({ data, onOpenList, onEditList, onAdd, onSearch }) {
  const { lists, listItems, tasks, deleteList } = data

  const counts = useMemo(() => {
    const open = {}
    for (const it of listItems) if (!it.checked_at) open[it.list_id] = (open[it.list_id] || 0) + 1
    return open
  }, [listItems])

  // Project titles, so a project-scoped list can show "for «Kitchen Reno»" —
  // the same list lives here and inside its project (lists.project_id).
  const projectName = useMemo(() => {
    const m = new Map()
    for (const t of tasks) if (t.is_project) m.set(t.id, t.title)
    return m
  }, [tasks])

  return (
    <div>
      <PageHeader title="Lists" createAction={onAdd} actionLabel="New list" onSearch={onSearch} />
      {lists.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          action={
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> New list
            </button>
          }
        >
          No lists yet.
        </EmptyState>
      ) : (
        <div className="list">
          {lists.map((l) => {
            const open = counts[l.id] || 0
            const due = dueState(l.due_date)
            return (
              <SwipeRow
                key={l.id}
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
                  <span
                    className="list-emoji"
                    style={l.color ? { background: l.color } : undefined}
                  >
                    {l.icon || (l.kind === 'grocery' ? '🛒' : '📝')}
                  </span>
                  <div className="row-body">
                    <div className="row-titleline">
                      <div className="row-title">{l.name}</div>
                      <SharedDot item={l} />
                    </div>
                    <div className="row-sub">
                      {open ? `${open} item${open === 1 ? '' : 's'} left` : 'All done'}
                      {l.project_id && projectName.has(l.project_id) && (
                        <span className="chip" style={{ marginLeft: 8 }}>
                          for {projectName.get(l.project_id)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="row-meta">
                    {l.due_date && (
                      <span
                        className={`row-time ${due === 'overdue' || due === 'today' ? 'warn' : ''}`}
                      >
                        {dueLabel(l.due_date)}
                      </span>
                    )}
                    <ChevronRight size={18} className="row-chevron" />
                  </div>
                </div>
              </SwipeRow>
            )
          })}
        </div>
      )}
    </div>
  )
}
