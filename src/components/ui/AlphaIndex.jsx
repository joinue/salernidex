import { useRef } from 'react'
import { ALPHABET } from '../../lib/search'

// The Apple-Contacts-style A–Z scrubber pinned to the right edge of the People
// list. Always shows the full alphabet; letters with no contacts are dimmed but
// still tappable (they jump to the nearest following section). Tap or drag a
// finger down the strip to fly through the list.
export default function AlphaIndex({ present, onJump }) {
  const lastLetter = useRef(null)

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

  return (
    <div
      className="alpha-index"
      onTouchStart={(e) => {
        lastLetter.current = null
        jumpAt(e.touches[0].clientX, e.touches[0].clientY)
      }}
      onTouchMove={(e) => {
        e.preventDefault()
        jumpAt(e.touches[0].clientX, e.touches[0].clientY)
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
