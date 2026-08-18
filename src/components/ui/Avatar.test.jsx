import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import Avatar from './Avatar'

// Photos resolve through avatarStorage; here we only care about what the user
// sees while one is arriving, and what happens when it never does.
vi.mock('../../lib/avatarStorage', () => ({
  useAvatarSrc: (value) => value || null,
}))

const img = () => document.querySelector('.avatar-img')

describe('Avatar', () => {
  it('shows the monogram immediately, and keeps it under a photo that has not decoded', () => {
    render(<Avatar name="Ada Lovelace" src="https://cdn.test/ada.jpg" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(img()).not.toHaveClass('is-ready')
  })

  it('reveals the photo once it loads', () => {
    render(<Avatar name="Ada Lovelace" src="https://cdn.test/ada.jpg" />)
    fireEvent.load(img())
    expect(img()).toHaveClass('is-ready')
  })

  it('drops back to the monogram when the photo fails', () => {
    render(<Avatar name="Ada Lovelace" src="https://cdn.test/gone.jpg" />)
    fireEvent.error(img())
    expect(img()).toBeNull()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('gives a replacement photo a fresh chance after one failed', () => {
    const { rerender } = render(<Avatar name="Ada Lovelace" src="https://cdn.test/gone.jpg" />)
    fireEvent.error(img())
    rerender(<Avatar name="Ada Lovelace" src="https://cdn.test/new.jpg" />)
    expect(img()).toHaveAttribute('src', 'https://cdn.test/new.jpg')
  })
})
