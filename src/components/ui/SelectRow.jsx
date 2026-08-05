import { useState } from 'react'
import { Check, ChevronRight } from 'react-feather'
import Sheet from './Sheet'

// A dropdown that doesn't fight the surface it sits on.
//
// A native <select> inside a bottom sheet is the one control iOS actively works
// against: tapping it slides the system picker over the bottom ~300px of the
// screen, which on a 660px viewport is exactly where a sheet's lower rows are.
// Four of the six people filters were being changed blind — you couldn't see the
// control you were setting until you dismissed the wheel.
//
// The native answer is the Settings pattern: a row that shows the current value
// and pushes a list of options. The list here is a Sheet, so the options are
// always the topmost surface and nothing can be covered. It also sidesteps the
// 16px zoom rule, because there's no text input involved at all.
export default function SelectRow({ label, value, options, onChange, placeholder = 'Any' }) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  const isPlaceholder = !current || !current.value

  return (
    <>
      <button
        type="button"
        className="select-row"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="select-row-label">{label}</span>
        <span className={`select-row-value${isPlaceholder ? ' placeholder' : ''}`}>
          {current ? current.label : placeholder}
        </span>
        <ChevronRight size={16} className="select-row-chevron" aria-hidden="true" />
      </button>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          {options.map((o) => (
            <button
              key={o.value}
              className="sheet-item"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.value === value ? <Check size={20} /> : <span className="sheet-item-spacer" />}
              {o.label}
            </button>
          ))}
        </Sheet>
      )}
    </>
  )
}
