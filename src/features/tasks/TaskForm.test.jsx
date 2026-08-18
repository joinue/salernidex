import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskForm from './TaskForm'
import { isoDateIn } from '../../lib/tasks'

// TaskForm holds real logic, not just markup: the natural-language token merge,
// who a new task lands on, and which fields are worth showing before you've
// asked for them. These are the behaviors worth locking down.

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

// Areas are real rows now (migration 0040), not strings scraped off tasks.
const homeArea = { id: 'a-home', name: 'Home', shared: false, created_by: 'u-1' }
const privateArea = {
  id: 'a-work',
  name: 'Work',
  shared: false,
  default_private: true,
  created_by: 'u-1',
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

  // Area is the one axis the whole app scopes to, so filing happens on most
  // tasks — it sits with the three questions, not in the drawer.
  it('asks which area before it offers More options', () => {
    setup({ areas: [homeArea] })
    const labels = [...document.querySelectorAll('.field > .label')].map((e) =>
      e.textContent.trim(),
    )
    expect(labels).toEqual(['Task', 'Due', 'Who', 'Area'])
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('keeps priority, tags, repeat and notes behind More options', async () => {
    setup({ areas: [homeArea] })
    expect(screen.queryByText('Priority')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /More options/ }))
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByLabelText(/Notes/)).toBeInTheDocument()
  })

  // Progressive disclosure, the same rule PrivacyField and the member filter
  // follow: someone with no areas should never meet the concept.
  it('offers no area picker at all until an area exists', async () => {
    setup()
    expect(screen.queryByText('Area')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /More options/ }))
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.queryByText('Area')).not.toBeInTheDocument()
  })

  it('opens More options already expanded when editing a task that uses them', () => {
    setup({
      task: { id: 't', title: 'Pay rent', area_id: 'a-home', priority: 2 },
      areas: [homeArea],
    })
    expect(screen.getByText('Priority')).toBeInTheDocument()
  })

  // An area alone is no longer a reason to open the drawer — the picker showing
  // "Home" already says everything the expander would have.
  it('leaves More options closed for an edit that only uses an area', () => {
    setup({ task: { id: 't', title: 'Pay rent', area_id: 'a-home' }, areas: [homeArea] })
    expect(screen.getByRole('button', { name: 'Home' })).toHaveClass('on')
    expect(screen.queryByText('Priority')).not.toBeInTheDocument()
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
  it('strips a recognized date out of the title and applies it', async () => {
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
    // isoDateIn, not toISOString(): a due date is a *local* day, and
    // toISOString() reports the UTC one. West of Greenwich the two diverge
    // every evening, so this assertion passed in the morning and failed after
    // ~18:00 local.
    expect(saved(onSave).due_date).toBe(isoDateIn(0))
  })

  it('only offers a time of day once there is a date to hang it on', async () => {
    setup()
    expect(screen.queryByLabelText('Time of day (optional)')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    expect(screen.getByLabelText('Time of day (optional)')).toBeInTheDocument()
  })
})

describe('TaskForm — on this day vs anytime before', () => {
  const onBy = () => screen.queryByRole('tab', { name: 'Anytime before' })

  it('stays hidden until there is a date to qualify', async () => {
    setup()
    expect(onBy()).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    expect(onBy()).toBeInTheDocument()
  })

  it('saves a date as "on this day" unless told otherwise', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'water the plants')
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).due_kind).toBe('on')
  })

  it('saves the deadline when the segment is picked', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'water the plants')
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await userEvent.click(onBy())
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave)).toMatchObject({ due_kind: 'by', due_date: isoDateIn(7) })
  })

  it('a typed "by <date>" pre-selects the deadline without a date being picked', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'clear the gutters by friday')
    expect(onBy()).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave)).toMatchObject({ title: 'clear the gutters', due_kind: 'by' })
  })

  it('an explicit pick still beats what was typed', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'clear the gutters by friday')
    await userEvent.click(screen.getByRole('tab', { name: 'On this day' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).due_kind).toBe('on')
  })

  it('keeps a deadline when editing an existing one', () => {
    setup({ task: { id: 't', title: 'Gutters', due_date: isoDateIn(9), due_kind: 'by' } })
    expect(onBy()).toHaveAttribute('aria-selected', 'true')
  })

  it('never stores a deadline with no date to be a deadline against', async () => {
    const { onSave } = setup()
    await userEvent.type(titleBox(), 'water the plants')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave)).toMatchObject({ due_date: null, due_kind: 'on' })
  })
})

describe('TaskForm — the lens you are looking through', () => {
  // Typing a task while scoped to Work must produce a Work task with zero extra
  // taps, or the lens is a tax rather than a tool.
  it('opens pre-filed under the active area', async () => {
    const { onSave } = setup({ areas: [homeArea], defaultAreaId: 'a-home' })
    expect(screen.getByRole('button', { name: 'Home' })).toHaveClass('on')
    await userEvent.type(titleBox(), 'Water plants')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).area_id).toBe('a-home')
  })

  // Under All there is nothing to inherit — App passes areaForNewItem, which
  // returns null rather than picking one for you.
  it('starts on None when no lens is on', () => {
    setup({ areas: [homeArea], defaultAreaId: null })
    expect(screen.getByRole('button', { name: 'None' })).toHaveClass('on')
  })

  it('is a starting point, not a rule — None is one tap away', async () => {
    const { onSave } = setup({ areas: [homeArea], defaultAreaId: 'a-home' })
    await userEvent.click(screen.getByRole('button', { name: 'None' }))
    await userEvent.type(titleBox(), 'Water plants')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).area_id).toBeNull()
  })

  // An edit is not a creation: the lens must never move a task that already
  // lives somewhere, or opening a Work task under the Home lens refiles it.
  it('never re-files an existing task to the lens', () => {
    setup({
      task: { id: 't', title: 'File expenses', area_id: 'a-work' },
      areas: [homeArea, privateArea],
      defaultAreaId: 'a-home',
    })
    expect(screen.getByRole('button', { name: 'Work' })).toHaveClass('on')
  })

  // The §5.2 fallthrough reaches the inherited area too: creating under a lens
  // that keeps things private shouldn't need a second decision.
  it('takes the inherited area privacy along with it', async () => {
    const { onSave } = setup({
      areas: [privateArea],
      defaultAreaId: 'a-work',
      defaultPrivacy: 'shared',
    })
    await userEvent.type(titleBox(), 'File expenses')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).privacy_level).toBe('private')
  })
})

