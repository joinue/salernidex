import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Stepper from './Stepper'

const decrease = () => screen.getByRole('button', { name: /decrease/i })
const increase = () => screen.getByRole('button', { name: /increase/i })

describe('Stepper', () => {
  it('steps up and down', async () => {
    const onChange = vi.fn()
    render(<Stepper value={3} onChange={onChange} label="glasses" />)
    await userEvent.click(increase())
    expect(onChange).toHaveBeenLastCalledWith(4)
    await userEvent.click(decrease())
    expect(onChange).toHaveBeenLastCalledWith(2)
  })

  it('clamps to min and disables the button that would break it', async () => {
    const onChange = vi.fn()
    render(<Stepper value={0} onChange={onChange} min={0} label="glasses" />)
    expect(decrease()).toBeDisabled()
    await userEvent.click(decrease())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps to max', async () => {
    const onChange = vi.fn()
    render(<Stepper value={5} onChange={onChange} max={5} label="glasses" />)
    expect(increase()).toBeDisabled()
    await userEvent.click(increase())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('honours a custom step', async () => {
    const onChange = vi.fn()
    render(<Stepper value={100} onChange={onChange} step={500} label="steps" />)
    await userEvent.click(increase())
    expect(onChange).toHaveBeenLastCalledWith(600)
  })

  it('names both buttons after the thing being counted', () => {
    render(<Stepper value={1} onChange={() => {}} label="glasses of water" />)
    // Four steppers on one screen (the habits list) all read "Decrease"
    // otherwise, which tells a screen-reader user nothing.
    expect(screen.getByRole('button', { name: 'Increase glasses of water' })).toBeInTheDocument()
  })

  it('formats the displayed value without changing what it emits', async () => {
    const onChange = vi.fn()
    render(
      <Stepper value={1500} onChange={onChange} format={(v) => `${v / 1000}k`} label="steps" />,
    )
    expect(screen.getByText('1.5k')).toBeInTheDocument()
    await userEvent.click(increase())
    expect(onChange).toHaveBeenLastCalledWith(1501)
  })
})
