import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Field from './Field'

describe('Field', () => {
  it('wires the label to the control it renders', async () => {
    render(<Field label="Name">{(id) => <input id={id} />}</Field>)
    // getByLabelText only resolves when htmlFor/id actually match, which is the
    // thing the 97 hand-written <div className="field"> blocks kept missing.
    const input = screen.getByLabelText('Name')
    await userEvent.click(screen.getByText('Name'))
    expect(input).toHaveFocus()
  })

  it('shows a hint', () => {
    render(
      <Field label="Email" hint="Only your household sees this.">
        {(id) => <input id={id} />}
      </Field>,
    )
    expect(screen.getByText('Only your household sees this.')).toBeInTheDocument()
  })

  it('replaces the hint with the error and announces it', () => {
    render(
      <Field label="Code" hint="Six characters." error="That code has expired.">
        {(id) => <input id={id} />}
      </Field>,
    )
    expect(screen.queryByText('Six characters.')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('That code has expired.')
  })

  it('accepts plain children for controls that label themselves', () => {
    render(
      <Field label="Priority">
        <div role="tablist" />
      </Field>,
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
