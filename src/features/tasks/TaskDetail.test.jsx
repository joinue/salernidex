import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskDetail from './TaskDetail'
import { ConfirmContext } from '../../hooks/useConfirm'
import { isoDateIn } from '../../lib/tasks'

// The focused view earns its place by showing what a row has to abbreviate and
// by being a working surface for the subtasks — so that's what's tested here,
// plus the two ways off the page (back on delete, a missing task).

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
  title: 'Move house',
  assignee: 'anyone',
  priority: 0,
  parent_id: null,
  is_project: false,
  is_heading: false,
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const setup = (tasks, { confirmAnswer = true, taskId = 't', ...over } = {}) => {
  const confirm = vi.fn().mockResolvedValue(confirmAnswer)
  const onBack = vi.fn()
  const onEdit = vi.fn()
  const data = {
    tasks,
    notes: [],
    completions: [],
    memberId: 'm-1',
    addTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    completeTask: vi.fn(),
    skipTaskOccurrence: vi.fn(),
    ...over,
  }
  render(
    <ConfirmContext.Provider value={confirm}>
      <TaskDetail data={data} taskId={taskId} onBack={onBack} onEdit={onEdit} />
    </ConfirmContext.Provider>,
  )
  return { data, confirm, onBack, onEdit }
}

beforeEach(() => {
  localStorage.clear()
  seedHousehold()
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })
})

describe('TaskDetail — nothing is abbreviated', () => {
  // A row spends a budget of four chips and drops the rest into "+N"; here the
  // whole set has to be readable, which is the point of coming to this page.
  it('shows every fact the row had to collapse', () => {
    setup([
      task({
        priority: 3,
        assignee: 'm-2',
        due_date: isoDateIn(2),
        area: 'Home',
        tags: ['errand', 'weekend'],
        recurrence: { freq: 'weekly', interval: 1, weekdays: [1] },
      }),
    ])
    for (const text of ['High', 'Rita', 'Home', 'errand', 'weekend']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument()
  })

  it('prints the notes in full rather than clipping them to a line', () => {
    const notes = 'Ask about the parking permit, and whether the lift is bookable on a Sunday.'
    setup([task({ notes })])
    expect(screen.getByText(notes)).toBeInTheDocument()
  })

  it('reads a deadline as room left, the way the row does', () => {
    setup([task({ due_date: isoDateIn(4), due_kind: 'by' })])
    expect(screen.getByText('4d left')).toBeInTheDocument()
  })
})

describe('TaskDetail — working on the subtasks', () => {
  const withSubs = [
    task(),
    task({ id: 's1', title: 'Book the van', parent_id: 't' }),
    task({ id: 's2', title: 'Pack the kitchen', parent_id: 't', completed_at: '2026-01-02' }),
  ]

  it('lists them with a count of what is done', () => {
    setup(withSubs)
    expect(screen.getByText('Book the van')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('adds one to this task', async () => {
    const { data } = setup(withSubs)
    await userEvent.type(screen.getByPlaceholderText('Add a subtask…'), 'Return the keys{Enter}')
    expect(data.addTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Return the keys', parent_id: 't' }),
    )
  })

  it('asks for the first step when there are none yet', () => {
    setup([task()])
    expect(screen.getByPlaceholderText('Break it into steps…')).toBeInTheDocument()
  })

  it('checks one off', async () => {
    const { data } = setup(withSubs)
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark done' })[0])
    expect(data.completeTask).toHaveBeenCalled()
  })
})

describe('TaskDetail — acting on the task itself', () => {
  it('marks it done, and offers the way back once it is', async () => {
    const { data } = setup([task()])
    await userEvent.click(screen.getByRole('button', { name: /Mark done/ }))
    expect(data.completeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), true)
  })

  it('shows Reopen on a task that is already done', () => {
    setup([task({ completed_at: '2026-01-02T00:00:00Z' })])
    expect(screen.getByRole('button', { name: /Reopen/ })).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('carries the one-tap on/by flip the list offers', async () => {
    const { data } = setup([task({ due_date: isoDateIn(9) })])
    await userEvent.click(screen.getByRole('button', { name: /Move to Anytime/ }))
    expect(data.updateTask).toHaveBeenCalledWith('t', { due_kind: 'by' })
  })

  it('hides the flip when it would have no visible effect', () => {
    setup([task({ due_date: isoDateIn(0) })])
    expect(screen.queryByRole('button', { name: /Move to/ })).not.toBeInTheDocument()
  })

  it('only offers Skip on something that repeats', () => {
    setup([task()])
    expect(screen.queryByRole('button', { name: /Skip this one/ })).not.toBeInTheDocument()
  })
})

describe('TaskDetail — deleting leaves the page', () => {
  const withSubs = [
    task(),
    task({ id: 's1', title: 'Book the van', parent_id: 't' }),
    task({ id: 's2', title: 'Pack the kitchen', parent_id: 't' }),
  ]

  it('names how many subtasks go too, then deletes and goes back', async () => {
    const { confirm, data, onBack } = setup(withSubs)
    await userEvent.click(screen.getByRole('button', { name: /Delete task/ }))
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('2 subtasks go too') }),
    )
    expect(data.deleteTask).toHaveBeenCalledWith('t')
    expect(onBack).toHaveBeenCalled()
  })

  it('stays put when the confirm is declined', async () => {
    const { data, onBack } = setup(withSubs, { confirmAnswer: false })
    await userEvent.click(screen.getByRole('button', { name: /Delete task/ }))
    expect(data.deleteTask).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
  })

  it('a childless task goes without a prompt — the undo toast covers it', async () => {
    const { confirm, data } = setup([task()])
    await userEvent.click(screen.getByRole('button', { name: /Delete task/ }))
    expect(confirm).not.toHaveBeenCalled()
    expect(data.deleteTask).toHaveBeenCalledWith('t')
  })
})

describe('TaskDetail — a task that is not there', () => {
  // Reachable: a bookmark, or the row deleted from another device.
  it('says so instead of rendering a blank page', () => {
    setup([task()], { taskId: 'gone' })
    expect(screen.getByText('This task no longer exists.')).toBeInTheDocument()
  })
})
