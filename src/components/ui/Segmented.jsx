// iOS segmented control. `options` is [{ value, label }]; the selected segment
// rides on a sliding white "thumb". Used in place of dropdown filter rows.
export default function Segmented({ options, value, onChange, size = 'md' }) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  return (
    <div className={`segmented segmented-${size}`} role="tablist">
      <span
        className="segmented-thumb"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`segment ${o.value === value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
