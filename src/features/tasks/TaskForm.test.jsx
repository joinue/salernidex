import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskForm from './TaskForm'

// TaskForm holds real logic, not just markup: the natural-language token merge,
// who a new task lands on, and which fields are worth showing before you've
// asked for them. These are the behaviours worth locking down.

// household.js reads localStorage synchronously; seed a two-member household so
// the assignee UI renders (it hides itself when solo).
function seedHousehold(
  members = [
    { id: 'm-1', name: 'Marc' },
    { id: 'm-2', name: 'Rita' },
  ],
) {
  localStorage.setItem(
    'salernidex-household',
    JSON.stringify({
      name: 'Test',
      join_code: 'ABC-DEF',
      current_member_id: 'm-1',
      members,
    }),
  )
}

const setup = (props = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(<TaskForm onSave={onSave} onClose={onClose} {...props} />)
  return { onSave, onClose }
}

const titleBox = () => screen.getByLabelText('Task')
const saved = (onSave) => onSave.mock.calls[0][0]
// Scoped to the Who row: a parsed name also appears as a preview chip, so a
// bare getByRole would match both.
const whoChip = (name) =>
  within(document.querySelector('.assignee-row')).getByRole('button', { name })

beforeEach(() => {
  localStorage.clear()
  seedHousehold()
  // matchMedia backs focusOnDesktop(); jsdom doesn't ship it.
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })
})

describe('TaskForm — what it asks for up front', () => {
  it('leads with the task, then when, then who — and nothing else', () => {
    setup()
    const labels = [...document.querySelectorAll('.field > .label')].map((e) =>
      e.textContent.trim(),
    )
    expect(labels).toEqual(['Task', 'Due', 'Who'])
  })

  it('keeps priority, area, tags, repeat and notes behind More options', async () => {
    setup()
    expect(screen.queryByLabelText('Area')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /More options/ }))
    expect(screen.getByLabelText('Area')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
  })

  it('opens More options already expanded when editing a task that uses them', () => {
    setup({ task: { id: 't', title: 'Pay rent', area: 'Home', priority: 2 } })
    expect(screen.getByLabelText('Area')).toHaveValue('Home')
  })

  it('hides the Who row entirely in a solo household', () => {
    seedHousehold([{ id: 'm-1', name: 'Marc' }])
    setup()
    const labels = [...document.querySelectorAll('.field > .label')].map((e) =>
      e.textContent.trim(),
    )
    expect(labels).toEqual(['Task', 'Due'])
  })
})

describe('TaskForm — who a new task lands on', () => {
  it('defaults to the signed-in member, not Anyone', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'call the plumber')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).assignee).toBe('m-1')
  })

  it('lets you hand it to the household in one tap', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'call the plumber')
    await userEvent.click(whoChip(/Anyone/))
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).assignee).toBe('anyone')
  })

  it('still lets a typed "for <name>" win over the default', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'call the plumber for Rita')
    // The picker reflects it, so you can see where it landed before saving.
    expect(whoChip(/Rita/)).toHaveClass('on')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    const fields = saved(onSave)
    expect(fields.assignee).toBe('m-2')
    expect(fields.title).toBe('call the plumber')
  })

  it('an explicit pick beats a typed name', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'call the plumber for Rita')
    await userEvent.click(whoChip(/Marc/))
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).assignee).toBe('m-1')
  })

  it('keeps whoever an edited task already belonged to', () => {
    setup({ task: { id: 't', title: 'Bins', assignee: 'm-2' } })
    expect(whoChip(/Rita/)).toHaveClass('on')
  })
})

describe('TaskForm — the natural-language preview', () => {
  it('strips a recognised date out of the title and applies it', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'take the bins out tomorrow')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    const fields = saved(onSave)
    expect(fields.title).toBe('take the bins out')
    expect(fields.due_date).toBeTruthy()
  })

  it('dismissing a token puts its words back in the title and drops the value', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'take the bins out tomorrow')
    const preview = document.querySelector('.nl-preview')
    await userEvent.click(within(preview).getByRole('button', { name: /Tomorrow/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    const fields = saved(onSave)
    expect(fields.title).toBe('take the bins out tomorrow')
    expect(fields.due_date).toBeNull()
  })

  it('does not re-parse an existing title when editing', () => {
    setup({ task: { id: 't', title: 'Call mom Monday' } })
    expect(document.querySelector('.nl-preview')).toBeNull()
    expect(titleBox()).toHaveValue('Call mom Monday')
  })
})

describe('TaskForm — dates', () => {
  it('one tap on Today fills the due date', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'water the plants')
    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).due_date).toBe(new Date().toISOString().slice(0, 10))
  })

  it('only offers a time of day once there is a date to hang it on', async () => {
    setup()
    expect(screen.queryByLabelText('Time of day (optional)')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    expect(screen.getByLabelText('Time of day (optional)')).toBeInTheDocument()
  })
})
