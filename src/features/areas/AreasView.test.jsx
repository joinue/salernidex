import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AreasView from './AreasView'
import { ConfirmContext } from '../../hooks/useConfirm'

// Areas is the one page that carries a create button and has NO bottom bar
// (nav.js BARLESS_ROUTES), so the phone rules every other page relies on don't
// apply to it. Both regressions this file guards were invisible on a desktop
// window and total on a phone: no way to make an area, no way to open one.

const area = (over = {}) => ({
  id: 'a-work',
  name: 'Work',
  color: '#4b8',
  icon: null,
  shared: false,
  archived_at: null,
  created_by: 'u-1',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

// A phone: the width query matches, the pointer queries don't (no hover, no
// fine pointer), which is exactly what the hover cluster checks before it
// shows itself. So a touch user really does only have the row and the swipe.
const asPhone = () => {
  window.matchMedia = (query) => ({
    matches: query.includes('max-width: 720px'),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}

const setup = (areas = [area()], { tasks = [] } = {}) => {
  const onAdd = vi.fn()
  const onEdit = vi.fn()
  const confirm = vi.fn().mockResolvedValue(true)
  const data = {
    areas,
    tasks,
    lists: [],
    notes: [],
    habits: [],
    userId: 'u-1',
    reorderAreas: vi.fn(),
    archiveArea: vi.fn(),
    unarchiveArea: vi.fn(),
    deleteArea: vi.fn(),
    mergeAreas: vi.fn(),
    moveAreaItems: vi.fn(),
  }
  render(
    <ConfirmContext.Provider value={confirm}>
      <AreasView data={data} onAdd={onAdd} onEdit={onEdit} />
    </ConfirmContext.Provider>,
  )
  return { onAdd, onEdit, data, confirm }
}

describe('AreasView', () => {
  beforeEach(asPhone)

  it('offers a create on a phone, where there is no bar to offer one', async () => {
    const { onAdd } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'New area' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('opens the editor when a row is tapped', async () => {
    const { onEdit } = setup()
    await userEvent.click(screen.getByText('Work'))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-work' }))
  })

  it('still offers a create from the empty state', async () => {
    const { onAdd } = setup([])
    // Two now: the header's, and the empty state's own — the header no longer
    // stands down on a phone, and an empty page saying "make one" while the
    // button to do it sits above is the ordinary iOS arrangement.
    const buttons = screen.getAllByRole('button', { name: /New area/ })
    expect(buttons).toHaveLength(2)
    await userEvent.click(buttons[1])
    expect(onAdd).toHaveBeenCalled()
  })
})

// An archived area keeps its items — they're just invisible under every lens
// but All. The manager says so on the row, which makes it the one place that
// owes you a way out of it.
describe('AreasView — archived areas', () => {
  beforeEach(asPhone)

  const archived = area({ id: 'a-old', name: 'Sabbatical', archived_at: '2026-02-01T00:00:00Z' })

  const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
  }

  it('moves the leftovers into a live area, leaving the archived one standing', async () => {
    const { data } = setup([area(), archived], {
      tasks: [
        { id: 't1', area_id: 'a-old' },
        { id: 't2', area_id: 'a-old' },
      ],
    })
    await open()
    await userEvent.click(screen.getByRole('button', { name: /Move the items in Sabbatical/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Work' }))
    expect(data.moveAreaItems).toHaveBeenCalledWith('a-old', 'a-work')
    // Not a merge — the archived area is not deleted along the way.
    expect(data.mergeAreas).not.toHaveBeenCalled()
  })

  it('says how many are moving and where, before moving them', async () => {
    const { confirm } = setup([area(), archived], { tasks: [{ id: 't1', area_id: 'a-old' }] })
    await open()
    await userEvent.click(screen.getByRole('button', { name: /Move the items in Sabbatical/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Work' }))
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Move 1 item to “Work”?' }),
    )
  })

  it('does nothing on a decline', async () => {
    const { data, confirm } = setup([area(), archived], { tasks: [{ id: 't1', area_id: 'a-old' }] })
    confirm.mockResolvedValue(false)
    await open()
    await userEvent.click(screen.getByRole('button', { name: /Move the items in Sabbatical/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Work' }))
    expect(data.moveAreaItems).not.toHaveBeenCalled()
  })

  it('offers no move on an empty archived area', async () => {
    setup([area(), archived])
    await open()
    expect(screen.queryByRole('button', { name: /Move the items/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unarchive Sabbatical' })).toBeInTheDocument()
  })

  it('offers no move when there is nowhere to move to', async () => {
    setup([archived], { tasks: [{ id: 't1', area_id: 'a-old' }] })
    await open()
    expect(screen.queryByRole('button', { name: /Move the items/ })).not.toBeInTheDocument()
  })
})
