import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Copy,
  Plus,
  Trash2,
  Star,
  BookOpen,
  RotateCcw,
  Grid,
  Sliders,
  List as ListIcon,
} from 'react-feather'
import { showToast } from '../../lib/toast'
import PageHeader from '../../components/shell/PageHeader'
import SharedDot from '../../components/ui/SharedDot'
import SwipeRow from '../../components/ui/SwipeRow'
import PressableRow from '../../components/ui/PressableRow'
import SelectionBar from '../../components/ui/SelectionBar'
import { useSelection } from '../../hooks/useSelection'
import { longPressOwner } from '../../lib/gestures'
import { copyText, countLabel, toMarkdown } from '../../lib/bulk'
import Segmented from '../../components/ui/Segmented'
import ActionSheet from '../../components/ui/ActionSheet'
import Sheet from '../../components/ui/Sheet'
import NoteDetail from './NoteDetail'
import { useConfirm } from '../../hooks/useConfirm'
import { useLongPress } from '../../hooks/useLongPress'
import UnfiledSection from '../../components/ui/UnfiledSection'
import { scopeToArea, areaById, ALL_AREAS } from '../../lib/areas'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { isEditableTarget } from '../../lib/keys'
import { relativeTime } from '../../lib/contact'
import { memberName, isSolo } from '../../lib/household'
import { noteTitle, noteSnippet, htmlToText, sortNotes } from '../../lib/notes'

const SORTS = [
  { value: 'edited', label: 'Edited' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title' },
]

// Below this the index and the note are separate screens (push navigation, like
// the phone has always worked). At or above it there is room to show both.
const SPLIT_QUERY = '(min-width: 900px)'
// The phone, where vertical space above the first note is the scarce thing.
const PHONE_QUERY = '(max-width: 720px)'

// List vs gallery sticks per device, the way the sidebar's collapsed state does.
const VIEW_KEY = 'salernidex-notes-view'
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'gallery' ? 'gallery' : 'list'
  } catch {
    return 'list' // private mode — the toggle still works, it just won't persist
  }
}

