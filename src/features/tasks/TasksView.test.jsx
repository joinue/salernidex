import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TasksView from './TasksView'
import { ConfirmContext } from '../../hooks/useConfirm'
import { isoDateIn } from '../../lib/tasks'

// TasksView owns real decisions, not just markup: which bucket a task lands in,
// that timed work leads the day, that rows are operable from a keyboard, and
// that a cascade delete says so first.

function seedHousehold() {
  localStorage.setItem(
    'salernidex-household',
    JSON.stringify({
      name: 'Test',
      join_code: 'ABC-DEF',
      current_member_id: 'm-1',
      members: [
        { id: 'm-1', name: 'Marc' },
        { id: 'm-2', name: 'Rita' },
      ],
    }),
  )
}

const task = (over = {}) => ({
  id: 't',
  title: 'A task',
  assignee: 'anyone',
  priority: 0,
  parent_id: null,
  is_project: false,
  is_heading: false,
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

// `confirm` resolves to whatever the test wants the user to have chosen.
const setup = (tasks, { confirmAnswer = true, ...over } = {}) => {
  const deleteTask = vi.fn()
  const confirm = vi.fn().mockResolvedValue(confirmAnswer)
  const data = {
    tasks,
    completions: [],
    memberId: 'm-1',
    addTask: vi.fn(),
    deleteTask,
    completeTask: vi.fn(),
    skipTaskOccurrence: vi.fn(),
    reorderTasks: vi.fn(),
    ...over,
  }
  render(
    <ConfirmContext.Provider value={confirm}>
      <TasksView data={data} onAdd={vi.fn()} onEdit={vi.fn()} />
    </ConfirmContext.Provider>,
  )
  return { deleteTask, confirm, data }
}

const sectionTitles = () =>
  [...document.querySelectorAll('h2')].map((e) => e.textContent.trim().toLowerCase())

beforeEach(() => {
  localStorage.clear()
  seedHousehold()
  sessionStorage.clear()
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })
})

describe('TasksView — bucketing', () => {
  it('files each task under the section its dates put it in', () => {
    setup([
      task({ id: 'a', title: 'Late thing', due_date: isoDateIn(-2) }),
      task({ id: 'b', title: 'Today thing', due_date: isoDateIn(0) }),
      task({ id: 'c', title: 'Soon thing', due_date: isoDateIn(3) }),
      task({ id: 'd', title: 'Whenever thing', due_date: null }),
    ])
    expect(sectionTitles()).toEqual(['overdue', 'today', 'upcoming', 'someday'])
  })

  it('parks a deferred task under Upcoming even when it is already due', () => {
    setup([task({ id: 'a', title: 'Not yet', due_date: isoDateIn(0), start_date: isoDateIn(5) })])
    expect(sectionTitles()).toEqual(['upcoming'])
  })

  it('leads Today with clock-anchored work, before the untimed list', () => {
    setup([
      task({ id: 'a', title: 'Untimed', due_date: isoDateIn(0) }),
      task({ id: 'b', title: 'Nine AM', due_date: isoDateIn(0), due_time: '09:00' }),
    ])
    const titles = [...document.querySelectorAll('.row-title')].map((e) => e.textContent)
    expect(titles).toEqual(['Nine AM', 'Untimed'])
  })

  it('keeps projects out — they have their own index', () => {
    setup([task({ id: 'p', title: 'Italy trip', is_project: true, due_date: isoDateIn(0) })])
    expect(screen.queryByText('Italy trip')).not.toBeInTheDocument()
  })
})

