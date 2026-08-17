import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileNav from './MobileNav'

// lib/nav.test.js covers the table; this covers what the bar does with it.
const adds = () => ({
  go: vi.fn(),
  onAddPerson: vi.fn(),
  onAddTask: vi.fn(),
  onAddProject: vi.fn(),
  onAddReminder: vi.fn(),
  onAddNote: vi.fn(),
  onAddList: vi.fn(),
  onAddHabit: vi.fn(),
  onAddOrg: vi.fn(),
  onAddGroup: vi.fn(),
  onAddRelationship: vi.fn(),
})

const setup = (route, extra = {}) => {
  const a = adds()
  render(<MobileNav route={route} active={route} adds={a} onLogout={vi.fn()} {...extra} />)
  return a
}

const bar = () => screen.getByRole('navigation', { name: 'Page navigation' })

describe('MobileNav', () => {
  it('is five slots wide with the create in the middle', () => {
    setup('tasks')
    const slots = within(bar()).getAllByRole('button')
    expect(slots).toHaveLength(5)
    expect(slots[2]).toHaveAccessibleName('Add')
  })

  it('opens with Today and closes with the menu, on every page it renders', () => {
    setup('lists')
    const slots = within(bar()).getAllByRole('button')
    expect(slots[0]).toHaveAccessibleName(/today/i)
    expect(slots[4]).toHaveAccessibleName('All destinations')
  })

  it('renders nothing at all on a page that opts out of the bar', () => {
    setup('project')
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  // The one honest "you are here" a contextual bar can make.
  it('marks Today as the current page only when you are on it', () => {
    setup('today')
    expect(within(bar()).getAllByRole('button')[0]).toHaveAttribute('aria-current', 'page')
  })

  it('does not claim you are anywhere when you are not on Today', () => {
    setup('notes')
    for (const b of within(bar()).getAllByRole('button')) {
      expect(b).not.toHaveAttribute('aria-current')
    }
  })

  it('creates the obvious thing for this page', async () => {
    const user = userEvent.setup()
    const a = setup('reminders')
    await user.click(within(bar()).getByLabelText('Add'))
    expect(a.onAddReminder).toHaveBeenCalledTimes(1)
    expect(a.onAddTask).not.toHaveBeenCalled()
  })

  // Today is the household at a glance — there's no single thing ＋ should make,
  // so it offers all of them rather than guessing.
  it('offers the full add menu on Today, where no one create is obvious', async () => {
    const user = userEvent.setup()
    setup('today')
    await user.click(within(bar()).getByLabelText('Add something'))
    expect(await screen.findByRole('dialog', { name: 'Add' })).toBeInTheDocument()
  })

  it('reaches every destination through the menu, including the ones with no slot', async () => {
    const user = userEvent.setup()
    const a = setup('tasks')
    await user.click(within(bar()).getByLabelText('All destinations'))
    const drawer = await screen.findByRole('dialog', { name: 'Go to' })
    // Relationships and Import / Export hold no bar slot anywhere — the drawer
    // is the whole reason taking their slots away was safe.
    for (const label of ['Relationships', 'Import / Export', 'Settings', 'Notes']) {
      expect(within(drawer).getByText(label)).toBeInTheDocument()
    }
    await user.click(within(drawer).getByText('Notes'))
    expect(a.go).toHaveBeenCalledWith('notes')
  })

  it('sends the red attention count to Today and nowhere else', () => {
    setup('tasks', { badge: 4 })
    expect(within(bar()).getByLabelText('4 needing attention')).toBeInTheDocument()
  })
})
