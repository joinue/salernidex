import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'react-feather'

// A compact pill that opens a checkmarked menu — the dropdown form of a
// Segmented. Reach for it when the choice is a filter that has to sit inside a
// crowded row (the page header) or when the option list grows with the
// household: a segmented control divides a fixed width by N, so it turns into
// a row of unreadable slivers on the fifth member. Everything a Segmented is
// good at — two or three fixed options, all worth seeing at once — it stays
// good at, so this doesn't replace it.
//
// `label` names the axis for screen readers ("Show tasks for: Anyone"); the
// button itself shows only the current value, because the page around it
// already says what's being filtered.
export default function MenuSelect({ options, value, onChange, label, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!current) return null

  return (
    <div className={`menu-select menu-select-${size}`}>
      <button
        type="button"
        className="menu-select-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ? `${label}: ${current.label}` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="menu-select-value">{current.label}</span>
        <ChevronDown className="menu-select-chevron" size={15} aria-hidden="true" />
      </button>
      {open && (
        <>
          {/* Same catch-all the title menu uses: a tap anywhere else closes
              this, with no outside-click guesswork. */}
          <button
            className="title-menu-backdrop"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="menu-select-popover" role="menu" aria-label={label}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                className={`title-menu-item ${o.value === value ? 'active' : ''}`}
                onClick={() => {
                  setOpen(false)
                  if (o.value !== value) onChange(o.value)
                }}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={17} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
