import { Minus, Plus } from 'react-feather'

// −/value/+ for a countable quantity (glasses of water, steps, list quantity).
// Extracted because the habits list, the habit detail page and the list-item
// editor each had their own copy, and the habits one shipped 30px buttons —
// the smallest recurring tap target in the app, used many times a day.
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  label = 'value',
  format = (v) => v,
}) {
  const clamp = (v) => Math.min(max, Math.max(min, v))
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      {/* tabular-nums via .stepper-val so the row doesn't twitch as digits change */}
      <span className="stepper-val" aria-live="polite">
        {format(value)}
      </span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