describe('TasksView — rows are operable without a pointer', () => {
  it('exposes each task row as a focusable button that expands on Enter', async () => {
    setup([task({ id: 'a', title: 'Call the plumber', due_date: isoDateIn(0) })])
    const row = screen.getByRole('button', { name: /Call the plumber, expand details/ })
    expect(row).toHaveAttribute('tabindex', '0')
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByPlaceholderText('Add a subtask…')).toBeInTheDocument()
  })

  it('Space works too, and collapses again', async () => {
    setup([task({ id: 'a', title: 'Call the plumber', due_date: isoDateIn(0) })])
    const row = screen.getByRole('button', { name: /expand details/ })
    row.focus()
    await userEvent.keyboard(' ')
    expect(screen.getByPlaceholderText('Add a subtask…')).toBeInTheDocument()
    screen.getByRole('button', { name: /collapse details/ }).focus()
    await userEvent.keyboard(' ')
    expect(screen.queryByPlaceholderText('Add a subtask…')).not.toBeInTheDocument()
  })

  it('the check circle still toggles without expanding the row', async () => {
    const { data } = setup([task({ id: 'a', title: 'Bins', due_date: isoDateIn(0) })])
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(data.completeTask).toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Add a subtask…')).not.toBeInTheDocument()
  })
})

describe('TasksView — deleting states the consequence', () => {
  const withSubtasks = [
    task({ id: 'a', title: 'Move house', due_date: isoDateIn(0) }),
    task({ id: 's1', title: 'Book van', parent_id: 'a' }),
    task({ id: 's2', title: 'Pack kitchen', parent_id: 'a' }),
  ]

  const openAndDelete = async () => {
    await userEvent.click(screen.getByRole('button', { name: /expand details/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  }

  it('asks first when subtasks would go too, naming how many', async () => {
    const { confirm, deleteTask } = setup(withSubtasks)
    await openAndDelete()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('2 subtasks go too') }),
    )
    expect(deleteTask).toHaveBeenCalledWith('a')
  })

  it('does not delete when the confirm is declined', async () => {
    const { deleteTask } = setup(withSubtasks, { confirmAnswer: false })
    await openAndDelete()
    expect(deleteTask).not.toHaveBeenCalled()
  })

  it('a childless task deletes straight away — the undo toast is cover enough', async () => {
    const { confirm, deleteTask } = setup([task({ id: 'a', due_date: isoDateIn(0) })])
    await openAndDelete()
    expect(confirm).not.toHaveBeenCalled()
    expect(deleteTask).toHaveBeenCalledWith('a')
  })
})

describe('TasksView — quick add', () => {
  it('a typed line lands on you, not on nobody', async () => {
    const { data } = setup([])
    await userEvent.type(screen.getByPlaceholderText(/Add a task/), 'water the plants{Enter}')
    expect(data.addTask).toHaveBeenCalledWith(expect.objectContaining({ assignee: 'm-1' }))
  })

  it('inherits the area you are looking at so it does not vanish on add', async () => {
    const { data } = setup([task({ id: 'a', area: 'Work', due_date: isoDateIn(0) })])
    await userEvent.click(screen.getByRole('button', { name: 'Work' }))
    await userEvent.type(screen.getByPlaceholderText(/Add a task/), 'file expenses{Enter}')
    expect(data.addTask).toHaveBeenCalledWith(expect.objectContaining({ area: 'Work' }))
  })

  it('an explicit "for <name>" still beats the default', async () => {
    const { data } = setup([])
    await userEvent.type(screen.getByPlaceholderText(/Add a task/), 'call the vet for Rita{Enter}')
    expect(data.addTask).toHaveBeenCalledWith(expect.objectContaining({ assignee: 'm-2' }))
  })
})

describe('TasksView — the Done logbook', () => {
  it('lists a check-off under the day it happened', async () => {
    const done = task({ id: 'a', title: 'Bins', completed_at: '2026-06-12T15:00:00Z' })
    setup([done], {
      completions: [
        { id: 'c1', task_id: 'a', completed_at: new Date().toISOString(), completed_by: 'm-1' },
      ],
    })
    const toggle = screen.getByRole('button', { name: /Done · 1/ })
    await userEvent.click(toggle)
    expect(within(document.querySelector('.list')).getByText('Bins')).toBeInTheDocument()
  })
})
