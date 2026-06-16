import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Minus, Plus, Trash2, Edit2 } from 'react-feather'
import SwipeRow from './SwipeRow'
import ReorderableList from './ReorderableList'
import Avatar from './Avatar'
import { useConfirm } from '../hooks/useConfirm'
import { byOrder, moveUpdates } from '../lib/order'
import { groupByAisle, AISLES, OTHER } from '../lib/aisles'
import { suggestItems } from '../lib/catalog'
import { stepQty, qtyLabel, parseQty } from '../lib/listItems'
import { assigneeOptions, assigneeLabel, isSolo } from '../lib/household'
import haptics from '../lib/haptics'

// One row of a list. Tap the text to edit it inline (text, an optional note, a
// quantity, plus an aisle picker on grocery items and a "who's grabbing it"
// picker in a shared household); tap the circle to check/uncheck; swipe to
// delete. A heading row (standard-list section) has no checkbox and edits text
// only. Editing state is local so a parent re-render (realtime sync, a sibling
// toggle) can't yank focus mid-edit — hence a top-level component.
function ListItemRow({ it, grocery, onToggle, onDelete, onSave }) {
  const heading = it.is_heading
  const solo = isSolo()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(it.text)
  const [note, setNote] = useState(it.note || '')
  const [qty, setQty] = useState(it.qty || '')
  const [category, setCategory] = useState(it.category || OTHER)
  const [assignee, setAssignee] = useState(it.assignee || 'anyone')
  const textRef = useRef(null)

  const open = () => {
    setText(it.text)
    setNote(it.note || '')
    setQty(it.qty || '')
    setCategory(it.category || OTHER)
    setAssignee(it.assignee || 'anyone')
    setEditing(true)
  }

  useEffect(() => {
    if (editing) textRef.current?.focus()
  }, [editing])

  const commit = () => {
    const t = text.trim()
    // Blanking the text reads as "never mind", not "delete by emptying".
    if (!t) {
      setEditing(false)
      return
    }
    const patch = {}
    if (t !== it.text) patch.text = t
    if (!heading) {
      const n = note.trim()
      if (n !== (it.note || '')) patch.note = n || null
      const q = qty.trim()
      if (q !== (it.qty || '')) patch.qty = q || null
      if (grocery && category !== (it.category || OTHER)) patch.category = category
      if (assignee !== (it.assignee || 'anyone')) patch.assignee = assignee
    }
    if (Object.keys(patch).length) onSave(it.id, patch)
    setEditing(false)
  }

  const cancel = () => setEditing(false)

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  // Buttons inside the editor (steppers, aisle/assignee chips) must not steal
  // focus from the text field — a blur would commit and unmount the editor
  // before the tap registers.
  const keepFocus = (e) => e.preventDefault()

  if (editing) {
    return (
      <div
        className="list-row editing"
        // Save when focus leaves the whole editor (tap away / blur), but not
        // while moving between the fields inside it.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) commit()
        }}
      >
        <div className="row-body">
          <input
            ref={textRef}
            className={heading ? 'list-edit-heading' : 'list-edit-text'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            aria-label={heading ? 'Section name' : 'Item text'}
          />
          {!heading && (
            <input
              className="list-edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onKey}
              placeholder="Add a note…"
              aria-label="Item note"
            />
          )}
          {!heading && (
            <div className="qty-stepper">
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setQty(stepQty(qty, -1))}
                aria-label="Decrease quantity"
              >
                <Minus size={15} />
              </button>
              <input
                className="qty-input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={onKey}
                placeholder="Qty"
                aria-label="Quantity"
              />
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setQty(stepQty(qty, 1))}
                aria-label="Increase quantity"
              >
                <Plus size={15} />
              </button>
            </div>
          )}
          {grocery && !heading && (
            <div className="chips aisle-chips">
              {AISLES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onMouseDown={keepFocus}
                  className={`chip ${category === a ? 'accent' : ''}`}
                  onClick={() => setCategory(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
          {!solo && !heading && (
            <div className="chips assignee-edit-chips">
              {assigneeOptions().map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={keepFocus}
                  className={`chip ${assignee === o.value ? 'accent' : ''}`}
                  onClick={() => setAssignee(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (heading) {
    return (
      <SwipeRow
        actions={[
          { label: 'Edit', icon: Edit2, onClick: open },
          { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => onDelete(it.id) },
        ]}
        onClick={open}
      >
        <div className="list-row heading-row">
          <div className="list-heading">{it.text}</div>
        </div>
      </SwipeRow>
    )
  }

  const assigned = it.assignee && it.assignee !== 'anyone'
  const badge = qtyLabel(it.qty)

  return (
    <SwipeRow
      actions={[
        { label: 'Edit', icon: Edit2, onClick: open },
        { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => onDelete(it.id) },
      ]}
      onClick={open}
    >
      <div className="list-row">
        <button
          className={`task-check ${it.checked_at ? 'done' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(it)
          }}
          aria-label="Toggle"
        >
          <Check size={15} />
        </button>
        <div className="row-body">
          <div className={`row-title ${it.checked_at ? 'task-done' : ''}`}>
            {badge && <span className="qty-badge">{badge}</span>}
            {it.text}
          </div>
          {it.note && <div className="row-sub list-item-note">{it.note}</div>}
        </div>
        {assigned && (
          <span className="list-item-assignee" title={assigneeLabel(it.assignee)}>
            <Avatar name={assigneeLabel(it.assignee)} size={22} />
          </span>
        )}
      </div>
    </SwipeRow>
  )
}

// A single list. Grocery lists group open items by aisle (the shop order);
// standard lists keep a hand-orderable list with optional inline section
// headings. Checked items sink to a shared "Got it" section, struck.
export default function ListDetail({ data, listId, onBack, onEdit }) {
  const {
    lists,
    listItems,
    listCatalog,
    addListItem,
    addListHeading,
    toggleListItem,
    updateListItem,
    deleteListItem,
    clearCheckedItems,
    deleteList,
    reorderListItems,
  } = data
  const confirm = useConfirm()
  const list = lists.find((l) => l.id === listId)
  const grocery = list?.kind === 'grocery'
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const items = useMemo(() => {
    const mine = listItems.filter((it) => it.list_id === listId)
    const open = mine.filter((it) => !it.checked_at).sort(byOrder)
    const done = mine
      .filter((it) => it.checked_at)
      .sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1))
    return { open, done }
  }, [listItems, listId])

  // Add-as-you-type suggestions from the household's remembered items, minus
  // what's already open on this list (no point suggesting a dupe).
  const suggestions = useMemo(() => {
    const onList = items.open.filter((it) => !it.is_heading).map((it) => it.text)
    return suggestItems(listCatalog || [], draft, { exclude: onList, limit: 6 })
  }, [listCatalog, draft, items.open])

  if (!list) {
    return (
      <div>
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <p className="empty">List not found.</p>
      </div>
    )
  }

  const add = () => {
    const raw = draft.trim()
    if (!raw) return
    // On a grocery list a leading number is almost always a count ("2 avocados",
    // "12 oz cream cheese"), so peel it into the qty instead of the item name.
    if (grocery) {
      const { qty, text } = parseQty(raw)
      addListItem(listId, text, qty ? { qty } : {})
    } else {
      addListItem(listId, raw)
    }
    setDraft('')
    inputRef.current?.focus() // stay focused for rapid entry
  }

  // Tap a suggestion: add it with its remembered aisle (grocery), skipping the
  // keyword guess. Standard items carry no aisle, so they just add the text.
  const pickSuggestion = (s) => {
    addListItem(listId, s.text, grocery && s.category ? { category: s.category } : {})
    setDraft('')
    inputRef.current?.focus()
  }

  const addSection = () => {
    addListHeading(listId, draft.trim() || 'Section')
    setDraft('')
    inputRef.current?.focus()
  }

  const toggle = (it) => {
    if (!it.checked_at) haptics.light()
    toggleListItem(it)
  }

  const removeList = async () => {
    const ok = await confirm({
      title: `Delete “${list.name}”?`,
      message: 'This removes the list and everything on it.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) {
      onBack()
      deleteList(listId)
    }
  }

  const row = (it) => (
    <ListItemRow
      key={it.id}
      it={it}
      grocery={grocery}
      onToggle={toggle}
      onDelete={deleteListItem}
      onSave={updateListItem}
    />
  )

  const doneSection = items.done.length > 0 && (
    <>
      <div className="section-label">Got it · {items.done.length}</div>
      <div className="list">{items.done.map(row)}</div>
    </>
  )

  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="list-detail-head">
        <span className="list-emoji lg" style={list.color ? { background: list.color } : undefined}>
          {list.icon || (grocery ? '🛒' : '📝')}
        </span>
        <h1 className="person-name">{list.name}</h1>
        <div className="head-actions">
          <button className="icon-btn" onClick={() => onEdit(list)} aria-label="Edit list">
            <Edit2 size={18} />
          </button>
          <button className="icon-btn danger" onClick={removeList} aria-label="Delete list">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {items.done.length > 0 && (
        <div className="profile-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          <button className="pill-btn neutral" onClick={() => clearCheckedItems(listId)}>
            Clear checked
          </button>
        </div>
      )}

      <div className="list-detail-body">
        {items.open.length === 0 && items.done.length === 0 ? (
          <p className="empty">Nothing here yet. Add the first item above.</p>
        ) : grocery ? (
          <>
            {groupByAisle(items.open.filter((it) => !it.is_heading)).map((g) => (
              <section className="aisle-group" key={g.aisle}>
                <div className="section-label">{g.aisle}</div>
                <div className="list">{g.items.map(row)}</div>
              </section>
            ))}
            {doneSection}
          </>
        ) : (
          <>
            {items.open.length > 0 && (
              <ReorderableList
                items={items.open}
                onMove={(from, to) => reorderListItems(moveUpdates(items.open, from, to))}
                renderItem={(it) => row(it)}
              />
            )}
            {doneSection}
          </>
        )}
      </div>

      {/* Add dock sits at the bottom, within thumb reach while shopping. On
          mobile it sticks just above the tab bar; suggestions grow upward from
          the input so the field itself never moves. */}
      <div className="list-add-dock">
        {!grocery && (
          <button className="text-btn add-section-btn" onClick={addSection}>
            <Plus size={14} /> Add section
          </button>
        )}
        {suggestions.length > 0 && (
          <div className="list-suggest" role="listbox" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button
                key={s.norm}
                type="button"
                className="list-suggest-item"
                onClick={() => pickSuggestion(s)}
              >
                <Plus size={14} className="list-suggest-plus" />
                <span className="list-suggest-text">{s.text}</span>
                {grocery && s.category && <span className="list-suggest-aisle">{s.category}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="list-add">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an item…"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button className="list-add-btn" onClick={add} aria-label="Add item">
            <Plus size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