// The notebook — Apple Notes-style. Pinned notes sit up top, then the rest by
// the chosen sort; filter by tag or search, browse as a list or a card gallery.
// Swipe (or hover) to pin or delete; delete goes to Recently Deleted, reachable
// from the bottom. Back returns to Today.
//
// This owns both notes routes. On a wide screen it lays the index out as a rail
// beside the open note, so `noteId` is a *selection* rather than a different
// screen; narrower than that, an open note replaces the index entirely and
// `onCloseNote` walks back. The gallery is always full width — it's a browsing
// mode, so it takes the whole window and opening a card leaves it.
export default function NotesView({
  data,
  noteId,
  onOpenNote,
  onAdd,
  onOpenMention,
  sort = 'edited',
  onSort,
  onSearch,
  onCloseNote,
  onBack,
  area,
}) {
  const { notes, deletedNotes, deleteNote, deleteNotes, togglePinNote, restoreNote, purgeNote } =
    data
  const confirm = useConfirm()
  const wide = useMediaQuery(SPLIT_QUERY)
  const phone = useMediaQuery(PHONE_QUERY)
  const [options, setOptions] = useState(false) // phone: the sort/layout sheet
  const [q, setQ] = useState('')
  const [view, setView] = useState(readView)
  const [tag, setTag] = useState(null) // active tag filter
  const [trash, setTrash] = useState(false)
  // Keyboard cursor into `filtered`. -1 means "no keyboard selection yet", so
  // arrowing down starts at the top and arrowing up starts at the bottom.
  const [cursor, setCursor] = useState(-1)
  // Long-pressed gallery card, if any — the touch counterpart of the hover
  // cluster a card wears with a mouse.
  const [cardSheet, setCardSheet] = useState(null)
  // Set just before an arrow-key move so the cursor effect knows to pull real
  // focus along with it. Clicks and deep links move the cursor too, and must
  // NOT yank focus out from under whatever the user was already doing.
  const movedByKey = useRef(false)
  const listRef = useRef(null)
  const paneRef = useRef(null)
  // Which card is under the finger. One long-press hook serves the whole
  // gallery — hooks can't be called per row — so the card records itself here
  // on the way down and the handler reads it when the hold completes.
  const pressedCard = useRef(null)
  const cardPress = useLongPress(() => {
    if (pressedCard.current) setCardSheet(pressedCard.current)
  })

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* private mode */
    }
  }, [view])

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags || []))].sort(), [notes])

  // The lens, applied before search and tag narrowing. `unfiled` is what it
  // excluded only for having no area — shown collapsed at the foot rather than
  // dropped (docs/scopes/areas-and-tags.md §3.5).
  const lens = useMemo(() => scopeToArea(notes, area), [notes, area])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = sortNotes(lens.scoped, sort)
    if (tag) list = list.filter((n) => (n.tags || []).includes(tag))
    if (needle)
      list = list.filter((n) =>
        `${noteTitle(n)} ${htmlToText(n.body)} ${(n.tags || []).join(' ')}`
          .toLowerCase()
          .includes(needle),
      )
    return list
  }, [lens.scoped, sort, tag, q])

  // `filtered` is already in visual order (sortNotes floats pinned to the top),
  // so an index into it is an index into what you see — which is what the
  // keyboard cursor walks. Splitting it into the two rendered sections keeps
  // that true: the pinned block is the head of `filtered`, the rest follows it.
  const pinned = filtered.filter((n) => n.pinned)
  const rest = filtered.filter((n) => !n.pinned)

  // `filtered` is already in visual order, so it is also selection order.
  const selectableIds = useMemo(() => filtered.map((n) => n.id), [filtered])
  const sel = useSelection(selectableIds)
  // The notebook has no drag order, so here the long press is selection's —
  // lib/gestures owns that call so it comes out the same on every surface.
  const pressOwner = longPressOwner({ reorderable: false, selecting: sel.selecting })

  const bulkActions = [
    {
      // Whichever direction actually changes something. With any unpinned note
      // picked the useful verb is Pin; once they're all pinned it flips.
      label: filtered.some((n) => sel.isSelected(n.id) && !n.pinned) ? 'Pin' : 'Unpin',
      icon: Star,
      onClick: () =>
        sel.run((ids) => {
          const rows = filtered.filter((n) => ids.includes(n.id))
          const pinning = rows.some((n) => !n.pinned)
          for (const n of rows) if (!!n.pinned !== pinning) togglePinNote(n.id)
        }),
    },
    {
      label: 'Copy',
      icon: Copy,
      onClick: () =>
        sel.run(async (ids) => {
          const rows = filtered.filter((n) => ids.includes(n.id))
          // Plain bullets: a note has no check state, and `- [ ]` on one would
          // invent a to-do the user never made.
          const ok = await copyText(
            toMarkdown(
              rows.map((n) => ({ title: noteTitle(n) })),
              { checkable: false },
            ),
          )
          showToast(ok ? `Copied ${countLabel(rows.length, 'note')}` : 'Could not copy that', {
            variant: ok ? undefined : 'error',
          })
        }),
    },
    {
      label: 'Delete',
      icon: Trash2,
      variant: 'danger',
      // Soft delete — they go to Recently Deleted, and deleteNotes raises one
      // Undo covering all of them.
      onClick: () => sel.run((ids) => deleteNotes(ids)),
    },
  ]

  const activeNote = noteId ? notes.find((n) => n.id === noteId) : null
  // Two panes only for the list view; the gallery earns its keep by using the
  // whole window, and an open note there takes over the same way.
  const splitView = wide && view === 'list'
  const showDetail = Boolean(noteId) && !splitView
  // Is the index itself on screen? Drives the keyboard listener — without this
  // Enter would open a note while you are reading one on a phone-width window.
  const indexVisible = !trash && !showDetail

  const open = (id) => onOpenNote(id)

  // A new note inherits the tag you're filtered to. Without it the note you just
  // made is excluded by your own filter the moment it exists: the pane shows it,
  // the list doesn't. Filtering to "travel" and hitting New note reads as "a new
  // travel note" anyway. Wrapped because these are click handlers — the event
  // object would otherwise arrive as the new row's fields.
  const add = () => onAdd(tag ? { tags: [tag] } : {})

  // Keep the cursor on whatever is actually open, so arrowing after a click
  // continues from there rather than jumping back to the top of the list.
  useEffect(() => {
    if (!noteId) return
    const i = filtered.findIndex((n) => n.id === noteId)
    if (i >= 0) setCursor(i)
    // Deliberately keyed on the open note only: re-running when `filtered`
    // changes would drag the cursor around while you type in the search box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // ↑/↓ move the selection, Enter opens it, Esc drops it. Ignored while you are
  // typing (search box, title, note body) and while focus sits inside the open
  // note, where the arrow keys belong to the editor.
  useEffect(() => {
    if (!indexVisible) return
    const onKey = (e) => {
      if (isEditableTarget(e.target)) return
      if (paneRef.current?.contains(document.activeElement)) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!filtered.length) return
        e.preventDefault()
        movedByKey.current = true
        setCursor((c) =>
          e.key === 'ArrowDown'
            ? c < 0
              ? 0
              : Math.min(filtered.length - 1, c + 1)
            : c < 0
              ? filtered.length - 1
              : Math.max(0, c - 1),
        )
      } else if (e.key === 'Enter') {
        const n = filtered[cursor]
        if (!n) return
        e.preventDefault()
        open(n.id)
      } else if (e.key === 'Escape') {
        setCursor(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexVisible, filtered, cursor])

  // Follow the cursor. An arrow-key move takes real DOM focus with it, which is
  // the whole point: a focus ring is something a screen reader announces, while
  // a CSS-only highlight is invisible to one. Everything else (a click, opening
  // a note from a link) only scrolls — 'nearest' keeps the row in view without
  // yanking the page around, and nothing steals focus mid-task.
  useEffect(() => {
    if (cursor < 0) return
    const el = listRef.current?.querySelector(`[data-note-idx="${cursor}"]`)
    if (!el) return
    if (movedByKey.current) {
      movedByKey.current = false
      el.focus({ preventScroll: true })
    }
    el.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const editorName = (n) => (!isSolo() && memberName(n.updated_by)) || ''

  // Wide rows put the timestamp on the title line and spend the freed space on
  // two lines of preview; narrow rows keep the single "2h ago · preview" line.
  const rowSub = (n) => {
    const who = editorName(n)
    const snippet = noteSnippet(n, wide ? 160 : 100)
    if (wide) return [who, snippet].filter(Boolean).join(' · ')
    const stamp = `${relativeTime(n.updated_at)}${who ? ` · ${who}` : ''}`
    return [stamp, snippet].filter(Boolean).join(' · ')
  }

  const rowActions = (n) => [
    { label: n.pinned ? 'Unpin' : 'Pin', icon: Star, onClick: () => togglePinNote(n.id) },
    { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => deleteNote(n.id) },
  ]

  const marks = (n, idx) => `${n.id === noteId ? 'active' : ''} ${idx === cursor ? 'cursor' : ''}`

  // Roving tabindex: exactly one entry is tabbable, so Tab steps into the list
  // and back out instead of walking every note, and the arrow keys take over
  // from there. With no cursor yet the first entry holds the tab stop, or the
  // list would be unreachable by keyboard entirely.
  const focusProps = (n, idx) => ({
    'data-note-idx': idx,
    role: 'button',
    tabIndex: idx === (cursor < 0 ? 0 : cursor) ? 0 : -1,
    // Which note the pane is currently showing — the state the highlight
    // conveys visually, said out loud.
    'aria-current': n.id === noteId ? 'true' : undefined,
    // Tabbing or clicking into a row is a cursor move like any other; syncing
    // here keeps the arrow keys continuing from wherever focus actually is.
    onFocus: () => setCursor(idx),
    // Enter is handled once, by the index-wide listener (the event bubbles up
    // from here). Space is the other activation key a role="button" owes you,
    // and it has to be caught on the element or it scrolls the page instead.
    onKeyDown: (e) => {
      if (e.key !== ' ') return
      e.preventDefault()
      open(n.id)
    },
  })

  const row = (n, idx) => {
    const sub = rowSub(n)
    // While selecting, the row is a checkbox with a note on it: no swipe
    // actions, no navigation. Its own branch, like every other surface's.
    if (sel.selecting) {
      const picked = sel.isSelected(n.id)
      return (
        <PressableRow
          key={n.id}
          className={`list-row note-row ${picked ? 'is-selected' : ''}`}
          label={noteTitle(n)}
          onClick={() => sel.toggle(n.id)}
        >
          <span
            className={`select-tick tap-target ${picked ? 'on' : ''}`}
            role="checkbox"
            aria-checked={picked}
            aria-label={noteTitle(n)}
          >
            <Check size={14} />
          </span>
          <div className="row-body">
            <div className="row-titleline">
              <div className="row-title">{noteTitle(n)}</div>
              <SharedDot item={n} />
            </div>
            {sub && <div className="row-sub note-row-sub">{sub}</div>}
          </div>
        </PressableRow>
      )
    }
    return (
      <SwipeRow
        key={n.id}
        label={noteTitle(n)}
        onClick={() => open(n.id)}
        onLongPress={pressOwner === 'selection' ? () => sel.enter(n.id) : undefined}
        actions={rowActions(n)}
      >
        <div className={`list-row note-row ${marks(n, idx)}`} {...focusProps(n, idx)}>
          <div className="row-body">
            <div className="row-titleline">
              <div className="row-title">{noteTitle(n)}</div>
              <SharedDot item={n} />
              {wide && <span className="note-row-time">{relativeTime(n.updated_at)}</span>}
            </div>
            {sub && <div className="row-sub note-row-sub">{sub}</div>}
            {(n.tags || []).length > 0 && (
              <div className="note-row-tags">
                {n.tags.map((t) => (
                  <span className="chip" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </SwipeRow>
    )
  }

  const card = (n, idx) => {
    const body = noteSnippet(n, 240)
    return (
      <div
        key={n.id}
        className={`note-card ${marks(n, idx)} ${sel.isSelected(n.id) ? 'is-selected' : ''}`}
        {...focusProps(n, idx)}
        // While selecting, the card's own long-press menu stands down — the
        // hold has already been spent entering this mode, and a card that
        // opened its action sheet mid-selection would be answering a question
        // nobody asked.
        {...(sel.selecting ? {} : cardPress)}
        onPointerDown={(e) => {
          if (sel.selecting) return
          pressedCard.current = n
          cardPress.onPointerDown(e)
        }}
        onClick={() => (sel.selecting ? sel.toggle(n.id) : open(n.id))}
      >
        {sel.selecting && (
          <span
            className={`select-tick note-card-tick ${sel.isSelected(n.id) ? 'on' : ''}`}
            role="checkbox"
            aria-checked={sel.isSelected(n.id)}
            aria-label={noteTitle(n)}
          >
            <Check size={14} />
          </span>
        )}
        <div className="note-card-head">
          {n.pinned && <Star size={13} className="note-card-pin" fill="currentColor" />}
          <div className="note-card-title">{noteTitle(n)}</div>
          <SharedDot item={n} />
        </div>
        <div className={`note-card-body ${body ? '' : 'empty'}`}>
          {body || 'No additional text'}
        </div>
        <div className="note-card-foot">
          <span className="note-card-time">{relativeTime(n.updated_at)}</span>
          {/* One tag and a count: a ~170px card can't fit two chips beside the
              timestamp, and a chip sliced off at the card edge reads as a bug. */}
          {(n.tags || []).length > 0 && (
            <span className="note-card-tags">
              <span className="chip">{n.tags[0]}</span>
              {n.tags.length > 1 && <span className="note-card-more">+{n.tags.length - 1}</span>}
            </span>
          )}
        </div>
        {/* The gallery has no swipe wrapper, so pin/delete ride the card — but
            only with a mouse, where they can hide until hover and cost nothing.
            Permanent, they needed a 56px lane out of a 168px card and left
            "Italy tri…" where the title goes. Under a thumb it's a long-press
            instead (the same gesture a list row answers), and the title gets
            the whole head back. Hidden in CSS rather than skipped here: the
            query that governs it is the one that also frees the lane. */}
        <div className="note-card-actions">
          <button
            className="icon-btn"
            aria-label={n.pinned ? 'Unpin' : 'Pin'}
            title={n.pinned ? 'Unpin' : 'Pin'}
            onClick={(e) => {
              e.stopPropagation()
              togglePinNote(n.id)
            }}
          >
            <Star size={15} fill={n.pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            className="icon-btn danger"
            aria-label="Delete"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation()
              deleteNote(n.id)
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    )
  }

  const trashLink = deletedNotes.length > 0 && (
    <button className="notes-trash-link" onClick={() => setTrash(true)}>
      <Trash2 size={15} /> Recently Deleted ({deletedNotes.length})
    </button>
  )

  // ---- Recently Deleted ----
  if (trash) {
    const purge = async (n) => {
      const ok = await confirm({
        title: 'Delete forever?',
        message: 'This permanently removes the note. It can’t be undone.',
        confirmLabel: 'Delete forever',
        danger: true,
      })
      if (ok) purgeNote(n.id)
    }
    return (
      <div>
        <button className="back-btn" onClick={() => setTrash(false)}>
          <ArrowLeft size={18} /> Notes
        </button>
        <PageHeader title="Recently Deleted" />
        {deletedNotes.length === 0 ? (
          <div className="empty">
            <Trash2 size={28} className="empty-icon" />
            Nothing here.
          </div>
        ) : (
          <div className="list">
            {sortNotes(deletedNotes, 'edited').map((n) => (
              <div className="list-row note-row" key={n.id}>
                <div className="row-body">
                  <div className="row-title">{noteTitle(n)}</div>
                  {noteSnippet(n) && <div className="row-sub">{noteSnippet(n, 60)}</div>}
                </div>
                <div className="row-meta trash-actions">
                  <button
                    className="icon-btn"
                    onClick={() => restoreNote(n.id)}
                    aria-label="Restore"
                    title="Restore"
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => purge(n)}
                    aria-label="Delete forever"
                    title="Delete forever"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---- One note, full width (phone-width windows, and the gallery) ----
  if (showDetail) {
    return (
      <NoteDetail
        // Keyed by id so switching notes remounts with fresh state + a freshly
        // seeded contentEditable (no cursor fights, no stale body).
        key={noteId}
        data={data}
        noteId={noteId}
        onOpenMention={onOpenMention}
        onBack={onCloseNote}
      />
    )
  }

  // ---- Notebook ----
  // Search + sort + layout + tags, kept together so the whole block can stick to
  // the top of whatever is scrolling it (the rail on desktop, the page below).
  // Sort and layout. On anything but a phone they sit in the toolbar; on a
  // phone they move behind the header's ⚙, because the row they occupied was
  // 50px of permanent chrome for two settings you change rarely — and the
  // notebook was spending so much of the screen on controls that exactly one
  // note showed above the fold. Same controls either way, so the sheet reports
  // the current sort and layout rather than making you remember them.
  // Sort, layout — and Select. Rendered in the toolbar on desktop and inside
  // the "Sort and layout" sheet on a phone, so putting Select here reaches both
  // for free, which is what makes it selection's guaranteed front door.
  //
  // It deliberately does NOT go in the tag-chip row: that row is a horizontal
  // scroller, and a button in it clipped the chips' 44px tap-target extension
  // down to their 24px painted height (caught by audit:mobile).
  const sortControls = (
    <div className="notes-controls">
      {filtered.length > 0 && !sel.selecting && (
        <button
          className="text-btn"
          onClick={() => {
            sel.enter()
            setOptions(false)
          }}
        >
          <CheckSquare size={14} /> Select
        </button>
      )}
      <Segmented options={SORTS} value={sort} onChange={onSort} size="sm" />
      <div className="notes-viewtoggle" role="group" aria-label="Layout">
        <button
          className={view === 'list' ? 'active' : ''}
          onClick={() => setView('list')}
          aria-label="List view"
          aria-pressed={view === 'list'}
          title="List"
        >
          <ListIcon size={16} />
        </button>
        <button
          className={view === 'gallery' ? 'active' : ''}
          onClick={() => setView('gallery')}
          aria-label="Gallery view"
          aria-pressed={view === 'gallery'}
          title="Gallery"
        >
          <Grid size={16} />
        </button>
      </div>
    </div>
  )

  const controls = (
    <div className="notes-toolbar">
      <input
        className="note-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search notes"
        aria-label="Search notes"
        // A search field, told to iOS as one: the key reads "Search" instead of
        // "return", there's a ✕ to clear it, and a note called "Rome" isn't
        // autocapitalised into something the titles don't match.
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        // Nothing to submit — the list filters as you type — so Return's only
        // job is to put the keyboard away and hand the screen back.
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />

      {!phone && sortControls}

      {allTags.length > 0 && (
        <div className="chips notes-tag-row">
          <button className={`chip ${tag === null ? 'accent' : ''}`} onClick={() => setTag(null)}>
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={`chip ${tag === t ? 'accent' : ''}`}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // One section of the index, in whichever layout is on. `from` is where this
  // slice starts in `filtered`, so the keyboard cursor keeps counting straight
  // through both sections.
  const section = (items, from, label) =>
    view === 'gallery' ? (
      <div className="note-gallery" role="group" aria-label={label}>
        {items.map((n, i) => card(n, from + i))}
      </div>
    ) : (
      <div className="list" role="group" aria-label={label}>
        {items.map((n, i) => row(n, from + i))}
      </div>
    )

  const index = (
    <div className={`notes-index ${sel.selecting ? 'selecting' : ''}`} ref={listRef}>
      {controls}
      {sel.selecting && (
        <SelectionBar
          count={sel.count}
          noun="note"
          allSelected={sel.allSelected}
          onToggleAll={sel.toggleAll}
          onCancel={sel.exit}
          actions={bulkActions}
        />
      )}
      {filtered.length === 0 ? (
        // "No notes match" is an answer to a search. With nothing typed and no
        // tag picked, the only thing that emptied the index is the lens — say
        // that instead, or an empty area reads as a broken filter.
        <p className="empty">
          {q.trim() || tag
            ? 'No notes match.'
            : area && area !== ALL_AREAS
              ? `Nothing in ${areaById(data.areas, area)?.name || 'this area'} yet.`
              : 'No notes yet.'}
        </p>
      ) : (
        // Both layouts group the same way. A star in the corner of a card is a
        // weaker signal than a heading, and the gallery skipping the split made
        // pinning look like it did nothing there.
        <>
          {pinned.length > 0 && (
            <>
              <div className="section-label">Pinned</div>
              {section(pinned, 0, 'Pinned')}
            </>
          )}
          {rest.length > 0 && (
            <>
              {pinned.length > 0 && <div className="section-label">Notes</div>}
              {section(rest, pinned.length, 'Notes')}
            </>
          )}
        </>
      )}
      {/* Unfiled notes sit below the index and outside the keyboard cursor's
          walk — `filtered` is what the arrow keys index into, and folding a
          collapsible section into it would make the cursor step through rows
          nobody can see. */}
      <UnfiledSection count={lens.unfiled.length}>
        {section(sortNotes(lens.unfiled, sort), 0, 'No area')}
      </UnfiledSection>
      {trashLink}
    </div>
  )

  return (
    <div className="notes-page">
      {/* Not on a phone: the bottom bar carries Today two slots along, and a
          top-level destination with a back button above its own title is the
          one shape iOS never has. */}
      {onBack && !phone && (
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Today
        </button>
      )}

      <PageHeader
        title="Notes"
        subtitle={notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : undefined}
        // createAction, not action: on a phone the bar's ＋ already makes a
        // note, and two primary buttons for one job is the thing that prop
        // exists to prevent.
        createAction={add}
        actionLabel="New note"
        secondaryAction={phone ? () => setOptions(true) : undefined}
        secondaryActionIcon={Sliders}
        secondaryActionLabel="Sort and layout"
        onSearch={onSearch}
      />

      {notes.length === 0 ? (
        <>
          <div className="empty">
            <BookOpen size={28} className="empty-icon" />
            No notes yet.
            <button className="text-btn" onClick={add}>
              <Plus size={14} /> New note
            </button>
          </div>
          {trashLink}
        </>
      ) : splitView ? (
        <div className="notes-split">
          <aside className="notes-rail">{index}</aside>
          <section className="notes-pane" ref={paneRef}>
            {activeNote ? (
              <NoteDetail
                key={activeNote.id}
                data={data}
                noteId={activeNote.id}
                embedded
                onOpenMention={onOpenMention}
                onBack={onCloseNote}
              />
            ) : (
              <div className="notes-pane-empty">
                <BookOpen size={30} className="empty-icon" />
                <p>Select a note to read it here.</p>
                <button className="text-btn" onClick={add}>
                  <Plus size={14} /> New note
                </button>
              </div>
            )}
          </section>
        </div>
      ) : (
        index
      )}

      {options && (
        <Sheet title="Sort and layout" onClose={() => setOptions(false)}>
          <div className="notes-options">{sortControls}</div>
        </Sheet>
      )}

      {cardSheet && (
        <ActionSheet
          title={noteTitle(cardSheet)}
          onClose={() => setCardSheet(null)}
          actions={rowActions(cardSheet).map(({ label, icon, onClick, variant }) => ({
            label,
            icon,
            onClick,
            danger: variant === 'danger',
          }))}
        />
      )}
    </div>
  )
}
