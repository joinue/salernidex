import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodayView from './TodayView'
import { isoDateIn } from '../../lib/tasks'
import { setHousehold } from '../../lib/household'

// Today shows every kind of thing the app holds as a single line, which is the
// whole point of the page — and makes "where does tapping it take me?" the
// question it lives or dies on. A row that answers a tap with nothing reads as
// broken, and a row that answers with the right INDEX ("here are all your
// tasks, go and find it again") is barely better.
//
// So these are about destinations: every row on this page goes to the thing it
// names, carrying its id.

const task = (over = {}) => ({
  id: 't1',
  title: 'Book the MOT',
  assignee: 'anyone',
  priority: 0,
  parent_id: null,
  is_project: false,
  is_heading: false,
  completed_at: null,
  due_date: isoDateIn(0),
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const reminder = (over = {}) => ({
  id: 'r1',
  title: 'Bin day',
  assignee: 'anyone',
  due_date: isoDateIn(1),
  completed_at: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const setup = ({
  tasks = [],
  reminders = [],
  lists = [],
  areas = [],
  area = null,
  taskScope,
} = {}) => {
  const handlers = {
    onOpenTask: vi.fn(),
    onOpenTasks: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenReminders: vi.fn(),
    onOpenList: vi.fn(),
    onOpenPerson: vi.fn(),
    onOpenNote: vi.fn(),
    onOpenHabit: vi.fn(),
    onOpenChange: vi.fn(),
    onOpenActivity: vi.fn(),
  }
  const data = {
    people: [],
    tasks,
    reminders,
    lists,
    listItems: [],
    interactions: [],
    keyDates: [],
    reminderSnoozes: [],
    habits: [],
    habitEntries: [],
    notes: [],
    areas,
    memberId: 'm-1',
    completions: [],
    addInteraction: vi.fn(),
    completeTask: vi.fn(),
    skipTaskOccurrence: vi.fn(),
    snoozeReminder: vi.fn(),
    logHabit: vi.fn(),
    updateTask: vi.fn(),
  }
  render(<TodayView data={data} area={area} taskScope={taskScope} {...handlers} />)
  return { ...handlers, data }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // Recent activity reports the same things ("Added a task · Book the MOT"), so
  // with it open every title on this page exists twice. It's collapsible and
  // remembers the choice, which is exactly the switch these tests need.
  sessionStorage.setItem('today.showRecent', '0')
})

describe('TodayView — a row goes to the thing it names', () => {
  it('takes a task to the Tasks page, naming the task', async () => {
    const { onOpenTask } = setup({ tasks: [task()] })
    await userEvent.click(screen.getByText('Book the MOT'))
    expect(onOpenTask).toHaveBeenCalledWith('t1')
  })

  // A step of a project is only half a thing on its own — its siblings and the
  // order they're in are the context you need — so it goes to the project.
  it('takes a project’s step to the project it belongs to', async () => {
    const { onOpenTask, onOpenProject } = setup({
      tasks: [
        task({ id: 'p1', title: 'Kitchen', is_project: true, due_date: null }),
        task({ id: 't2', title: 'Pick tiles', parent_id: 'p1' }),
      ],
    })
    await userEvent.click(screen.getByText('Pick tiles'))
    expect(onOpenProject).toHaveBeenCalledWith('p1')
    expect(onOpenTask).not.toHaveBeenCalled()
  })

  it('takes a reminder to Reminders, naming the reminder', async () => {
    const { onOpenReminders } = setup({ reminders: [reminder()] })
    await userEvent.click(screen.getByText('Bin day'))
    expect(onOpenReminders).toHaveBeenCalledWith('r1')
  })

  it('takes a task due later in the week the same place as one due now', async () => {
    // A 'by' deadline inside the week lands in Anytime rather than To-do — a
    // different section drawing the same row, which is exactly where a second,
    // subtly different version of it would go unnoticed.
    const { onOpenTask } = setup({
      tasks: [task({ id: 't3', title: 'File the return', due_kind: 'by', due_date: isoDateIn(4) })],
    })
    await userEvent.click(screen.getByText('File the return'))
    expect(onOpenTask).toHaveBeenCalledWith('t3')
  })
})

// Claiming is the one thing on this page that writes to someone ELSE's view of
// the household, so the rule it has to keep is about who is offered what — not
// about the write, which is one existing column. The swipe buttons are
// aria-hidden by design (SwipeRow's hover cluster is the accessible copy), so
// these go through the cluster, which is what a screen reader and a mouse both
// get.
describe('TodayView — claiming an open chore', () => {
  const chore = (over = {}) => task({ title: 'Take the bins out', assignee: 'anyone', ...over })

  it('offers an unclaimed chore to you, and writes your member id', async () => {
    const { data } = setup({ tasks: [chore()] })
    await userEvent.click(screen.getByRole('button', { name: 'Mine Take the bins out' }))
    expect(data.updateTask).toHaveBeenCalledWith('t1', { assignee: 'm-1' })
  })

  // A mis-tap has to be undoable without opening the edit form, or the swipe is
  // a one-way door.
  it('offers a chore of your own back to the household', async () => {
    const { data } = setup({ tasks: [chore({ assignee: 'm-1' })] })
    await userEvent.click(screen.getByRole('button', { name: 'Not mine Take the bins out' }))
    expect(data.updateTask).toHaveBeenCalledWith('t1', { assignee: 'anyone' })
  })

  // Taking work off a housemate is a conversation, not a swipe. Needs the 'all'
  // scope to test at all: on the default 'mine', assignedToMe keeps someone
  // else's chore off this page entirely, which is the first line of the same
  // defence.
  it('offers nothing on a chore that belongs to someone else', () => {
    setup({ tasks: [chore({ assignee: 'm-2' })], taskScope: 'all' })
    expect(screen.queryByRole('button', { name: /Mine Take the bins out/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Later Take the bins out' })).toBeInTheDocument()
  })

  // Same progressive disclosure isSolo() already gives the rest of the sharing
  // UI: with no one to hand a chore to, "Mine" is a control that means nothing.
  it('offers nothing in a solo household', () => {
    setHousehold({
      name: 'Mine',
      members: [{ id: 'm-1', name: 'Me' }],
      current_member_id: 'm-1',
    })
    setup({ tasks: [chore()] })
    expect(screen.queryByRole('button', { name: /Mine Take the bins out/ })).toBeNull()
  })
})

describe('TodayView — the No area section under a lens', () => {
  const area = { id: 'a-work', name: 'Work', shared: false, created_by: 'u-1' }

  // Regression: the section rendered reminders through the TASK row, which reads
  // item.task — a reminder item hasn't got one. One unfiled reminder took the
  // whole page down the moment you picked an area.
  it('draws an unfiled reminder rather than crashing on it', async () => {
    setup({
      areas: [area],
      area: 'a-work',
      tasks: [task({ area_id: 'a-work' })],
      reminders: [reminder()],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByText('Bin day')).toBeInTheDocument()
  })

  it('sends its rows to the same places the filed ones go', async () => {
    const { onOpenTask, onOpenReminders } = setup({
      areas: [area],
      area: 'a-work',
      tasks: [task({ id: 't4', title: 'Chase the plumber' })],
      reminders: [reminder()],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    await userEvent.click(screen.getByText('Chase the plumber'))
    expect(onOpenTask).toHaveBeenCalledWith('t4')
    await userEvent.click(screen.getByText('Bin day'))
    expect(onOpenReminders).toHaveBeenCalledWith('r1')
  })
})
