import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Users } from 'react-feather'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('renders its message', () => {
    render(<EmptyState>No lists yet.</EmptyState>)
    expect(screen.getByText('No lists yet.')).toBeInTheDocument()
  })

  it('offers a way forward when given one', async () => {
    const onAdd = vi.fn()
    render(
      <EmptyState icon={Users} action={<button onClick={onAdd}>Add someone</button>}>
        Nobody here.
      </EmptyState>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add someone' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('announces the loading variant', () => {
    render(<EmptyState loading>Loading</EmptyState>)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('does not announce the plain variant as a live region', () => {
    render(<EmptyState>Nothing here.</EmptyState>)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('collapses the three old variants onto one element', () => {
    const { container } = render(<EmptyState inline>No tags</EmptyState>)
    expect(container.firstChild).toHaveClass('empty', 'empty-inline')
  })
})
