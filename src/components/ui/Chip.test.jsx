import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Chip from './Chip'

describe('Chip', () => {
  it('renders a read-only marker as a span, not a control', () => {
    render(<Chip>home</Chip>)
    // A due-date or tag marker in the tab order is 40 extra stops on the
    // tasks list for something that does nothing when activated.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('becomes a toggle button when given onClick, and reports its state', async () => {
    const onClick = vi.fn()
    render(
      <Chip onClick={onClick} active>
        work
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'work' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('names its remove affordance after what it removes', async () => {
    const onRemove = vi.fn()
    render(<Chip onRemove={onRemove}>gifts</Chip>)
    await userEvent.click(screen.getByRole('button', { name: 'Remove gifts' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('maps tone to a class rather than taking a colour', () => {
    const { container } = render(<Chip tone="danger">2d overdue</Chip>)
    expect(container.firstChild).toHaveClass('chip', 'chip-danger')
  })
})
