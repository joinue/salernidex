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

// The rail is the desktop sidebar, and it is a different shape on purpose: one
// row naming the active lens, the rest behind a menu, so the sidebar's height
// no longer grows with how many areas you own. What's worth locking down is
// that the collapse doesn't cost you a lens — every area the pills offered has
// to still be reachable, in one more click and no more.
describe('AreaSwitcher (rail)', () => {
  const rail = (areas, props = {}) => setup(areas, { variant: 'rail', ...props })
  const MANY = ['Work', 'Home', 'Band', 'Garage', 'Rentals'].map((name, i) => ({
    ...area({ id: `a-${i}`, name }),
    created_at: `2026-01-0${i + 1}T00:00:00Z`,
  }))

  it('shows only the active lens, not every area', () => {
    rail(MANY, { value: 'a-1' })
    expect(screen.getByRole('button', { name: 'Filter by area: Home' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Garage/ })).not.toBeInTheDocument()
  })

  it('names All when no lens is on', () => {
    rail(MANY)
    expect(screen.getByRole('button', { name: 'Filter by area: All areas' })).toBeInTheDocument()
  })

  // The whole bet of collapsing: the rail's height is now constant. If this
  // ever renders per-area rows again, the sidebar is back to being shoved down.
  it('renders one control regardless of how many areas exist', () => {
    const { container } = render(
      <AreaSwitcher areas={MANY} userId={ME} value={ALL_AREAS} onChange={vi.fn()} variant="rail" />,
    )
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('opens a menu offering every area, plus All', async () => {
    rail(MANY, { value: 'a-0' })
    await userEvent.click(screen.getByRole('button', { name: 'Filter by area: Work' }))
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(MANY.length + 1)
    for (const a of MANY) {
      expect(screen.getByRole('menuitemradio', { name: a.name })).toBeInTheDocument()
    }
  })

  it('reports the picked area and closes', async () => {
    const { onChange } = rail(MANY)
    await userEvent.click(screen.getByRole('button', { name: /Filter by area/ }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Garage' }))
    expect(onChange).toHaveBeenCalledWith('a-3')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marks the active lens in the menu for assistive tech', async () => {
    rail(MANY, { value: 'a-1' })
    await userEvent.click(screen.getByRole('button', { name: /Filter by area/ }))
    expect(screen.getByRole('menuitemradio', { name: 'Home' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemradio', { name: 'All areas' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('carries the active count on the trigger, and the total on All', async () => {
    rail(MANY, {
      value: 'a-0',
      counts: new Map([
        ['a-0', 3],
        ['a-1', 2],
      ]),
    })
    expect(screen.getByRole('button', { name: /Filter by area: Work/ })).toHaveTextContent('3')
    await userEvent.click(screen.getByRole('button', { name: /Filter by area/ }))
    expect(screen.getByRole('menuitemradio', { name: 'All areas, 5 open' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Work, 3 open' })).toBeInTheDocument()
  })

  // Manage was the last pill in the row; collapsing must not strand it, or the
  // only way to rename an area becomes remembering it's in Settings.
  it('keeps Manage reachable, and closes on the way there', async () => {
    const onManage = vi.fn()
    rail(MANY, { onManage })
    await userEvent.click(screen.getByRole('button', { name: /Filter by area/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Manage areas' }))
    expect(onManage).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    rail(MANY)
    await userEvent.click(screen.getByRole('button', { name: /Filter by area/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // The lens survives a cold launch, so the area it names can be archived or
  // un-shared by a co-member while you're away. App falls the selection back to
  // All; the trigger must not go on naming a lens that is no longer offered.
  it('falls back to All when the saved lens is no longer offered', () => {
    rail(MANY, { value: 'a-gone' })
    expect(screen.getByRole('button', { name: 'Filter by area: All areas' })).toBeInTheDocument()
  })

  it('still renders nothing until an area exists', () => {
    const { container } = render(
      <AreaSwitcher areas={[]} userId={ME} onChange={vi.fn()} variant="rail" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
