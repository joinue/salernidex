import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReminderForm from './ReminderForm'

// A reminder is filed like everything else. It wasn't for a while: the form
// pruned the area alongside priority and defer dates, so RemindersView scoped
// and sectioned by an area no reminder could ever have, and every one of them
// sat under "No area" for good.

const areas = [
  { id: 'a-work', name: 'Work', icon: '💼' },
  { id: 'a-home', name: 'Home', icon: '🏡' },
]

const setup = (props = {}) => {
  const onSave = vi.fn()
  render(<ReminderForm onSave={onSave} onClose={vi.fn()} areas={areas} {...props} />)
  return { onSave }
}

describe('ReminderForm', () => {
  it('files a new reminder under the lens it was made in', async () => {
    const { onSave } = setup({ defaultAreaId: 'a-work' })
    expect(screen.getByRole('button', { name: /Work/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(screen.getByLabelText('Remind me about'), 'Insurance renews')
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ area_id: 'a-work' }))
  })

  it('lets you re-file an existing one', async () => {
    const { onSave } = setup({
      reminder: { id: 'r1', title: 'Bins go out', area_id: 'a-work' },
    })
    await userEvent.click(screen.getByRole('button', { name: /Home/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ area_id: 'a-home' }))
  })

  it('sends null rather than an empty area when None is picked', async () => {
    const { onSave } = setup({ defaultAreaId: 'a-work' })
    await userEvent.type(screen.getByLabelText('Remind me about'), 'Passport expires')
    await userEvent.click(screen.getByRole('button', { name: 'None' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ area_id: null }))
  })

  it('shows no area chrome at all to a household that has none', () => {
    setup({ areas: [] })
    expect(screen.queryByText('Area')).not.toBeInTheDocument()
  })
})
