import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BoardView from './BoardView'
import { isoDateIn } from '../../lib/tasks'
import { setHousehold } from '../../lib/household'

// The board renders above the shell, so nothing else in the app's test suite
// would notice it breaking. What these pin is the thing a kitchen display lives
// or dies on: does the house's stuff actually reach the screen.
//
// The three cards below (Reminders, On someone, a non-grocery list) each exist
// because they DIDN'T reach it — reminders were split out of data.tasks and
// never re-read, lists were filtered to kind 'grocery', and undated work was
// dropped by the date rule. lib/board.test.js pins the filters; these pin the
// wiring from `data` to the DOM.

const base = {
  people: [],
  tasks: [],
  reminders: [],
  lists: [],
  listItems: [],
  keyDates: [],
  habits: [],
  sharedHabits: [],
  habitEntries: [],
}

const setup = (over = {}) => {
  const onExit = vi.fn()
  render(<BoardView data={{ ...base, ...over }} onExit={onExit} />)
  return { onExit }
}

beforeEach(() => {
  setHousehold({
    name: 'Ours',
    members: [
      { id: 'm-1', name: 'Me' },
      { id: 'm-2', name: 'Ana' },
    ],
    current_member_id: 'm-1',
  })
})

describe('BoardView', () => {
  it('says so warmly when there is nothing on', () => {
    setup()
    expect(screen.getByText(/Nothing on the board/i)).toBeTruthy()
  })

  it('shows a task due today with who it belongs to', () => {
    setup({
      tasks: [{ id: 't1', title: 'Bins out', assignee: 'm-2', due_date: isoDateIn(0) }],
    })
    expect(screen.getByText('Bins out')).toBeTruthy()
    // Household scope: another member's task reaches the board, and it says
    // whose. Avatar is aria-hidden and initial-only, so the initial IS the
    // whole signal — worth pinning, because losing it is invisible.
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('shows a reminder due today, worded as a when rather than a lateness', () => {
    setup({
      reminders: [{ id: 'r1', title: 'Bin day', is_reminder: true, due_date: isoDateIn(-2) }],
    })
    expect(screen.getByRole('heading', { name: 'Reminders' })).toBeTruthy()
    expect(screen.getByText('Bin day')).toBeTruthy()
    expect(screen.getByText('2d ago')).toBeTruthy()
    // "overdue" is a claim about work, and a reminder has none to do.
    expect(screen.queryByText(/overdue/i)).toBeNull()
  })

  it('shows undated work that has a name against it', () => {
    setup({
      tasks: [
        { id: 't1', title: 'Fix the gate', assignee: 'm-2', due_date: null },
        { id: 't2', title: 'Sort the loft', assignee: 'anyone', due_date: null },
      ],
    })
    expect(screen.getByRole('heading', { name: /On someone/ })).toBeTruthy()
    expect(screen.getByText('Fix the gate')).toBeTruthy()
    // Unassigned undated work would be an unbounded backlog on a wall.
    expect(screen.queryByText('Sort the loft')).toBeNull()
  })

  it('shows a standard list, not only groceries', () => {
    setup({
      lists: [
        { id: 'l1', kind: 'standard', name: 'Hardware store' },
        { id: 'l2', kind: 'grocery', name: 'Groceries' },
      ],
      listItems: [
        { id: 'i1', list_id: 'l1', text: 'Hinges' },
        { id: 'i2', list_id: 'l2', text: 'Milk' },
      ],
    })
    expect(screen.getByRole('heading', { name: /Hardware store/ })).toBeTruthy()
    expect(screen.getByText('Hinges')).toBeTruthy()
    expect(screen.getByText('Milk')).toBeTruthy()
  })

  it('keeps private rows off a screen the whole room can read', () => {
    setup({
      tasks: [
        { id: 't1', title: 'Public chore', assignee: 'm-2', due_date: isoDateIn(0) },
        {
          id: 't2',
          title: 'Secret chore',
          assignee: 'm-2',
          due_date: isoDateIn(0),
          privacy_level: 'private',
        },
      ],
      reminders: [
        {
          id: 'r1',
          title: 'Secret reminder',
          is_reminder: true,
          due_date: isoDateIn(0),
          privacy_level: 'private',
        },
      ],
    })
    expect(screen.getByText('Public chore')).toBeTruthy()
    expect(screen.queryByText('Secret chore')).toBeNull()
    expect(screen.queryByText('Secret reminder')).toBeNull()
  })

  it('leaves by the corner button', async () => {
    const { onExit } = setup()
    await userEvent.click(screen.getByLabelText('Leave board'))
    expect(onExit).toHaveBeenCalled()
  })
})
