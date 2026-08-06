import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import SwipeRow from './SwipeRow'

const actions = [
  { label: 'Edit', onClick: vi.fn() },
  { label: 'Delete', variant: 'danger', onClick: vi.fn() },
]

const renderRow = (props = {}) =>
  render(
    <SwipeRow label="Milk" actions={actions} onClick={vi.fn()} {...props}>
      <div className="list-row">Milk</div>
    </SwipeRow>,
  )

// The swipe-revealed buttons are visibility:hidden until the row opens, which
// takes them out of the accessibility tree — so they can't be the accessible
// representation of the actions. A VoiceOver user can't perform the swipe that
// would reveal them, and previously had no other route to Edit or Delete.
describe('SwipeRow action accessibility', () => {
  it('exposes every action without the row being swiped open', () => {
    renderRow()
    expect(screen.getByRole('button', { name: 'Edit Milk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Milk' })).toBeInTheDocument()
  })

  it('names each action with its row, so a list does not read "Delete" N times', () => {
    renderRow({ label: 'Eggs' })
    expect(screen.getByRole('button', { name: 'Delete Eggs' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('falls back to the bare verb when the row has no label', () => {
    renderRow({ label: undefined })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('runs the action when the accessible button is activated', () => {
    const onClick = vi.fn()
    const onRowClick = vi.fn()
    renderRow({ actions: [{ label: 'Delete', onClick }], onClick: onRowClick })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Milk' }))

    expect(onClick).toHaveBeenCalledTimes(1)
    // …and it must not also open the row it sits in
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('hides the swipe-revealed duplicates from assistive tech', () => {
    const { container } = renderRow()
    const revealed = container.querySelector('.swipe-actions')

    expect(revealed).toHaveAttribute('aria-hidden', 'true')
    // aria-hidden with focusable children is its own violation — the buttons
    // must leave the tab order too.
    for (const btn of within(revealed).getAllByRole('button', { hidden: true })) {
      expect(btn).toHaveAttribute('tabindex', '-1')
    }
  })

  it('renders no action cluster at all for a row without actions', () => {
    const { container } = renderRow({ actions: [] })
    expect(container.querySelector('.row-hover-actions')).toBeNull()
  })
})
