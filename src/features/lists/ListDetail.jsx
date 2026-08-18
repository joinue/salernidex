import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckSquare,
  Copy,
  Plus,
  Square,
  Trash2,
  Edit2,
  Folder,
  ShoppingCart,
} from 'react-feather'
import SwipeRow from '../../components/ui/SwipeRow'
import PressableRow from '../../components/ui/PressableRow'
import ReorderableList from '../../components/ui/ReorderableList'
import SelectionBar from '../../components/ui/SelectionBar'
import Avatar from '../../components/ui/Avatar'
import { byOrder, moveUpdates } from '../../lib/order'
import { groupByAisle, AISLES, OTHER } from '../../lib/aisles'
import { suggestItems } from '../../lib/catalog'
import { stepQty, qtyLabel, parseQty } from '../../lib/listItems'
import {
  dayChipLabel,
  dayLabel,
  parseIngredients,
  planWindow,
  suggestedDay,
  toISO,
  windowDays,
} from '../../lib/mealPlan'
import { isCheckable, isGrocery, isMealPlan, kindOf, listIcon } from '../../lib/listKinds'
import { assigneeOptions, assigneeLabel, isSolo } from '../../lib/household'
import { showToast } from '../../lib/toast'
import haptics from '../../lib/haptics'
import { shoppersOf, shoppingLabel } from '../../lib/presence'
import { longPressOwner } from '../../lib/gestures'
import { copyText, countLabel, toMarkdown } from '../../lib/bulk'
import { useSelection } from '../../hooks/useSelection'
import { usePresenceContext } from '../../components/shell/presenceContext'
import { useNow } from '../../hooks/useNow'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import SelectRow from '../../components/ui/SelectRow'
import Stepper from '../../components/ui/Stepper'
import ActionSheet from '../../components/ui/ActionSheet'
import NoteBacklinks from '../../components/ui/NoteBacklinks'
import ShareButton from '../../components/ui/ShareButton'

