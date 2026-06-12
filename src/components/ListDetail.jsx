import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Plus, Trash2, Edit2 } from 'react-feather'
import SwipeRow from './SwipeRow'
import ReorderableList from './ReorderableList'
import { byOrder, moveUpdates } from '../lib/order'
import haptics from '../lib/haptics'

// A single list: rapid add at top, tap a row (or its circle) to check/uncheck,
// swipe to delete, drag (long-press on touch) to reorder. Unchecked items
// first; checked sink to the bottom, struck.
export default function ListDetail({ data, listId, onBack, onEdit }) {
  const { lists, listItems, addListItem, toggleListItem, deleteListItem, clearCheckedItems, deleteList, reorderListItems } = data
  const list = lists.find((l) => l.id === listId)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const items = useMemo(() => {
    const mine = listItems.filter((it) => it.list_id === listId)
    const open = mine.filter((it) => !it.checked_at).sort(byOrder)
    const done = mine.filter((it) => it.checked_at).sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1))
    return { open, done }
  }, [listItems, listId])

  if (!list) {
    return (
      <div>
        <button className="back-btn" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <p className="empty">List not found.</p>
      </div>
    )
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    addListItem(listId, text)
    setDraft('')
    inputRef.current?.focus() // stay focused for rapid entry
  }

  const toggle = (it) => {
    if (!it.checked_at) haptics.light()
    toggleListItem(it)
  }

  const Item = ({ it }) => (
    <SwipeRow
      actions={[{ label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => deleteListItem(it.id) }]}
      onClick={() => toggle(it)}
    >
      <div className="list-row">
        <button className={`task-check ${it.checked_at ? 'done' : ''}`} onClick={(e) => { e.stopPropagation(); toggle(it) }} aria-label="Toggle">
          <Check size={15} />
        </button>
        <div className="row-body">
          <div className={`row-title ${it.checked_at ? 'task-done' : ''}`}>{it.text}</div>
        </div>
      </div>
    </SwipeRow>
  )

  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}><ArrowLeft size={18} /> Back</button>

      <div className="list-detail-head">
        <span className="list-emoji lg">{list.icon || '📝'}</span>
        <h1 className="person-name">{list.name}</h1>
      </div>
      <div className="profile-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        <button className="pill-btn neutral" onClick={() => onEdit(list)}><Edit2 size={15} /> Edit</button>
        {items.done.length > 0 && (
          <button className="pill-btn neutral" onClick={() => clearCheckedItems(listId)}>Clear checked</button>
        )}
        <button className="pill-btn danger" onClick={() => window.confirm(`Delete "${list.name}"?`) && (onBack(), deleteList(listId))}>
          <Trash2 size={15} /> Delete
        </button>
      </div>

      <div className="list-add">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an item…"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <button className="list-add-btn" onClick={add} aria-label="Add item"><Plus size={20} /></button>
      </div>

      {items.open.length === 0 && items.done.length === 0 ? (
        <p className="empty">Nothing here yet. Add the first item above.</p>
      ) : (
        <>
          {items.open.length > 0 && (
            <ReorderableList
              items={items.open}
              onMove={(from, to) => reorderListItems(moveUpdates(items.open, from, to))}
              renderItem={(it) => <Item it={it} />}
            />
          )}
          {items.done.length > 0 && (
            <>
              <div className="section-label">Got it · {items.done.length}</div>
              <div className="list">{items.done.map((it) => <Item key={it.id} it={it} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
