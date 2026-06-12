import { useMemo } from 'react'
import { ChevronRight, Plus, ShoppingCart } from 'react-feather'
import PageHeader from './PageHeader'

// All household lists. Tap one to open it. The chrome (add) is driven by the
// page-aware FAB on mobile and the header action on desktop.
export default function ListsView({ data, onOpenList, onAdd, onSearch }) {
  const { lists, listItems } = data

  const counts = useMemo(() => {
    const open = {}
    for (const it of listItems) if (!it.checked_at) open[it.list_id] = (open[it.list_id] || 0) + 1
    return open
  }, [listItems])

  return (
    <div>
      <PageHeader title="Lists" action={onAdd} actionLabel="New list" onSearch={onSearch} />
      {lists.length === 0 ? (
        <div className="empty">
          <ShoppingCart size={28} className="empty-icon" />
          No lists yet.
          <button className="text-btn" onClick={onAdd}><Plus size={14} /> New list</button>
        </div>
      ) : (
        <div className="list">
          {lists.map((l) => {
            const open = counts[l.id] || 0
            return (
              <div className="list-row" key={l.id} onClick={() => onOpenList(l.id)}>
                <span className="list-emoji">{l.icon || '📝'}</span>
                <div className="row-body">
                  <div className="row-title">{l.name}</div>
                  <div className="row-sub">{open ? `${open} item${open === 1 ? '' : 's'} left` : 'All done'}</div>
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