// One row of a list. Tap the text to edit it inline (text, an optional note, a
// quantity, plus an aisle picker on grocery items and a "who's grabbing it"
// picker in a shared household); tap the circle to check/uncheck; swipe to
// delete. A heading row (standard-list section) has no checkbox and edits text
// only. Editing state is local so a parent re-render (realtime sync, a sibling
// toggle) can't yank focus mid-edit — hence a top-level component.
function ListItemRow({
  it,
  grocery,
  meal,
  checkable = true,
  autoOpen = false,
  selecting = false,
  selected = false,
  onSelect,
  onLongPress,
  onToggle,
  onDelete,
  onSave,
  onShop,
}) {
  const heading = it.is_heading
  const solo = isSolo()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(it.text)
  const [note, setNote] = useState(it.note || '')
  const [qty, setQty] = useState(it.qty || '')
  const [category, setCategory] = useState(it.category || OTHER)
  const [assignee, setAssignee] = useState(it.assignee || 'anyone')
  const [onDate, setOnDate] = useState(it.on_date || '')
  const textRef = useRef(null)
  const editorRef = useRef(null)

  const open = () => {
    setText(it.text)
    setNote(it.note || '')
    setQty(it.qty || '')
    setCategory(it.category || OTHER)
    setAssignee(it.assignee || 'anyone')
    setOnDate(it.on_date || '')
    setEditing(true)
  }

  // A section created from the dock opens straight into its editor, scrolled
  // into view by the effect below — so "Add section" visibly lands somewhere
  // instead of appending a row called "Section" below the fold.
  useEffect(() => {
    if (autoOpen) open()
    // Only on the row that was just created; `open` is stable enough for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen])

  useEffect(() => {
    if (!editing) return
    textRef.current?.focus()
    // Seeded names ("Section") should be replaced by typing, not edited around.
    if (autoOpen) textRef.current?.select()
    // Focusing the text field only guarantees the *top* of the editor is
    // visible. On a small phone the rest of it opened underneath the add dock
    // with no way to scroll it back. `nearest` isn't enough either: the dock is
    // a sticky overlay, so the browser counts the band behind it as visible and
    // scrolls 11px short. Centering clears it on every size.
    editorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [editing, autoOpen])

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
      // Clearing the date is meaningful on a meal plan — it moves the meal to
      // Unscheduled rather than deleting it — so an empty string saves as null.
      if (meal && onDate !== (it.on_date || '')) patch.on_date = onDate || null
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

  // While selecting, the row means something different: it is a checkbox with a
  // label on it. No swipe actions, no inline editor, no navigation — which is
  // also how the swipe/long-press collision stops being a collision at all,
  // since the gestures simply aren't mounted in this mode.
  //
  // Its own branch rather than conditionals threaded through the row below,
  // because "this row means something else now" is what a mode is.
  if (selecting) {
    // A section heading is structure, not an item — there is nothing to check
    // off, copy or delete about it, so it stays inert and untickable.
    if (heading) {
      return (
        <div className="list-row heading-row is-inert">
          <div className="list-heading">{it.text}</div>
        </div>
      )
    }
    const badgeText = qtyLabel(it.qty)
    return (
      <PressableRow
        className={`list-row ${selected ? 'is-selected' : ''}`}
        label={it.text}
        onClick={() => onSelect?.(it.id)}
      >
        <span
          className={`select-tick tap-target ${selected ? 'on' : ''}`}
          role="checkbox"
          aria-checked={selected}
          aria-label={it.text}
        >
          <Check size={14} />
        </span>
        <div className="row-body">
          <div className={`row-title ${it.checked_at ? 'task-done' : ''}`}>
            {badgeText && <span className="qty-badge">{badgeText}</span>}
            {it.text}
          </div>
          {it.note && <div className="row-sub list-item-note">{it.note}</div>}
        </div>
      </PressableRow>
    )
  }

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
              // On a meal the note IS the ingredient line — say so, because
              // that's what "Add to groceries" reads back out of it. On a
              // collection it's the reason the entry is on the list at all,
              // which is most of the value of keeping one.
              placeholder={
                meal
                  ? 'Ingredients, comma separated…'
                  : checkable
                    ? 'Add a note…'
                    : 'What you want to remember…'
              }
              aria-label={meal ? 'Ingredients' : 'Item note'}
            />
          )}
          {meal && !heading && (
            <div className="meal-date-field">
              <input
                type="date"
                value={onDate}
                onMouseDown={keepFocus}
                onChange={(e) => setOnDate(e.target.value)}
                aria-label="Day"
              />
              {onDate && (
                <button
                  type="button"
                  className="chip"
                  onMouseDown={keepFocus}
                  onClick={() => setOnDate('')}
                >
                  Unschedule
                </button>
              )}
            </div>
          )}
          {/* Quantity is about acquiring something, so it belongs to the two
              kinds you shop or cook from — not to a dinner (never ×2) and not
              to a restaurant you like. */}
          {!heading && !meal && checkable && (
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
          {/* "Who's grabbing it" needs someone to be grabbing something. On a
              collection nobody is. */}
          {!solo && !heading && checkable && (
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
          {/* Nothing about an uppercase label says "tap me to rename". The
              pencil is the only thing here that does, so it's always drawn
              rather than revealed on hover — half these lists are only ever
              seen on a phone, where there is no hover to reveal it. */}
          <Edit2 size={13} className="list-heading-edit" aria-hidden="true" />
        </div>
      </SwipeRow>
    )
  }

  const assigned = it.assignee && it.assignee !== 'anyone'
  const badge = qtyLabel(it.qty)
  // A meal with ingredients written down can hand them to the grocery list.
  // Offered only when there's something to send, so the action is never a
  // no-op the user has to discover by tapping it.
  const shoppable = meal && onShop && parseIngredients(it.note).length > 0

  return (
    <SwipeRow
      label={it.text}
      actions={[
        ...(shoppable
          ? [{ label: 'To groceries', icon: ShoppingCart, onClick: () => onShop(it) }]
          : []),
        { label: 'Edit', icon: Edit2, onClick: open },
        { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => onDelete(it.id) },
      ]}
      onClick={open}
      onLongPress={onLongPress}
    >
      <div className={`list-row ${checkable ? '' : 'no-check'}`}>
        {/* Every checkbox on the list used to announce itself as "Toggle", so a
            screen-reader user heard the same word N times with no item and no
            state. A checkbox role carries the state; the name carries which.
            A collection has none at all — there's nothing to complete. */}
        {checkable && (
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
        )}
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
export default function ListDetail({ data, listId, onBack, onEdit, onOpenNote, onOpenProject }) {
  const {
    lists,
    listItems,
    notes = [],
    tasks = [],
    listCatalog,
    addListItem,
    addListHeading,
    toggleListItem,
    updateListItem,
    deleteListItem,
    clearCheckedItems,
    deleteListItems,
    setListItemsChecked,
    deleteList,
    reorderListItems,
  } = data
  const list = lists.find((l) => l.id === listId)
  const grocery = isGrocery(list)
  const meal = isMealPlan(list)
  // A collection is the one kind with nothing to complete: no checkboxes, no
  // "Got it" section, no quantity or assignee. Everything else about a list
  // still applies — sections, drag order, notes.
  const checkable = isCheckable(list)
  // A list scoped to a project (project_id, set from ProjectDetail) used to say
  // nothing about it here — you could open the packing list off Today with no
  // sign it belonged to the trip, and no way to get there. The link is one line
  // of chrome and it makes the relationship two-way.
  const project = list?.project_id ? tasks.find((t) => t.id === list.project_id) : null
  // Only when we can actually go there — a dead chip is worse than no chip. A
  // project that's been deleted (or is private to someone else) just leaves the
  // list looking like any other, which is what it now is.
  const showProject = !!project && !!onOpenProject
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  // Which day the add dock files into. Null until the user picks one, so the
  // suggestion below can keep moving forward as the week fills up rather than
  // freezing on whatever day happened to be free when the page mounted.
  const [pickedDay, setPickedDay] = useState(null)
  // Meals waiting on a choice of grocery list (only when there's more than one).
  const [shopping, setShopping] = useState(null)
  // The section just created from the dock, so its row can open itself.
  const [newHeadingId, setNewHeadingId] = useState(null)

  // Errand co-presence (docs/scopes/competitive-superlist.md §3e). Ticked on a
  // short cadence rather than the default five minutes because this is the one
  // thing on the page that has to go stale on its own: a signal has a TTL, and
  // without a tick to re-read it the banner would sit there until some other
  // state happened to re-render the page.
  const presence = usePresenceContext()
  const presenceNow = useNow(10000)
  const shoppers = presence
    ? shoppersOf(presence.presence, listId, presenceNow, { exclude: presence.meId })
    : []
  const shoppingNote = shoppingLabel(shoppers)

  // Leaving the page ends the claim. The TTL would get there on its own, but
  // forty-five seconds of a stale banner is forty-five seconds of somebody in
  // an aisle believing their partner is already on it — and closing the page is
  // the one moment we can say so for certain.
  const stopShopping = presence?.stopShopping
  useEffect(() => () => stopShopping?.(), [stopShopping, listId])

  const items = useMemo(() => {
    const mine = listItems.filter((it) => it.list_id === listId)
    const open = mine.filter((it) => !it.checked_at).sort(byOrder)
    const done = mine
      .filter((it) => it.checked_at)
      .sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1))
    return { open, done }
  }, [listItems, listId])

  // Today, recomputed on every render rather than held in state: a plan left
  // open on the kitchen tablet overnight must roll to the new day by itself.
  const todayISO = toISO(new Date())
  const plan = useMemo(
    () => (meal ? planWindow([...items.open, ...items.done], todayISO) : null),
    [meal, items, todayISO],
  )
  const addDay = pickedDay ?? (plan ? suggestedDay(items.open, todayISO) : null)

  // Every selectable row, in the order the page actually draws them — each list
  // kind groups differently, and a copied selection that came out in a
  // different order than the screen would read as the wrong rows.
  const ordered = useMemo(() => {
    const flat =
      meal && plan
        ? [
            ...plan.earlier,
            ...plan.days.flatMap((d) => d.items),
            ...plan.later,
            ...plan.unscheduled,
            ...plan.done,
          ]
        : grocery
          ? [
              ...groupByAisle(items.open.filter((it) => !it.is_heading)).flatMap((g) => g.items),
              ...items.done,
            ]
          : [...items.open, ...items.done]
    // Section headings are structure, never selection targets.
    return flat.filter((it) => !it.is_heading)
  }, [meal, plan, grocery, items])
  const orderedIds = useMemo(() => ordered.map((it) => it.id), [ordered])
  const sel = useSelection(orderedIds)

  // A standard list is hand-orderable, so its long press belongs to reorder and
  // Select is reached from the button instead. Decided by lib/gestures so the
  // rule can't come out differently on the next surface that wants it.
  const reorderable = !grocery && !meal
  const pressOwner = longPressOwner({ reorderable, selecting: sel.selecting })

  // Every grocery list in the household — where a meal's ingredients can go.
  const groceryLists = useMemo(() => lists.filter((l) => l.kind === 'grocery'), [lists])

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
    } else if (meal) {
      addListItem(listId, raw, { on_date: addDay })
      // Adding to a day means you're filling that day; the next one should
      // follow the plan forward rather than snapping back to today.
      setPickedDay(null)
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
    const id = addListHeading(listId, draft.trim() || 'Section')
    setDraft('')
    // Don't pull focus back to the dock — the new section's own editor is
    // taking it, and two focus grabs in one tick leaves the keyboard up over
    // a field nobody is typing in.
    setNewHeadingId(id)
  }

  // Tapping an empty day aims the add dock at it and opens the keyboard — the
  // gap you tapped is the one you're about to fill.
  const focusDay = (iso) => {
    setPickedDay(iso)
    inputRef.current?.focus()
  }

  const toggle = (it) => {
    if (!it.checked_at) haptics.light()
    toggleListItem(it)
    // Checking something off is what makes you present — not opening the page.
    // That is the whole line between this and the viewer presence §5 declines,
    // and it lives here because this is the only place that can tell the two
    // apart. announceShopping applies the privacy gate, so a private list
    // silently declines to say anything.
    if (!checkable) return
    const countable = [...items.open, ...items.done].filter((i) => !i.is_heading)
    // Count from the row we just flipped rather than from state, which hasn't
    // re-rendered yet — a beat that lags the screen by one item reads as a bug.
    const done = countable.filter((i) => !!i.checked_at).length + (it.checked_at ? -1 : 1)
    presence?.announceShopping(list, { done, total: countable.length })
  }

  // No confirm dialog: deleteList raises an Undo toast that restores the list
  // and every item on it, which is the native pattern and strictly better than
  // a prompt. The index's swipe-to-delete already worked this way, so asking
  // here and not there was the only inconsistency.
  const removeList = () => {
    onBack()
    deleteList(listId)
  }

  // Send a meal's ingredients to a grocery list. addListItem does the rest for
  // free: each line gets categorized into an aisle, a line that's already open
  // bumps its quantity instead of doubling up, and "2 avocados" peels into a
  // count — all of which is why this pushes items through the normal add path
  // rather than inserting rows itself.
  const sendToGroceries = (item, targetList) => {
    const ingredients = parseIngredients(item.note)
    if (!ingredients.length) return
    for (const line of ingredients) {
      const { qty, text } = parseQty(line)
      addListItem(targetList.id, text, qty ? { qty } : {})
    }
    haptics.light()
    showToast(`Added ${ingredients.length} to ${targetList.name}`)
  }

  // One grocery list is the overwhelmingly common case, so don't ask. Several
  // and the sheet is the only honest answer; none and say so rather than
  // silently doing nothing.
  const startShopping = (item) => {
    if (groceryLists.length === 0) {
      showToast('No grocery list yet. Make one and try again')
    } else if (groceryLists.length === 1) {
      sendToGroceries(item, groceryLists[0])
    } else {
      setShopping(item)
    }
  }

  // What the bar can do with a selection. Check-off is offered as whichever
  // direction actually changes something: with anything unchecked picked, the
  // useful verb is "Check off", and once they're all checked it becomes the
  // only other thing you'd mean.
  const selectedItems = ordered.filter((it) => sel.isSelected(it.id))
  const anyUnchecked = selectedItems.some((it) => !it.checked_at)
  const bulkActions = [
    ...(checkable
      ? [
          {
            label: anyUnchecked ? 'Check off' : 'Uncheck',
            icon: anyUnchecked ? CheckSquare : Square,
            onClick: () => sel.run((ids) => setListItemsChecked(ids, anyUnchecked)),
          },
        ]
      : []),
    {
      label: 'Copy',
      icon: Copy,
      onClick: () =>
        sel.run(async (ids) => {
          const rows = ordered.filter((it) => ids.includes(it.id))
          const ok = await copyText(toMarkdown(rows, { checkable, heading: list.name }))
          showToast(ok ? `Copied ${countLabel(ids.length, 'item')}` : 'Could not copy that', {
            variant: ok ? undefined : 'error',
          })
        }),
    },
    {
      label: 'Delete',
      icon: Trash2,
      variant: 'danger',
      // No confirm: deleteListItems raises one Undo toast that restores all of
      // them, which is the native pattern and strictly better than a prompt.
      onClick: () => sel.run((ids) => deleteListItems(ids)),
    },
  ]

  const row = (it) => (
    <ListItemRow
      key={it.id}
      it={it}
      grocery={grocery}
      meal={meal}
      checkable={checkable}
      autoOpen={it.id === newHeadingId}
      selecting={sel.selecting}
      selected={sel.isSelected(it.id)}
      onSelect={sel.toggle}
      onLongPress={pressOwner === 'selection' ? () => sel.enter(it.id) : undefined}
      onToggle={toggle}
      onDelete={deleteListItem}
      onSave={updateListItem}
      onShop={startShopping}
    />
  )

  // Nothing on a collection can be checked, so it has no "Got it" pile — and
  // any legacy rows carrying a checked_at just render inline with the rest.
  const doneSection = checkable && items.done.length > 0 && (
    <>
      <SectionLabel>Got it · {items.done.length}</SectionLabel>
      <div className="list">{items.done.map(row)}</div>
    </>
  )

  return (
    <div className={`detail ${sel.selecting ? 'selecting' : ''}`}>
      <NavBar backLabel="Lists" onBack={onBack} title={list.name}>
        <div className="list-detail-head">
          <span
            className="list-emoji lg"
            style={list.color ? { background: list.color } : undefined}
          >
            {listIcon(list)}
          </span>
          <h1 className="person-name">{list.name}</h1>
          <div className="head-actions">
            {/* Selection's guaranteed front door. The long press is a shortcut
                that a hand-orderable list can't offer, so the button is what
                keeps the feature reachable everywhere — see longPressOwner. */}
            {ordered.length > 0 && !sel.selecting && (
              <button className="text-btn" onClick={() => sel.enter()}>
                Select
              </button>
            )}
            <ShareButton type="list" row={list} label="Send this list" />
            <IconButton icon={Edit2} onClick={() => onEdit(list)} label="Edit list" />
            <IconButton icon={Trash2} variant="danger" onClick={removeList} label="Delete list" />
          </div>
        </div>
      </NavBar>
      {/* Deliberately a quiet strip and not a Card: this is a hint with a TTL,
          and the durable "I've got this" surface is the claim chip elsewhere.
          Drawing ephemeral state with the weight of a stored fact is how people
          come to trust it more than it deserves. */}
      {shoppingNote && (
        <div className="shopping-now" aria-live="polite">
          <span className="shopping-now-faces">
            {shoppers.slice(0, 3).map((s) => (
              <Avatar key={s.memberId} name={s.name || 'Someone'} size={20} />
            ))}
          </span>
          <span className="shopping-now-text">{shoppingNote}</span>
        </div>
      )}
      {(showProject || (checkable && items.done.length > 0)) && (
        <div className="profile-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          {showProject && (
            <button className="pill-btn neutral" onClick={() => onOpenProject(project.id)}>
              <Folder size={13} /> {project.title}
            </button>
          )}
          {checkable && items.done.length > 0 && (
            <button className="pill-btn neutral" onClick={() => clearCheckedItems(listId)}>
              {meal ? 'Clear made' : 'Clear checked'}
            </button>
          )}
        </div>
      )}

      <div className="list-detail-body">
        {items.open.length === 0 && items.done.length === 0 && !meal ? (
          <EmptyState>
            {checkable
              ? 'Nothing here yet. Add the first item above.'
              : 'Nothing kept yet. Add the first one above.'}
          </EmptyState>
        ) : meal ? (
          <>
            {/* Days are the sections, and an empty one still renders — the
                gaps are the point of looking at a meal plan. */}
            {plan.earlier.length > 0 && (
              <section className="meal-day past">
                <SectionLabel>Earlier</SectionLabel>
                <div className="list">{plan.earlier.map(row)}</div>
              </section>
            )}
            {plan.days.map((d) => (
              <section className={`meal-day ${d.iso === todayISO ? 'is-today' : ''}`} key={d.iso}>
                <SectionLabel>{dayLabel(d.iso, todayISO)}</SectionLabel>
                {d.items.length > 0 ? (
                  <div className="list">{d.items.map(row)}</div>
                ) : (
                  <button className="meal-day-empty" onClick={() => focusDay(d.iso)}>
                    <Plus size={14} /> Plan something
                  </button>
                )}
              </section>
            ))}
            {plan.later.length > 0 && (
              <section className="meal-day">
                <SectionLabel>Later</SectionLabel>
                <div className="list">{plan.later.map(row)}</div>
              </section>
            )}
            {plan.unscheduled.length > 0 && (
              <section className="meal-day">
                <SectionLabel>No day yet</SectionLabel>
                <div className="list">{plan.unscheduled.map(row)}</div>
              </section>
            )}
            {plan.done.length > 0 && (
              <section className="meal-day">
                <SectionLabel>Made · {plan.done.length}</SectionLabel>
                <div className="list">{plan.done.map(row)}</div>
              </section>
            )}
          </>
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
            {/* Selecting drops the reorder wrapper entirely rather than
                disabling it — you are choosing rows, not arranging them, and a
                lift under a finger that meant to tick one more would scatter
                the list. Same rule longPressOwner states. */}
            {items.open.length > 0 &&
              (sel.selecting ? (
                <div className="list">{items.open.map(row)}</div>
              ) : (
                <ReorderableList
                  items={items.open}
                  onMove={(from, to) => reorderListItems(moveUpdates(items.open, from, to))}
                  renderItem={(it) => row(it)}
                />
              ))}
            {doneSection}
          </>
        )}

        <NoteBacklinks notes={notes} type="list" id={listId} onOpenNote={onOpenNote} />
      </div>

      {/* Add dock sits at the bottom, within thumb reach while shopping. On
          mobile it sticks just above the tab bar; suggestions grow upward from
          the input so the field itself never moves.
          Hidden while selecting: the selection bar occupies that space, and
          adding a new item is not a thing you're doing mid-selection. */}
      <div className="list-add-dock" hidden={sel.selecting}>
        {!grocery && !meal && (
          <button className="text-btn add-section-btn" onClick={addSection}>
            <Plus size={14} /> Add section
          </button>
        )}
        {/* Which day the next meal lands on. A scrolling row rather than a date
            input: planning a week is seven taps, and a native picker for each
            one would be seven sheets. */}
        {meal && (
          <div className="meal-day-picker" role="radiogroup" aria-label="Day">
            {windowDays(todayISO).map((iso) => (
              <button
                key={iso}
                type="button"
                role="radio"
                aria-checked={iso === addDay}
                className={`chip ${iso === addDay ? 'accent' : ''}`}
                onClick={() => setPickedDay(iso)}
              >
                {dayChipLabel(iso, todayISO)}
              </button>
            ))}
          </div>
        )}
        {/* A listbox's children have to be options — as plain buttons they were
            announced as an empty list. Kept as <button> for the tap behavior,
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
            placeholder={
              meal
                ? `What's for ${dayLabel(addDay, todayISO).toLowerCase()}?`
                : kindOf(list).addPlaceholder
            }
            aria-label={`${kindOf(list).addPlaceholder.replace(/…$/, '')} to ${list.name}`}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button
            className="list-add-btn"
            onClick={add}
            aria-label={meal ? 'Add meal' : 'Add item'}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {sel.selecting && (
        <SelectionBar
          count={sel.count}
          noun="item"
          allSelected={sel.allSelected}
          onToggleAll={sel.toggleAll}
          onCancel={sel.exit}
          actions={bulkActions}
        />
      )}

      {shopping && (
        <ActionSheet
          title={`Add ${shopping.text}'s ingredients to…`}
          actions={groceryLists.map((l) => ({
            label: l.name,
            icon: ShoppingCart,
            onClick: () => sendToGroceries(shopping, l),
          }))}
          onClose={() => setShopping(null)}
        />
      )}
    </div>
  )
}
