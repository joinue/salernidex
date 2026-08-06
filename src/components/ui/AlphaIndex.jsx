import { useRef } from 'react'
import { ALPHABET } from '../../lib/search'

// The Apple-Contacts-style A–Z scrubber pinned to the right edge of the People
// list. Always shows the full alphabet; letters with no contacts are dimmed but
// still tappable (they jump to the nearest following section). Tap or drag a
// finger down the strip to fly through the list.
export default function AlphaIndex({ present, onJump }) {
  const lastLetter = useRef(null)
  const scrubbing = useRef(false)

  // Resolve the DOM element under a pointer to its data-letter and jump once
  // per letter crossed (so a drag feels continuous, not jittery).
  const jumpAt = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY)
    const letter = el?.dataset?.letter
    if (letter && letter !== lastLetter.current) {
      lastLetter.current = letter
      onJump(letter)
    }
  }

  // Pointer events, not touch events: the strip is a scrubber for a mouse and a
  // stylus too, and the old touch-only handlers left those inputs with nothing
  // but per-letter clicks. Capture keeps the moves coming once the finger
  // drifts off the 16px-wide strip, which it does constantly.
  //
  // (The scroll suppression that used to live here as preventDefault on
  // onTouchMove never ran — React registers touchmove passively at the root.
  // `touch-action: none` in people-index.css is what actually holds the page
  // still, and it does so for every pointer type.)
  return (
    <div
      className="alpha-index"
      onPointerDown={(e) => {
        if (!e.isPrimary) return
        scrubbing.current = true
        lastLetter.current = null
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        jumpAt(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (!scrubbing.current) return
        jumpAt(e.clientX, e.clientY)
      }}
      onPointerUp={() => {
        scrubbing.current = false
      }}
      onPointerCancel={() => {
        scrubbing.current = false
      }}
      aria-hidden="true"
    >
      {ALPHABET.map((letter) => (
        <button
          key={letter}
          type="button"
          data-letter={letter}
          className={`alpha-index-letter ${present.has(letter) ? '' : 'dim'}`}
          onClick={() => onJump(letter)}
          tabIndex={-1}
        >
          {letter}
        </button>
      ))}
    </div>
  )
}
