import { useMemo } from 'react'
import { ChevronRight } from 'react-feather'
import SectionLabel from './SectionLabel'
import { notesMentioning, noteTitle, noteSnippet } from '../../lib/notes'

// "Mentioned in notes" — the reverse of a note's inline @-mention chip, shown on
// whatever the chip points at (contact, org, group, project, list). Renders
// nothing when there's no backlink to show, so a page can drop it in
// unconditionally.
//
// `notes` must be the privacy-filtered `data.notes`; a note someone else marked
// private must not surface here just because it names you.
export default function NoteBacklinks({ notes, type, id, onOpenNote }) {
  const mentioned = useMemo(() => notesMentioning(notes, type, id), [notes, type, id])
  if (!onOpenNote || mentioned.length === 0) return null
  return (
    <>
      <SectionLabel>Mentioned in notes</SectionLabel>
      <div className="list">
        {mentioned.map((n) => (
          <div className="list-row" key={n.id} role="button" onClick={() => onOpenNote(n.id)}>
            <div className="row-body">
              <div className="row-title">{noteTitle(n)}</div>
              {noteSnippet(n) && <div className="row-sub">{noteSnippet(n, 60)}</div>}
            </div>
            <ChevronRight size={18} className="row-chevron" />
          </div>
        ))}
      </div>
    </>
  )
}
