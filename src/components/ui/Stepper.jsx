import { Minus, Plus } from 'react-feather'

// −/value/+ for a countable quantity (glasses of water, steps, list quantity).
// Extracted because the habits list, the habit detail page and the list-item
// editor each had their own copy, and the habits one shipped 30px buttons —
// the smallest recurring tap target in the app, used many times a day.
//
// Two shapes, one control:
//   numeric  — pass value/onChange (+ optional min/max/step). The value is a
//              read-only span and the buttons disable at the bounds.
//   freeform — pass onStep(delta) and renderValue(). A list quantity is
//              deliberately text ("2 lbs", "a dozen"), so it steps through
//              domain logic rather than arithmetic and shows an input. This is
//              why the list editor had its own 30px copy for so long.
//
// `onMouseDown` is forwarded because the list editor commits on blur: a stepper
// tap must not pull focus out of the text field and tear the editor down.
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  label = 'value',
  format = (v) => v,
  onStep,
  renderValue,
  onMouseDown,
}) {
  const clamp = (v) => Math.min(max, Math.max(min, v))
  const freeform = typeof onStep === 'function'
  const bump = (delta) => (freeform ? onStep(delta) : onChange(clamp(value + delta * step)))
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        onMouseDown={onMouseDown}
        onClick={() => bump(-1)}
        disabled={!freeform && value <= min}
        aria-label={`Decrease ${label}`}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      {renderValue ? (
        renderValue()
      ) : (
        // tabular-nums via .stepper-val so the row doesn't twitch as digits change
        <span className="stepper-val" aria-live="polite">
          {format(value)}
        </span>
      )}
      <button
        type="button"
        className="stepper-btn"
        onMouseDown={onMouseDown}
        onClick={() => bump(1)}
        disabled={!freeform && value >= max}
        aria-label={`Increase ${label}`}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
