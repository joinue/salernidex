import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NoteDetail from './NoteDetail'
import { ConfirmContext } from '../../hooks/useConfirm'

// The auto-discard on exit is the dangerous piece of this screen: it deletes a
// note without asking. These pin down when it may fire.

const empty = {
  id: 'n1',
  title: '',
  body: '',
  tags: [],
  pinned: false,
  mentions: [],
  privacy_level: 'shared',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// Leaving is settled a tick after teardown, so a teardown that is immediately
// followed by a setup (StrictMode's dev remount) doesn't count as leaving.
const tick = () => new Promise((r) => setTimeout(r, 0))

const setup = ({ notes = [empty], noteId = 'n1' } = {}) => {
  const data = {
    notes,
    people: [],
    orgs: [],
    groups: [],
    tasks: [],
    lists: [],
    habits: [],
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    discardNote: vi.fn(),
    togglePinNote: vi.fn(),
  }
  const view = render(
    <StrictMode>
      <ConfirmContext.Provider value={vi.fn().mockResolvedValue(true)}>
        <NoteDetail data={data} noteId={noteId} onBack={vi.fn()} onOpenMention={vi.fn()} />
      </ConfirmContext.Provider>
    </StrictMode>,
  )
  return { data, view }
}

beforeEach(() => {
  document.execCommand = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })
})

describe('NoteDetail', () => {
  it('keeps a brand-new empty note on screen instead of discarding it on arrival', () => {
    const { data } = setup()
    expect(data.discardNote).not.toHaveBeenCalled()
    expect(screen.queryByText('Note not found.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Note title')).toBeInTheDocument()
  })

  it('carries Return from the title into the body', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByLabelText('Note title'))
    await user.keyboard('Packing{Enter}')
    expect(document.activeElement).toBe(screen.getByLabelText('Note body'))
    // …and the title kept the text rather than submitting anything.
    expect(screen.getByLabelText('Note title')).toHaveValue('Packing')
  })

  it('discards the untouched empty note when you actually leave it', async () => {
    const { data, view } = setup()
    view.unmount()
    await tick()
    expect(data.discardNote).toHaveBeenCalledWith('n1')
  })

  it('leaves a note with content alone on the way out', async () => {
    const { data, view } = setup({ notes: [{ ...empty, title: 'Groceries' }] })
    view.unmount()
    await tick()
    expect(data.discardNote).not.toHaveBeenCalled()
  })
})
