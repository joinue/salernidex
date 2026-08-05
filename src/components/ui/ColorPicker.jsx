import { COLORS } from '../../lib/colors'

// A row of preset color swatches plus a custom swatch backed by the native OS
// color picker. The custom swatch shows a rainbow until a non-preset color is
// chosen, then the chosen color with the selected ring. `value` is a hex string.
export default function ColorPicker({ value, onChange }) {
  const isCustom = !COLORS.includes(value)
  return (
    <div className="color-swatches">
      {COLORS.map((c) => (
        <button
          type="button"
          key={c}
          className={`color-swatch ${value === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
        />
      ))}
      <label
        className={`color-swatch color-custom ${isCustom ? 'on' : ''}`}
        style={isCustom ? { background: value } : undefined}
        aria-label="Custom color"
      >
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}
