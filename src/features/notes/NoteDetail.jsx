import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MoreHorizontal, Trash2, Star } from 'react-feather'
import RichTextEditor from '../../components/ui/RichTextEditor'
import TagInput from '../../components/ui/TagInput'
import PrivacyField from '../../components/ui/PrivacyField'
import ActionSheet from '../../components/ui/ActionSheet'
import { useConfirm } from '../../hooks/useConfirm'
import { extractMentions, mentionCandidates, isNoteEmpty } from '../../lib/notes'
import { isEditableTarget } from '../../lib/keys'
import { memberName, isSolo } from '../../lib/household'
import { relativeTime } from '../../lib/contact'

// A single note, full-page (like ListDetail), edited in place with autosave.
// The body is rich text (RichTextEditor); mentions are recomputed from it on
// every save so entity-page backlinks stay in sync. Keyed by note id upstream
// so switching notes remounts with fresh state + a freshly seeded editor.
//
// `embedded` is the two-pane case: the index is already on screen beside this,
// so the "← Notes" button would point at something you can see. Esc goes back
// too, but only when it isn't embedded and you aren't mid-sentence.
export default function NoteDetail({ data, noteId, onBack, onOpenMention, embedded = false }) {
  const { notes, updateNote, deleteNote, discardNote, togglePinNote } = data
  const confirm = useConfirm()
  const note = notes.find((n) => n.id === noteId)

  const [title, setTitle] = useState(note?.title || '')
  const [tags, setTags] = useState(note?.tags || [])
  const [privacy, setPrivacy] = useState(note?.privacy_level || 'shared')
  const [sheet, setSheet] = useState(false)

  // Latest body HTML lives in a ref (the editor owns the DOM; we only persist).
  const bodyRef = useRef(note?.body || '')
  const saveTimer = useRef(null)
  const dirty = useRef(false)
  // Skip the first run of the field-watch effect so merely *opening* a note
  // doesn't bump its updated_at (which would re-sort it to the top untouched).
  const touched = useRef(false)
  // Whether the note was empty when opened — only those get auto-discarded on
  // exit (so the "New note" created on tap doesn't linger if left untouched).
  // An existing note with content is never auto-deleted.
  const wasEmptyOnOpen = useRef(isNoteEmpty(note))
  const titleRef = useRef(null)

  // An empty note is one you just made, so put the caret in it. In two panes
  // especially, "New note" otherwise looks like it did nothing: the pane swaps
  // to a blank note with no sign of where to start typing.
  useEffect(() => {
    if (wasEmptyOnOpen.current) titleRef.current?.focus()
  }, [])

  // Every entity a note can @-mention (people/orgs/groups/projects/lists/tasks).
  // Granular deps on purpose: `data` is a fresh object each render, so depending
  // on it would rebuild the list every time.
  const candidates = useMemo(
    () => mentionCandidates(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.people, data.orgs, data.groups, data.tasks, data.lists],
  )

  // Tag suggestions drawn from the household's other notes.
  const tagSuggestions = useMemo(
    () => [...new Set(notes.flatMap((n) => n.tags || []))].sort(),
    [notes],
  )

  const save = () => {
    if (!note) return
    dirty.current = false
    clearTimeout(saveTimer.current)
    const body = bodyRef.current
    updateNote(note.id, {
      title: title.trim(),
      body,
      tags,
      mentions: extractMentions(body),
      privacy_level: privacy,
    })
  }

  // On exit: discard an untouched empty note (no trash, no toast); otherwise
  // flush a pending edit. Apple Notes-style cleanup of abandoned "New note"s.
  const exit = () => {
    if (!note) return
    if (wasEmptyOnOpen.current && isNoteEmpty({ title, body: bodyRef.current })) {
      discardNote(note.id)
      return
    }
    if (dirty.current) save()
  }

  // The debounce timer and the exit handler both run outside the current render,
  // so they must call the LATEST closures (current title/tags/privacy), not stale
  // ones. Keep refs pointed at them, refreshed after every commit.
  const saveRef = useRef(save)
  const exitRef = useRef(exit)
  useEffect(() => {
    saveRef.current = save
    exitRef.current = exit
  })

  const scheduleSave = () => {
    dirty.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveRef.current(), 600)
  }

  // Run the exit handler on unmount (navigating away, edge-swipe back). Only
  // refs are touched, so the empty dep list is complete.
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current)
      exitRef.current()
    }
  }, [])

  // Esc closes the note — the keyboard counterpart of the back button, so it is
  // only wired up when that button is there. Guarded against text fields: the
  // editor's own Escape dismisses the @-mention picker, and it should keep it.
  useEffect(() => {
    if (embedded) return
    const onKey = (e) => {
      if (e.key !== 'Escape' || isEditableTarget(e.target)) return
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [embedded, onBack])

  // Title / tags / privacy persist on the same debounce; the body fires it too.
  // The first invocation is just the mount, not a real edit — skip it.
  useEffect(() => {
    if (!touched.current) {
      touched.current = true
      return
    }
    if (note) scheduleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, tags, privacy])

  if (!note) {
    return (
      <div className="detail">
        {!embedded && (
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={18} /> Notes
          </button>
        )}
        <p className="empty">Note not found.</p>
      </div>
    )
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this note?',
      message: 'This removes the note from your notebook. You can undo right after.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) {
      clearTimeout(saveTimer.current) // don't resurrect it on unmount
      onBack()
      deleteNote(note.id)
    }
  }

  // Rendered in one of two slots: on its own line under the back button, or —
  // when there is no back button because the index is right there — sharing the
  // top row with the pin/⋯ cluster, which would otherwise float alone above it.
  const titleInput = (
    <input
      ref={titleRef}
      className="note-title-input"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      placeholder="Title"
      aria-label="Note title"
    />
  )

  return (
    <div className={`detail note-detail ${embedded ? 'embedded' : ''}`}>
      <div className="note-detail-bar">
        {!embedded && (
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={18} /> Notes
          </button>
        )}
        {embedded && titleInput}
        <div className="head-actions">
          <button
            className={`icon-btn ${note.pinned ? 'accent' : ''}`}
            onClick={() => togglePinNote(note.id)}
            aria-label={note.pinned ? 'Unpin' : 'Pin'}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <Star size={18} fill={note.pinned ? 'currentColor' : 'none'} />
          </button>
          <button className="icon-btn" onClick={() => setSheet(true)} aria-label="More">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {!embedded && titleInput}

      {note.updated_at && (
        <div className="note-edited">
          Edited {relativeTime(note.updated_at)}
          {!isSolo() && memberName(note.updated_by) ? ` · by ${memberName(note.updated_by)}` : ''}
        </div>
      )}

      <RichTextEditor
        // Remount per note (fresh DOM + seed) — keyed by the row id.
        key={note.id}
        initialHtml={note.body}
        candidates={candidates}
        // Tapping a chip leaves the note; unmount flushes any pending save.
        onOpenMention={onOpenMention}
        onChange={(html) => {
          bodyRef.current = html
          scheduleSave()
        }}
      />

      <div className="note-meta">
        <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
        <PrivacyField value={privacy} onChange={setPrivacy} />
      </div>

      {sheet && (
        <ActionSheet
          title="Note"
          onClose={() => setSheet(false)}
          actions={[
            {
              label: note.pinned ? 'Unpin' : 'Pin to top',
              icon: Star,
              onClick: () => togglePinNote(note.id),
            },
            { label: 'Delete note', icon: Trash2, danger: true, onClick: remove },
          ]}
        />
      )}
    </div>
  )
}
