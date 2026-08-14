import { useId } from 'react'

// Label + control + optional hint/error, the shape 97 call sites were spelling
// out by hand as `<div className="field"><label className="label">…`.
//
// The reason to have it as a component and not just the class: it wires the
// label to the control with a generated id. Half the hand-written ones used a
// bare <label> with no `htmlFor`, so tapping the label did nothing and screen
// readers announced the control unnamed.
//
//   <Field label="Due">{(id) => <input id={id} … />}</Field>
//   <Field label="Name" hint="Shown to your household"><input … /></Field>
//
// Pass a function child to receive the id; pass plain children when the control
// carries its own labeling (a Segmented, a chip row).
export default function Field({ label, hint, error, children, className = '' }) {
  const id = useId()
  return (
    <div className={`field ${className}`.trim()}>
      {label && (
        <label className="label" htmlFor={typeof children === 'function' ? id : undefined}>
          {label}
        </label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
