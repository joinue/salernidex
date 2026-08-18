import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TasksView from './TasksView'
import { ConfirmContext } from '../../hooks/useConfirm'
import { isoDateIn } from '../../lib/tasks'
import { ALL_AREAS } from '../../lib/areas'

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
const area = (over = {}) => ({
  id: 'a-work',
  name: 'Work',
  shared: false,
  created_by: 'u-1',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const setup = (
  tasks,
  { confirmAnswer = true, areas = [], activeArea = ALL_AREAS, ...over } = {},
) => {
  const deleteTask = vi.fn()
  const onOpenTask = vi.fn()
  const confirm = vi.fn().mockResolvedValue(confirmAnswer)
  const data = {
    tasks,
    areas,
    // The auth user, not the member id — visibleAreas tests created_by, which
    // defaults to auth.uid(). Passing a member id here would hide every area.
    userId: 'u-1',
    completions: [],
    memberId: 'm-1',
    addTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask,
    completeTask: vi.fn(),
    skipTaskOccurrence: vi.fn(),
    reorderTasks: vi.fn(),
    ...over,
  }
  // The lens is a controlled prop now — App owns it so the page and (in phase 2)
  // the shell switcher can't disagree about which area is active. Hold it here,
  // or clicking a pill would render as a no-op.
  function Harness() {
    // The lens is read-only here: the control that sets it lives in the shell
    // (AreaSwitcher), so a test of this page starts already scoped rather than
    // clicking a pill the page no longer owns.
    const [active] = useState(activeArea)
    return (
      <TasksView
        data={data}
        area={active}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onOpenTask={onOpenTask}
      />
    )
  }
  render(
    <ConfirmContext.Provider value={confirm}>
      <Harness />
    </ConfirmContext.Provider>,
  )
  return { deleteTask, confirm, data, onOpenTask }
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

  it('files a "by" deadline under Anytime, above Upcoming', () => {
    setup([
      task({ id: 'a', title: 'Pinned thing', due_date: isoDateIn(3) }),
      task({ id: 'b', title: 'Deadline thing', due_date: isoDateIn(3), due_kind: 'by' }),
    ])
    expect(sectionTitles()).toEqual(['anytime', 'upcoming'])
  })

  it('orders Anytime by least slack first', () => {
    setup([
      task({ id: 'a', title: 'Loose', due_date: isoDateIn(12), due_kind: 'by' }),
      task({ id: 'b', title: 'Tight', due_date: isoDateIn(2), due_kind: 'by' }),
    ])
    const titles = [...document.querySelectorAll('.row-title')].map((e) => e.textContent)
    expect(titles).toEqual(['Tight', 'Loose'])
  })

  it('shows the room left rather than the date, so it reads as slack', () => {
    setup([task({ id: 'a', title: 'Gutters', due_date: isoDateIn(4), due_kind: 'by' })])
    expect(screen.getByText('4d left')).toBeInTheDocument()
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

describe('TasksView — retrofitting an existing task', () => {
  const expand = async (title) =>
    userEvent.click(screen.getByRole('button', { name: new RegExp(`${title}, expand details`) }))

  it('offers a one-tap move for a dated task sitting in Upcoming', async () => {
    const { data } = setup([task({ id: 'a', title: 'Gutters', due_date: isoDateIn(9) })])
    await expand('Gutters')
    await userEvent.click(screen.getByRole('button', { name: 'Move to Anytime' }))
    expect(data.updateTask).toHaveBeenCalledWith('a', { due_kind: 'by' })
  })

  it('offers the way back out from Anytime', async () => {
    const { data } = setup([
      task({ id: 'a', title: 'Gutters', due_date: isoDateIn(9), due_kind: 'by' }),
    ])
    await expand('Gutters')
    await userEvent.click(screen.getByRole('button', { name: 'Move to Upcoming' }))
    expect(data.updateTask).toHaveBeenCalledWith('a', { due_kind: 'on' })
  })

  // Due today, deferred, and undated: the on/by choice has no visible effect on
  // any of them, so the shortcut would be lying about what it does.
  it.each([
    ['already due', { due_date: isoDateIn(0) }],
    ['still deferred', { due_date: isoDateIn(9), start_date: isoDateIn(4) }],
    ['undated', { due_date: null }],
  ])('stays hidden when the task is %s', async (_label, over) => {
    setup([task({ id: 'a', title: 'Gutters', ...over })])
    await expand('Gutters')
    expect(screen.queryByRole('button', { name: /^Move to/ })).not.toBeInTheDocument()
  })
})

describe('TasksView — the recurring rota folds away', () => {
  const chore = (id, title, days) =>
    task({
      id,
      title,
      due_date: isoDateIn(days),
      recurrence: { freq: 'weekly', interval: 1, weekdays: [1] },
    })
  const rota = [
    task({ id: 'a', title: 'Book the vet', due_date: isoDateIn(4) }),
    chore('r1', 'Bins out', 2),
    chore('r2', 'Water bill', 3),
    chore('r3', 'Smoke alarms', 5),
  ]

  it('keeps the one-offs visible and hides the chores behind a count', () => {
    setup(rota)
    expect(screen.getByText('Book the vet')).toBeInTheDocument()
    expect(screen.queryByText('Bins out')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recurring · 3/ })).toBeInTheDocument()
  })

  it('reveals them on tap', async () => {
    setup(rota)
    await userEvent.click(screen.getByRole('button', { name: /Recurring · 3/ }))
    expect(screen.getByText('Bins out')).toBeInTheDocument()
    expect(screen.getByText('Smoke alarms')).toBeInTheDocument()
  })

  it('leaves a short rota alone — hiding two rows behind a header saves nothing', () => {
    setup([
      task({ id: 'a', title: 'Book the vet', due_date: isoDateIn(4) }),
      chore('r1', 'Bins out', 2),
      chore('r2', 'Water bill', 3),
    ])
    expect(screen.queryByRole('button', { name: /Recurring/ })).not.toBeInTheDocument()
    expect(screen.getByText('Bins out')).toBeInTheDocument()
  })

  it('reads chronologically while unfolded, rather than one-offs-first', () => {
    setup([
      task({ id: 'a', title: 'Book the vet', due_date: isoDateIn(4) }),
      chore('r1', 'Bins out', 2),
    ])
    const titles = [...document.querySelectorAll('.row-title')].map((e) => e.textContent)
    expect(titles).toEqual(['Bins out', 'Book the vet'])
  })

  it('does not offer the fold when nothing in Upcoming repeats', () => {
    setup([task({ id: 'a', title: 'Book the vet', due_date: isoDateIn(4) })])
    expect(screen.queryByRole('button', { name: /Recurring/ })).not.toBeInTheDocument()
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

describe('TasksView — inline subtasks reorder like the project page', () => {
  const open = async () => userEvent.click(screen.getByRole('button', { name: /expand details/ }))
  const subTitles = () =>
    [...document.querySelectorAll('.list-row.sub .row-title')].map((e) => e.textContent)

  it('shows them in manual order, not the order they were created', async () => {
    setup([
      task({ id: 'a', title: 'Move house', due_date: isoDateIn(0) }),
      task({ id: 's1', title: 'Book van', parent_id: 'a', sort_order: 2 }),
      task({ id: 's2', title: 'Pack kitchen', parent_id: 'a', sort_order: 1 }),
    ])
    await open()
    expect(subTitles()).toEqual(['Pack kitchen', 'Book van'])
  })

  it('an unranked subtask sinks below ranked ones rather than jumping the queue', async () => {
    setup([
      task({ id: 'a', title: 'Move house', due_date: isoDateIn(0) }),
      task({ id: 's1', title: 'Added later', parent_id: 'a', created_at: '2026-02-01T00:00:00Z' }),
      task({ id: 's2', title: 'Placed by hand', parent_id: 'a', sort_order: 5 }),
    ])
    await open()
    expect(subTitles()).toEqual(['Placed by hand', 'Added later'])
  })

  it('hands the drag to the same reorder path the project page uses', async () => {
    const { data } = setup([
      task({ id: 'a', title: 'Move house', due_date: isoDateIn(0) }),
      task({ id: 's1', title: 'Book van', parent_id: 'a', sort_order: 1 }),
      task({ id: 's2', title: 'Pack kitchen', parent_id: 'a', sort_order: 2 }),
    ])
    await open()
    // The gesture itself belongs to ReorderableList (tested there); what this
    // view owes is a wrapper wired to reorderTasks over the displayed order.
    expect(document.querySelectorAll('.reorder-plain > .reorder-row')).toHaveLength(2)
    expect(data.reorderTasks).not.toHaveBeenCalled()
  })
})

// Two tasks, deliberately in different buckets (Overdue then Today) so their
// order on screen is fixed by BUCKETS and not by whatever the sort does with
// two identical rows.
describe('TasksView — several tasks open at once', () => {
  const pair = [
    task({ id: 'a', title: 'Move house', due_date: isoDateIn(-2) }),
    task({ id: 'b', title: 'Plan the trip', due_date: isoDateIn(0) }),
  ]
  const expand = async (title) =>
    userEvent.click(screen.getByRole('button', { name: new RegExp(`${title}, expand details`) }))
  const openPanels = () => screen.queryAllByPlaceholderText('Add a subtask…')

  it('leaves the first one open when you expand the second', async () => {
    setup(pair)
    await expand('Move house')
    await expand('Plan the trip')
    expect(openPanels()).toHaveLength(2)
  })

  it('collapses only the row you tapped', async () => {
    setup(pair)
    await expand('Move house')
    await expand('Plan the trip')
    await userEvent.click(screen.getByRole('button', { name: /Move house, collapse details/ }))
    expect(openPanels()).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: /Plan the trip, collapse details/ }),
    ).toBeInTheDocument()
  })

  it('keeps each open task’s subtask draft to itself', async () => {
    const { data } = setup(pair)
    await expand('Move house')
    await expand('Plan the trip')
    const [first, second] = openPanels()
    await userEvent.type(first, 'Book the van')
    // One shared draft would have echoed it into the other panel.
    expect(second).toHaveValue('')
    await userEvent.type(second, 'Renew passport{Enter}')
    expect(data.addTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renew passport', parent_id: 'b' }),
    )
    expect(first).toHaveValue('Book the van')
  })
})

describe('TasksView — opening one task on its own page', () => {
  it('goes to the page instead of expanding the row', async () => {
    const { onOpenTask } = setup([
      task({ id: 'a', title: 'Call the plumber', due_date: isoDateIn(0) }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Open Call the plumber' }))
    expect(onOpenTask).toHaveBeenCalledWith('a')
    // The button sits inside the row, so the tap must not also reach the row.
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

describe('TasksView — the area lens', () => {
  const scoped = () =>
    setup(
      [
        task({ id: 'a', title: 'File expenses', area_id: 'a-work', due_date: isoDateIn(0) }),
        task({ id: 'b', title: 'Water plants', due_date: isoDateIn(0) }),
        task({ id: 'c', title: 'Call the plumber', area_id: 'a-home', due_date: isoDateIn(0) }),
      ],
      { areas: [area()], activeArea: 'a-work' },
    )

  it('narrows to the active area', () => {
    scoped()
    expect(screen.getByText('File expenses')).toBeInTheDocument()
    expect(screen.queryByText('Call the plumber')).not.toBeInTheDocument()
  })

  // The call §3.5 turns on: unfiled work is NOT dropped by the lens. Hiding it
  // would make forgetting to file something look like losing it, which is the
  // failure that costs the feature its trust.
  it('keeps unfiled tasks reachable in a collapsed No area section', async () => {
    scoped()
    expect(screen.queryByText('Water plants')).not.toBeInTheDocument()
    const section = screen.getByText(/No area/)
    expect(section).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByText('Water plants')).toBeInTheDocument()
  })

  it('offers no No-area section when nothing is unfiled', () => {
    setup([task({ id: 'a', area_id: 'a-work', due_date: isoDateIn(0) })], {
      areas: [area()],
      activeArea: 'a-work',
    })
    expect(screen.queryByText(/No area/)).not.toBeInTheDocument()
  })

  // The pills used to live on this page. They're in the shell now, so one pick
  // scopes every screen — this asserts the page stopped owning that control.
  it('renders no area pills of its own', () => {
    scoped()
    expect(screen.queryByRole('button', { name: 'All areas' })).not.toBeInTheDocument()
  })

  // On All the rows are mixed, so each one says where it belongs (AreaDot).
  it('marks which area a filed row is in while looking at All', () => {
    setup(
      [
        task({ id: 'a', title: 'File expenses', area_id: 'a-work', due_date: isoDateIn(0) }),
        task({ id: 'b', title: 'Water plants', due_date: isoDateIn(0) }),
      ],
      { areas: [area()] },
    )
    expect(screen.getByLabelText('In Work')).toBeInTheDocument()
    // One dot, not two: an unfiled task has no area to name.
    expect(screen.getAllByLabelText(/^In /)).toHaveLength(1)
  })

  // Under a lens every row shares the area, so the mark would be a column of
  // identical dots saying what the switcher already says.
  it('drops the mark once a lens is on', () => {
    scoped()
    expect(screen.queryByLabelText('In Work')).not.toBeInTheDocument()
  })
})

describe('TasksView — quick add', () => {
  it('a typed line lands on you, not on nobody', async () => {
    const { data } = setup([])
    await userEvent.type(screen.getByPlaceholderText(/Add a task/), 'water the plants{Enter}')
    expect(data.addTask).toHaveBeenCalledWith(expect.objectContaining({ assignee: 'm-1' }))
  })

  it('inherits the area you are looking at so it does not vanish on add', async () => {
    const { data } = setup([task({ id: 'a', area_id: 'a-work', due_date: isoDateIn(0) })], {
      areas: [area()],
      activeArea: 'a-work',
    })
    await userEvent.type(screen.getByPlaceholderText(/Add a task/), 'file expenses{Enter}')
    expect(data.addTask).toHaveBeenCalledWith(expect.objectContaining({ area_id: 'a-work' }))
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
