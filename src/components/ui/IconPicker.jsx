import { useMemo, useState } from 'react'
import { Search } from 'react-feather'
import Sheet from './Sheet'
import { ICON_GROUPS, QUICK_ICONS, ALL_ICONS } from '../../lib/icons'
import { focusOnDesktop } from '../../lib/constants'

// Emoji picker for areas, habits and lists. A single row of common glyphs, plus
// a "⋯" that opens the full searchable catalog.
//
// The catalog is its own Sheet, not a panel that unfolds inside the form. It
// used to be the latter, and that is the shape this whole file exists to avoid:
// a scrolling section nested inside a scrolling sheet, with a text field in it.
//
//   • Two scrollers, one inside the other. Flicking past the end of the icon
//     grid chained into the form behind it and dragged the whole sheet.
//   • The panel's own 220px cap didn't know about the keyboard. Focus the
//     search field on a phone and the form sheet shrinks to what's left above
//     the keyboard — often less than the panel — so the grid you were typing at
//     was the part that got cut.
//   • 250px of content appeared mid-form, shoving the colour swatches and four
//     switches down the page while you were looking somewhere else.
//   • The field sat inside the form's <form>, so the keyboard's Go key
//     submitted it. Searching for a bin icon created the area.
//
// A sheet answers all four at once: one scroller, resting on top of the
// keyboard because Sheet clamps itself to the visual viewport, the form behind
// it untouched, and — being portaled to <body> — outside the form element
// entirely, so there is nothing for Go to submit.
//
// `leading` is an optional slot rendered before the glyphs (habits use it for
// the "no icon, use first letter" button).
export default function IconPicker({ value, onChange, leading = null }) {
  const [browsing, setBrowsing] = useState(false)

  // Make sure the currently-selected glyph is visible in the compact row even
  // if it isn't one of the defaults (e.g. an icon chosen earlier from the
  // catalog) — otherwise picking one appears to do nothing once the sheet
  // closes.
  const quick = QUICK_ICONS.includes(value) || !value ? QUICK_ICONS : [value, ...QUICK_ICONS]

  return (
    <div className="icon-picker">
      <div className="icon-row">
        {leading}
        {quick.map((glyph) => (
          <IconPick key={glyph} glyph={glyph} selected={value === glyph} onPick={onChange} />
        ))}
        <button
          type="button"
          className="icon-pick icon-more"
          onClick={() => setBrowsing(true)}
          aria-haspopup="dialog"
          aria-label="Browse all icons"
        >
          ⋯
        </button>
      </div>

      {browsing && (
        <IconCatalog
          value={value}
          onPick={(glyph) => {
            onChange(glyph)
            setBrowsing(false)
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  )
}

function IconPick({ glyph, selected, onPick }) {
  return (
    <button
      type="button"
      className={`icon-pick ${selected ? 'on' : ''}`}
      onClick={() => onPick(glyph)}
      aria-label={`Icon ${glyph}`}
      aria-pressed={selected}
    >
      {glyph}
    </button>
  )
}

// The full catalog: search at the top, then the groups. The sheet's own body is
// the only scroller, which is what lets Sheet's pull-to-dismiss keep working —
// it engages at scrollTop 0, and a nested scroller has no scrollTop it can read.
function IconCatalog({ value, onPick, onClose }) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return null
    return ALL_ICONS.filter(
      (i) => i.glyph === q || i.keywords.includes(q) || i.group.toLowerCase().includes(q),
    )
  }, [q])

  const pick = (glyph) => (
    <IconPick key={glyph} glyph={glyph} selected={value === glyph} onPick={onPick} />
  )

  return (
    <Sheet title="Choose an icon" onClose={onClose}>
      {/* Sticky, so the field and the results it filters stay on screen
          together. With the keyboard up the sheet is only as tall as what's
          left above it, and a search field that scrolls away takes with it the
          ability to fix a typo. */}
      <div className="sheet-search">
        <div className="search-wrap">
          <Search size={16} />
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons…"
            aria-label="Search icons"
            // Phones don't get the keyboard on open — you came to look at 76
            // glyphs, and summoning it would cover most of them. Tap the field
            // and the sheet settles onto the keyboard; desktop types straight
            // away. Same rule as every form sheet in the app.
            autoFocus={focusOnDesktop()}
            // There's nothing to submit, so the return key's job is to get out
            // of the way and give the grid its height back.
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        </div>
      </div>

      <div className="icon-catalog">
        {matches ? (
          matches.length ? (
            <div className="icon-row">{matches.map((i) => pick(i.glyph))}</div>
          ) : (
            <p className="muted icon-empty">No icons match “{query}”.</p>
          )
        ) : (
          ICON_GROUPS.map((g) => (
            <div key={g.name} className="icon-group">
              <div className="icon-group-label">{g.name}</div>
              <div className="icon-row">{g.items.map(([glyph]) => pick(glyph))}</div>
            </div>
          ))
        )}
      </div>
    </Sheet>
  )
}
