import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AreaSwitcher from './AreaSwitcher'
import { ALL_AREAS } from '../../lib/areas'

// The switcher is the whole feature's front door: one pick scopes seven pages
// and survives a cold launch. What's worth locking down is which lenses it
// offers, and that it stays invisible until there's something to offer.

const ME = 'u-me'

const area = (over = {}) => ({
  id: 'a-work',
  name: 'Work',
  shared: false,
  created_by: ME,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const setup = (areas, props = {}) => {
  const onChange = vi.fn()
  render(
    <AreaSwitcher areas={areas} userId={ME} value={ALL_AREAS} onChange={onChange} {...props} />,
  )
  return { onChange }
}

describe('AreaSwitcher', () => {
  // Progressive disclosure: someone who never makes an area should never meet
  // the concept, on any of the pages this renders above.
  it('renders nothing until an area exists', () => {
    const { container } = render(<AreaSwitcher areas={[]} userId={ME} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  // The point of promoting areas to rows: the switcher offers the areas you
  // HAVE, not the ones something is already filed into. Otherwise you could
  // never file the first thing into a new area.
  it('offers an area with nothing filed into it', () => {
    setup([area()])
    expect(screen.getByRole('button', { name: /Work/ })).toBeInTheDocument()
  })

  it('reports the picked area', async () => {
    const { onChange } = setup([area()])
    await userEvent.click(screen.getByRole('button', { name: /Work/ }))
    expect(onChange).toHaveBeenCalledWith('a-work')
  })

  it('offers All, and reports it', async () => {
    const { onChange } = setup([area()], { value: 'a-work' })
    await userEvent.click(screen.getByRole('button', { name: 'All areas' }))
    expect(onChange).toHaveBeenCalledWith(ALL_AREAS)
  })

  // `shared` is what lets two people in one household each keep their own
  // "Work" without either seeing the other's.
  it('does not offer a co-member’s private area', () => {
    setup([area({ id: 'a-theirs', name: 'Their work', created_by: 'u-them' })])
    expect(screen.queryByRole('button', { name: /Their work/ })).not.toBeInTheDocument()
  })

  it('does offer a co-member’s shared area', () => {
    setup([area({ id: 'a-home', name: 'Home', created_by: 'u-them', shared: true })])
    expect(screen.getByRole('button', { name: /Home/ })).toBeInTheDocument()
  })

  it('leaves archived areas out', () => {
    setup([area({ archived_at: '2026-05-01T00:00:00Z' })])
    expect(screen.queryByRole('button', { name: /Work/ })).not.toBeInTheDocument()
  })

  it('marks the active lens for assistive tech, not just visually', () => {
    setup([area()], { value: 'a-work' })
    expect(screen.getByRole('button', { name: /Work/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All areas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows a count per area and a total on All', () => {
    setup([area(), area({ id: 'a-home', name: 'Home' })], {
      counts: new Map([
        ['a-work', 3],
        ['a-home', 2],
      ]),
    })
    expect(screen.getByRole('button', { name: 'Work, 3 open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All areas, 5 open' })).toBeInTheDocument()
  })
})
