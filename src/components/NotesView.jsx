import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Star, BookOpen, RotateCcw } from 'react-feather'
import PageHeader from './PageHeader'
import SharedDot from './SharedDot'
import SwipeRow from './SwipeRow'
import Segmented from './Segmented'
import { useConfirm } from '../hooks/useConfirm'
import { relativeTime } from '../lib/contact'
import { memberName, isSolo } from '../lib/household'
import { noteTitle, noteSnippet, htmlToText, sortNotes } from '../lib/notes'

const SORTS = [
  { value: 'edited', label: 'Edited' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title' },
]

// The notebook index — Apple Notes-style. Pinned notes sit up top, then the rest
// by the chosen sort; filter by tag or search. Swipe to pin or delete (delete
// goes to Recently Deleted, reachable from the bottom). Back returns to Today.
export default function NotesView({ data, onOpenNote, onAdd, onSearch, onBack }) {
  const { notes, deletedNotes, deleteNote, togglePinNote, restoreNote, purgeNote } = data
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('edited')
  const [tag, setTag] = useState(null) // active tag filter
  const [trash, setTrash] = useState(false)

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags || []))].sort(), [notes])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = sortNotes(notes, sort)
    if (tag) list = list.filter((n) => (n.tags || []).includes(tag))
    if (needle)
      list = list.filter((n) =>
        `${noteTitle(n)} ${htmlToText(n.body)} ${(n.tags || []).join(' ')}`
          .toLowerCase()
          .includes(needle),
      )
    return list
  }, [notes, sort, tag, q])

  const pinned = filtered.filter((n) => n.pinned)
  const rest = filtered.filter((n) => !n.pinned)

  const editorLine = (n) => {
    const who = !isSolo() && memberName(n.updated_by)
    return `${relativeTime(n.updated_at)}${who ? ` · ${who}` : ''}`
  }

  const row = (n) => (
    <SwipeRow
      key={n.id}
      onClick={() => onOpenNote(n.id)}
      actions={[
        { label: n.pinned ? 'Unpin' : 'Pin', icon: Star, onClick: () => togglePinNote(n.id) },
        { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => deleteNote(n.id) },
      ]}
    >
      <div className="list-row note-row">
        <div className="row-body">
          <div className="row-titleline">
            <div className="row-title">{noteTitle(n)}</div>
            <SharedDot item={n} />
          </div>
          <div className="row-sub note-row-sub">
            <span className="note-time">{editorLine(n)}</span>
            {noteSnippet(n) && <span className="note-snippet"> · {noteSnippet(n)}</span>}
          </div>
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

  // ---- Notebook ----
  return (
    <div>
      {onBack && (
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Today
        </button>
      )}

      <PageHeader
        title="Notes"
        subtitle={notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : undefined}
        action={onAdd}
        actionLabel="New note"
        onSearch={onSearch}
      />

      {notes.length === 0 ? (
        <>
          <div className="empty">
            <BookOpen size={28} className="empty-icon" />
            No notes yet.
            <button className="text-btn" onClick={onAdd}>
              <Plus size={14} /> New note
            </button>
          </div>
          {deletedNotes.length > 0 && (
            <button className="notes-trash-link" onClick={() => setTrash(true)}>
              <Trash2 size={15} /> Recently Deleted ({deletedNotes.length})
            </button>
          )}
        </>
      ) : (
        <>
          <input
            className="note-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
          />

          <div className="notes-controls">
            <Segmented options={SORTS} value={sort} onChange={setSort} />
          </div>

          {allTags.length > 0 && (
            <div className="chips notes-tag-row">
              <button
                className={`chip ${tag === null ? 'accent' : ''}`}
                onClick={() => setTag(null)}
              >
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

          {filtered.length === 0 ? (
            <p className="empty">No notes match.</p>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="section-label">Pinned</div>
                  <div className="list">{pinned.map(row)}</div>
                </>
              )}
              {rest.length > 0 && (
                <>
                  {pinned.length > 0 && <div className="section-label">Notes</div>}
                  <div className="list">{rest.map(row)}</div>
                </>
              )}
            </>
          )}

          {deletedNotes.length > 0 && (
            <button className="notes-trash-link" onClick={() => setTrash(true)}>
              <Trash2 size={15} /> Recently Deleted ({deletedNotes.length})
            </button>
          )}
        </>
      )}
    </div>
  )
}
