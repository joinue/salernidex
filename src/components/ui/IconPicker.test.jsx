import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IconPicker from './IconPicker'

// matchMedia defaults to "no match" in test/setup.js, so focusOnDesktop() is
// false throughout — i.e. these run on the phone branch, which is the one with
// the keyboard problem.
describe('IconPicker', () => {
  it('browses the catalog in its own dialog, not in a panel inside the form', async () => {
    render(
      <form onSubmit={vi.fn()}>
        <IconPicker value="" onChange={vi.fn()} />
      </form>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Browse all icons' }))

    const dialog = screen.getByRole('dialog', { name: 'Choose an icon' })
    // Outside the <form>, so the keyboard's Go key has nothing to submit —
    // searching for an icon used to create the area.
    expect(dialog.closest('form')).toBeNull()
    expect(within(dialog).getByRole('searchbox', { name: 'Search icons' })).toBeInTheDocument()
  })

  it('leaves the search field unfocused on a phone', async () => {
    render(<IconPicker value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Browse all icons' }))

    // The keyboard covering two thirds of the catalog you just opened is not a
    // helpful default. The field is a tap away when you want it.
    const search = screen.getByRole('searchbox', { name: 'Search icons' })
    expect(search).not.toHaveFocus()
  })

  it('reports the choice and closes', async () => {
    const onChange = vi.fn()
    render(<IconPicker value="" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Browse all icons' }))
    // Scoped to the dialog: the quick row is still mounted behind it, and some
    // glyphs appear in both.
    const dialog = screen.getByRole('dialog', { name: 'Choose an icon' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Icon 🧘' }))

    expect(onChange).toHaveBeenCalledWith('🧘')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('filters on keyword, not just on the glyph itself', async () => {
    render(<IconPicker value="" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Browse all icons' }))
    const dialog = screen.getByRole('dialog', { name: 'Choose an icon' })
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search icons' }), 'hydrate')

    expect(within(dialog).getByRole('button', { name: 'Icon 💧' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Icon 🧘' })).not.toBeInTheDocument()
  })

  it('surfaces a glyph chosen from the catalog in the compact row', () => {
    // 🦷 isn't one of the quick defaults; without this the row would show no
    // selection at all after picking it, and the choice would look like it
    // hadn't taken.
    render(<IconPicker value="🦷" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Icon 🦷' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
