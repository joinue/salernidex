import { useMemo } from 'react'
import { ChevronRight, Plus, ShoppingCart } from 'react-feather'
import PageHeader from './PageHeader'
import SharedDot from './SharedDot'
import { dueLabel, dueState } from '../lib/tasks'

// All household lists. Tap one to open it. The chrome (add) is driven by the
// page-aware FAB on mobile and the header action on desktop.
export default function ListsView({ data, onOpenList, onAdd, onSearch }) {
  const { lists, listItems, tasks } = data

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
      <PageHeader title="Lists" action={onAdd} actionLabel="New list" onSearch={onSearch} />
      {lists.length === 0 ? (
        <div className="empty">
          <ShoppingCart size={28} className="empty-icon" />
          No lists yet.
          <button className="text-btn" onClick={onAdd}>
            <Plus size={14} /> New list
          </button>
        </div>
      ) : (
        <div className="list">
          {lists.map((l) => {
            const open = counts[l.id] || 0
            const due = dueState(l.due_date)
            return (
              <div className="list-row" key={l.id} onClick={() => onOpenList(l.id)}>
                <span className="list-emoji">{l.icon || (l.kind === 'grocery' ? '🛒' : '📝')}</span>
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
            )
          })}
        </div>
      )}
    </div>
  )
}
