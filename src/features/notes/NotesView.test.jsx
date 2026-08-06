import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotesView from './NotesView'
import { ConfirmContext } from '../../hooks/useConfirm'

// NotesView decides how much of the notebook fits on screen: two panes when
// there's room, push navigation when there isn't. That branch, and the keyboard
// cursor that only makes sense next to it, are what these cover.

const SPLIT_QUERY = '(min-width: 900px)'

const note = (over = {}) => ({
  id: 'n1',
  title: 'First',
  body: '<div>Body text</div>',
  tags: [],
  pinned: false,
  mentions: [],
  privacy_level: 'shared',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  ...over,
})

const NOTES = [
  note({ id: 'n1', title: 'First', updated_at: '2026-01-09T00:00:00Z' }),
  note({ id: 'n2', title: 'Second', updated_at: '2026-01-08T00:00:00Z' }),
]

const setup = ({ wide = false, noteId = null, notes = NOTES } = {}) => {
  window.matchMedia = (q) => ({
    matches: q === SPLIT_QUERY ? wide : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })
  const onOpenNote = vi.fn()
  const onAdd = vi.fn()
  const onSort = vi.fn()
  const data = {
    notes,
    deletedNotes: [],
    people: [],
    orgs: [],
    groups: [],
    tasks: [],
    lists: [],
    deleteNote: vi.fn(),
    togglePinNote: vi.fn(),
    restoreNote: vi.fn(),
    purgeNote: vi.fn(),
    updateNote: vi.fn(),
    discardNote: vi.fn(),
  }
  render(
    <ConfirmContext.Provider value={vi.fn().mockResolvedValue(true)}>
      <NotesView
        data={data}
        noteId={noteId}
        onOpenNote={onOpenNote}
        onAdd={onAdd}
        onOpenMention={vi.fn()}
        onSort={onSort}
        onCloseNote={vi.fn()}
      />
    </ConfirmContext.Provider>,
  )
  return { onOpenNote, onAdd, onSort, data }
}

beforeEach(() => {
  localStorage.clear()
  // The rich text editor drives contentEditable through execCommand, which
  // jsdom doesn't implement; scrollIntoView is missing for the same reason.
  document.execCommand = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('NotesView — how much of the notebook fits', () => {
  it('keeps the index beside the open note on a wide screen', () => {
    setup({ wide: true, noteId: 'n1' })
    // The note is open...
    expect(screen.getByLabelText('Note title')).toHaveValue('First')
    // ...and the rest of the notebook is still there to switch to.
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('lets the open note take the whole screen when there is no room for two', () => {
    setup({ wide: false, noteId: 'n1' })
    expect(screen.getByLabelText('Note title')).toHaveValue('First')
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
  })

  it('offers the index alone until a note is picked', () => {
    setup({ wide: true })
    expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})

describe('NotesView — keyboard', () => {
  it('walks the list with the arrow keys and opens on Enter', async () => {
    const user = userEvent.setup()
    const { onOpenNote } = setup({ wide: true })
    // Two down from nothing lands on the second row (most-recently-edited first).
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onOpenNote).toHaveBeenCalledWith('n2')
  })

  it('leaves the arrow keys alone while you are typing in the search box', async () => {
    const user = userEvent.setup()
    const { onOpenNote } = setup({ wide: true })
    await user.click(screen.getByLabelText('Search notes'))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onOpenNote).not.toHaveBeenCalled()
  })

  it('takes real focus with it, so the selection is not a sighted-only cue', async () => {
    const user = userEvent.setup()
    setup({ wide: true })
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toHaveAttribute('data-note-idx', '0')
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toHaveAttribute('data-note-idx', '1')
  })

  it('keeps exactly one row in the tab order', () => {
    setup({ wide: true })
    const tabbable = [...document.querySelectorAll('[data-note-idx]')].filter(
      (el) => el.tabIndex === 0,
    )
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]).toHaveAttribute('data-note-idx', '0')
  })

  it('marks the open note as current for anyone who cannot see the highlight', () => {
    setup({ wide: true, noteId: 'n2' })
    const current = document.querySelectorAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Second')
  })
})

describe('NotesView — new notes and preferences', () => {
  it('carries the active tag onto a new note so it survives your own filter', async () => {
    const user = userEvent.setup()
    const { onAdd } = setup({
      wide: true,
      notes: [note({ id: 'n1', tags: ['travel'] }), note({ id: 'n2', title: 'Second' })],
    })
    await user.click(screen.getByRole('button', { name: 'travel' }))
    await user.click(screen.getAllByRole('button', { name: 'New note' })[0])
    expect(onAdd).toHaveBeenCalledWith({ tags: ['travel'] })
  })

  it('creates a plain note when nothing is filtered', async () => {
    const user = userEvent.setup()
    const { onAdd } = setup({ wide: true })
    await user.click(screen.getAllByRole('button', { name: 'New note' })[0])
    expect(onAdd).toHaveBeenCalledWith({})
  })

  it('hands the sort up to be persisted rather than keeping it locally', async () => {
    const user = userEvent.setup()
    const { onSort } = setup({ wide: true })
    await user.click(screen.getByRole('tab', { name: 'Title' }))
    expect(onSort).toHaveBeenCalledWith('title')
  })

  it('groups pinned notes in the gallery, not just the list', async () => {
    const user = userEvent.setup()
    setup({
      wide: true,
      notes: [
        note({ id: 'n1', title: 'Stuck', pinned: true }),
        note({ id: 'n2', title: 'Second' }),
      ],
    })
    await user.click(screen.getByLabelText('Gallery view'))
    expect(screen.getByRole('group', { name: 'Pinned' })).toHaveTextContent('Stuck')
    expect(screen.getByRole('group', { name: 'Notes' })).toHaveTextContent('Second')
  })
})
