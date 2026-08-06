import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, Trash2, Edit2 } from 'react-feather'
import SwipeRow from '../../components/ui/SwipeRow'
import ReorderableList from '../../components/ui/ReorderableList'
import Avatar from '../../components/ui/Avatar'
import { byOrder, moveUpdates } from '../../lib/order'
import { groupByAisle, AISLES, OTHER } from '../../lib/aisles'
import { suggestItems } from '../../lib/catalog'
import { stepQty, qtyLabel, parseQty } from '../../lib/listItems'
import { assigneeOptions, assigneeLabel, isSolo } from '../../lib/household'
import haptics from '../../lib/haptics'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import SelectRow from '../../components/ui/SelectRow'
import Stepper from '../../components/ui/Stepper'
import NoteBacklinks from '../../components/ui/NoteBacklinks'

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
  const editorRef = useRef(null)

  const open = () => {
    setText(it.text)
    setNote(it.note || '')
    setQty(it.qty || '')
    setCategory(it.category || OTHER)
    setAssignee(it.assignee || 'anyone')
    setEditing(true)
  }

  useEffect(() => {
    if (!editing) return
    textRef.current?.focus()
    // Focusing the text field only guarantees the *top* of the editor is
    // visible. On a small phone the rest of it opened underneath the add dock
    // with no way to scroll it back. `nearest` isn't enough either: the dock is
    // a sticky overlay, so the browser counts the band behind it as visible and
    // scrolls 11px short. Centring clears it on every size.
    editorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
        ref={editorRef}
        className="list-row editing"
        // Save when focus leaves the whole editor (tap away / blur), but not
        // while moving between the fields inside it — and not when it moves
        // into an overlay this editor opened. The aisle sheet is portaled to
        // <body>, so `contains` is false for it and committing here would
        // unmount the editor, and the sheet with it, mid-choice.
        onBlur={(e) => {
          const to = e.relatedTarget
          if (to && (e.currentTarget.contains(to) || to.closest?.('.sheet-overlay'))) return
          commit()
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
            <Stepper
              label="quantity"
              onMouseDown={keepFocus}
              onStep={(d) => setQty(stepQty(qty, d))}
              renderValue={() => (
                <input
                  className="qty-input"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Qty"
                  aria-label="Quantity"
                />
              )}
            />
          )}
          {/* Twelve aisles as chips wrapped to five rows on an iPhone SE and
              pushed the bottom of this editor under the add dock, where it
              couldn't be scrolled back into view. A drill-in row is one line. */}
          {grocery && !heading && (
            <SelectRow
              label="Aisle"
              value={category}
              onChange={setCategory}
              onMouseDown={keepFocus}
              options={AISLES.map((a) => ({ value: a, label: a }))}
            />
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
        label={it.text}
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
      label={it.text}
      actions={[
        { label: 'Edit', icon: Edit2, onClick: open },
        { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => onDelete(it.id) },
      ]}
      onClick={open}
    >
      <div className="list-row">
        {/* Every checkbox on the list used to announce itself as "Toggle", so a
            screen-reader user heard the same word N times with no item and no
            state. A checkbox role carries the state; the name carries which. */}
        <button
          className={`task-check ${it.checked_at ? 'done' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(it)
          }}
          role="checkbox"
          aria-checked={!!it.checked_at}
          aria-label={it.text}
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
export default function ListDetail({ data, listId, onBack, onEdit, onOpenNote }) {
  const {
    lists,
    listItems,
    notes = [],
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
        <NavBar backLabel="Back" onBack={onBack} title="Not found" />
        <EmptyState>List not found.</EmptyState>
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

  // No confirm dialog: deleteList raises an Undo toast that restores the list
  // and every item on it, which is the native pattern and strictly better than
  // a prompt. The index's swipe-to-delete already worked this way, so asking
  // here and not there was the only inconsistency.
  const removeList = () => {
    onBack()
    deleteList(listId)
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
      <SectionLabel>Got it · {items.done.length}</SectionLabel>
      <div className="list">{items.done.map(row)}</div>
    </>
  )

  return (
    <div className="detail">
      <NavBar backLabel="Lists" onBack={onBack} title={list.name}>
        <div className="list-detail-head">
          <span
            className="list-emoji lg"
            style={list.color ? { background: list.color } : undefined}
          >
            {list.icon || (grocery ? '🛒' : '📝')}
          </span>
          <h1 className="person-name">{list.name}</h1>
          <div className="head-actions">
            <IconButton icon={Edit2} onClick={() => onEdit(list)} label="Edit list" />
            <IconButton icon={Trash2} variant="danger" onClick={removeList} label="Delete list" />
          </div>
        </div>
      </NavBar>
      {items.done.length > 0 && (
        <div className="profile-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          <button className="pill-btn neutral" onClick={() => clearCheckedItems(listId)}>
            Clear checked
          </button>
        </div>
      )}

      <div className="list-detail-body">
        {items.open.length === 0 && items.done.length === 0 ? (
          <EmptyState>Nothing here yet. Add the first item above.</EmptyState>
        ) : grocery ? (
          <>
            {groupByAisle(items.open.filter((it) => !it.is_heading)).map((g) => (
              <section className="aisle-group" key={g.aisle}>
                <SectionLabel>{g.aisle}</SectionLabel>
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

        <NoteBacklinks notes={notes} type="list" id={listId} onOpenNote={onOpenNote} />
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
        {/* A listbox's children have to be options — as plain buttons they were
            announced as an empty list. Kept as <button> for the tap behaviour,
            relabelled so AT sees the choices. */}
        {suggestions.length > 0 && (
          <div className="list-suggest" role="listbox" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button
                key={s.norm}
                type="button"
                role="option"
                aria-selected="false"
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
            aria-label={`Add an item to ${list.name}`}
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
