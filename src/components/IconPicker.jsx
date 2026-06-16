import { useMemo, useState } from 'react'
import { ICON_GROUPS, QUICK_ICONS, ALL_ICONS } from '../lib/icons'

// Emoji picker for habits and lists. Stays compact by default — a single row of
// common glyphs plus a "See more" toggle that expands a searchable, scrollable
// grid of the full catalog. `leading` is an optional slot rendered before the
// glyphs (habits use it for the "no icon, use first letter" button).
export default function IconPicker({ value, onChange, leading = null }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return null
    return ALL_ICONS.filter(
      (i) => i.glyph === q || i.keywords.includes(q) || i.group.toLowerCase().includes(q),
    )
  }, [q])

  const renderPick = (glyph) => (
    <button
      type="button"
      key={glyph}
      className={`icon-pick ${value === glyph ? 'on' : ''}`}
      onClick={() => onChange(glyph)}
      aria-label={`Icon ${glyph}`}
      aria-pressed={value === glyph}
    >
      {glyph}
    </button>
  )

  // Make sure the currently-selected glyph is visible in the collapsed row even
  // if it isn't one of the defaults (e.g. an icon chosen earlier from the grid).
  const quick = QUICK_ICONS.includes(value) || !value ? QUICK_ICONS : [value, ...QUICK_ICONS]

  return (
    <div className="icon-picker">
      <div className="icon-row">
        {leading}
        {quick.map(renderPick)}
        <button
          type="button"
          className={`icon-pick icon-more ${open ? 'on' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Show fewer icons' : 'Show more icons'}
        >
          {open ? '✕' : '⋯'}
        </button>
      </div>

      {open && (
        <div className="icon-more-panel">
          <input
            className="icon-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons…"
            aria-label="Search icons"
          />
          <div className="icon-grid-scroll">
            {matches ? (
              matches.length ? (
                <div className="icon-row">{matches.map((i) => renderPick(i.glyph))}</div>
              ) : (
                <p className="muted icon-empty">No icons match “{query}”.</p>
              )
            ) : (
              ICON_GROUPS.map((g) => (
                <div key={g.name} className="icon-group">
                  <div className="icon-group-label">{g.name}</div>
                  <div className="icon-row">{g.items.map(([glyph]) => renderPick(glyph))}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
