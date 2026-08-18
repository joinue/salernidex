import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    // Relationships holds no bar slot anywhere — the drawer is the whole reason
    // taking its slot away was safe.
    for (const label of ['Relationships', 'Notes', 'Habits', 'Projects']) {
      expect(within(drawer).getByText(label)).toBeInTheDocument()
    }
    // …and account business is NOT here any more: it's behind the avatar, out of
    // the thumb's way. Logout sitting one row above Close was the problem.
    for (const label of ['Settings', 'Import / Export', 'Logout']) {
      expect(within(drawer).queryByText(label)).toBeNull()
    }
    await user.click(within(drawer).getByText('Notes'))
    expect(a.go).toHaveBeenCalledWith('notes')
  })

  // The pill can't be held still while a sheet is open: the sheet takes a scroll
  // lock, the lock freezes the document, and the browser answers a page that can
  // no longer scroll by revising what the bottom of the viewport means — Safari
  // brings its toolbar back and flips env(safe-area-inset-bottom). So it isn't
  // painted for the duration, which costs nothing behind a backdrop. The drawer
  // is the case that made it visible; it only covers 310px and leaves the pill
  // in plain sight.
  it('withholds the bar while a sheet is over it, and gives it back after', async () => {
    const user = userEvent.setup()
    setup('tasks')
    const nav = bar()
    // It starts withheld too — the launch half of the same flag — so wait for
    // the window to settle before asserting the overlay moved it.
    await waitFor(() => expect(nav).not.toHaveClass('withheld'))

    await user.click(within(nav).getByLabelText('All destinations'))
    const drawer = await screen.findByRole('dialog', { name: 'Go to' })
    expect(nav).toHaveClass('withheld')
    // Not `tucked`. That slides the bar off the bottom edge, which is motion,
    // and motion is the entire complaint.
    expect(nav).not.toHaveClass('tucked')
    // An invisible bar behind a backdrop must leave the focus order with it.
    expect(nav).toHaveAttribute('inert')

    await user.click(within(drawer).getByText('Close menu'))
    await waitFor(() => expect(nav).not.toHaveClass('withheld'))
    expect(nav).not.toHaveAttribute('inert')
  })

  it('sends the red attention count to Today and nowhere else', () => {
    setup('tasks', { badge: 4 })
    expect(within(bar()).getByLabelText('4 needing attention')).toBeInTheDocument()
  })
})
