import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { X } from 'react-feather'
import IconButton from './IconButton'

describe('IconButton', () => {
  it('exposes its label as the accessible name', () => {
    render(<IconButton icon={X} label="Remove Nina" />)
    // The whole point of the primitive: an icon-only control that a screen
    // reader can announce. Every raw <button className="icon-btn"> had to
    // remember its own aria-label, and several didn't.
    expect(screen.getByRole('button', { name: 'Remove Nina' })).toBeInTheDocument()
  })

  it('hides the glyph from assistive tech so the name is not doubled', () => {
    const { container } = render(<IconButton icon={X} label="Close" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('carries the variant and size as classes', () => {
    render(<IconButton icon={X} label="Delete" variant="danger" size="md" />)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn).toHaveClass('icon-btn', 'icon-btn-danger', 'icon-btn-md')
  })

  it('fires onClick', async () => {
    const onClick = vi.fn()
    render(<IconButton icon={X} label="Dismiss" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(<IconButton icon={X} label="Dismiss" onClick={onClick} disabled />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('defaults to type=button so it never submits a surrounding form', () => {
    render(<IconButton icon={X} label="Clear" />)
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('type', 'button')
  })
})