describe('TaskForm — making an area without leaving the sheet', () => {
  // The dead end this fixes: you're mid-task, the area you want doesn't exist,
  // and the only way to make one is to abandon the sheet for Settings.
  const openNameBox = async () => {
    await userEvent.click(screen.getByRole('button', { name: /New area/ }))
    return screen.getByLabelText('New area name')
  }

  it('creates the area and files the task into it in one go', async () => {
    const onCreateArea = vi.fn().mockReturnValue('a-new')
    const { onSave } = setup({ areas: [homeArea], onCreateArea })
    await userEvent.type(await openNameBox(), 'The band')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onCreateArea).toHaveBeenCalledWith('The band')
    await userEvent.type(titleBox(), 'Book the rehearsal room')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).area_id).toBe('a-new')
  })

  it('Enter names the area instead of saving the task', async () => {
    const onCreateArea = vi.fn().mockReturnValue('a-new')
    const { onSave } = setup({ areas: [homeArea], onCreateArea })
    await userEvent.type(await openNameBox(), 'The band{Enter}')
    expect(onCreateArea).toHaveBeenCalledWith('The band')
    expect(onSave).not.toHaveBeenCalled()
  })

  // "work" and "Work" as two areas that can never be merged is exactly what
  // free-typed areas used to produce; a name that already exists selects it.
  it('picks the existing area rather than minting a near-duplicate', async () => {
    const onCreateArea = vi.fn()
    const { onSave } = setup({ areas: [homeArea], onCreateArea })
    await userEvent.type(await openNameBox(), '  home {Enter}')
    expect(onCreateArea).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Home' })).toHaveClass('on')
    await userEvent.type(titleBox(), 'Water plants')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(saved(onSave).area_id).toBe('a-home')
  })

  // Nothing to make an area from, so nothing happens — and the box closes
  // rather than sitting open over a form you're trying to finish.
  it('makes nothing from an empty name', async () => {
    const onCreateArea = vi.fn()
    setup({ areas: [homeArea], onCreateArea })
    await userEvent.type(await openNameBox(), '   {Enter}')
    expect(onCreateArea).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('New area name')).not.toBeInTheDocument()
  })

  // The picker is shared with ListForm and friends, which don't offer this.
  it('offers no ＋ pill when the caller has no way to create one', () => {
    setup({ areas: [homeArea] })
    expect(screen.queryByRole('button', { name: /New area/ })).not.toBeInTheDocument()
  })
})

describe('TaskForm — an area that keeps things private', () => {
  // The §5.2 fallthrough: the area gets to say "private", and otherwise your own
  // preference decides. Filing into Work should not need a second decision.
  it('makes a new task private when the area says so', async () => {
    const { onSave } = setup({ areas: [privateArea], defaultPrivacy: 'shared' })
    await userEvent.click(screen.getByRole('button', { name: 'Work' }))
    await userEvent.type(titleBox(), 'File expenses')
    await userEvent.click(screen.getByRole('button', { name: /Add task/i }))
    expect(saved(onSave).privacy_level).toBe('private')
  })

  it('leaves the default alone for an area with nothing to say', async () => {
    const { onSave } = setup({ areas: [homeArea], defaultPrivacy: 'shared' })
    await userEvent.click(screen.getByRole('button', { name: 'Home' }))
    await userEvent.type(titleBox(), 'Water plants')
    await userEvent.click(screen.getByRole('button', { name: /Add task/i }))
    expect(saved(onSave).privacy_level).toBe('shared')
  })

  // Pre-fill, not a rule — you can still share one item out of a private area.
  it('lets an explicit pick beat the area', async () => {
    const { onSave } = setup({ areas: [privateArea], defaultPrivacy: 'shared' })
    await userEvent.click(screen.getByRole('button', { name: 'Work' }))
    // PrivacyField lives behind the expander, and it's a Segmented, so its
    // options are tabs rather than buttons.
    await userEvent.click(screen.getByRole('button', { name: /More options/ }))
    await userEvent.click(screen.getByRole('tab', { name: 'Shared' }))
    await userEvent.type(titleBox(), 'Book the offsite')
    await userEvent.click(screen.getByRole('button', { name: /Add task/i }))
    expect(saved(onSave).privacy_level).not.toBe('private')
  })

  // An edit already has a visibility somebody chose; re-deciding it would
  // silently re-privatise work when the form is opened for an unrelated tweak.
  it('never re-decides visibility on an edit', async () => {
    const { onSave } = setup({
      task: { id: 't', title: 'Pay rent', area_id: 'a-work', privacy_level: 'shared' },
      areas: [privateArea],
    })
    await userEvent.click(screen.getByRole('button', { name: /Save/i }))
    expect(saved(onSave).privacy_level).toBe('shared')
  })
})
