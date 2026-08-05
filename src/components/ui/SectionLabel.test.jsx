import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SectionLabel from './SectionLabel'

describe('SectionLabel', () => {
  it('renders a real heading so pages have an outline', () => {
    render(<SectionLabel>Key dates</SectionLabel>)
    // This is the whole reason it's a component: 54 <div>s gave a screen
    // reader one <h1> and a flat page with nothing to navigate by.
    expect(screen.getByRole('heading', { level: 2, name: 'Key dates' })).toBeInTheDocument()
  })

  it('places a trailing action alongside the label', () => {
    render(<SectionLabel action={<button>See all</button>}>Recent activity</SectionLabel>)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveClass('section-label-row')
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument()
  })
})
