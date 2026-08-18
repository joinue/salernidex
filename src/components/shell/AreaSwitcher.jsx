import { useEffect, useState } from 'react'
import { Grid, ChevronDown, Check } from 'react-feather'
import { ALL_AREAS, visibleAreas, areaById } from '../../lib/areas'

// The lens, in the chrome.
//
// This is the whole point of areas: pick once, and Today / Tasks / Projects /
// Reminders / Lists / Notes / Habits all narrow together and stay narrowed
// across launches. The per-page pill row it replaces made you re-apply the same
// decision on seven screens, which is why work never actually stayed out of a
// Saturday.
//
// Two placements, two shapes, because the two placements pay different rents.
//
// `bar` is the phone form, directly under the page header: a horizontal
// scroller of pills. It stays a scroller on purpose — a fifteenth area costs a
// longer swipe and nothing else, so the cost of having made fifteen is visible
// where it was incurred rather than paid silently in vertical space.
//
// `rail` is the desktop sidebar, and it is the one that degraded. Pills there
// wrapped, so each row of them shoved Today / Tasks / Lists further down a
// 232px column that also has to hold every destination in the app — ten areas
// meant roughly five wrapped rows before you could see where you were going.
// So the rail collapses to a single row naming the ACTIVE lens, and opens a
// menu for the rest. Fixed height, whether you have two areas or thirty.
//
// It reads as a control, not a destination: bordered and chevroned like
// .nav-search above it, because an area is not a place you go — it's which
// slice of every place you're looking at, and a flat row here would read as one
// more nav item.
//
// Renders nothing until an area exists — the same progressive-disclosure rule
// PrivacyField and the member filter follow. Someone who never makes an area
// should never meet the concept.
export default function AreaSwitcher({
  areas,
  userId,
  value = ALL_AREAS,
  onChange,
  counts,
  variant = 'bar',
  onManage,
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const list = visibleAreas(areas, userId)

  // Close if the lens you had open stops existing — a co-member can archive or
  // un-share an area while the menu is on screen, and resolveAreaId in App will
  // quietly move the selection back to All underneath it.
  useEffect(() => {
    if (list.length === 0) setOpen(false)
  }, [list.length])

  if (list.length === 0) return null

  const pick = (id) => () => {
    setOpen(false)
    onChange?.(id)
  }
  const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0

  // Spelled out, because the count sits in its own element: read from the DOM
  // the name would come out "All5". The visible label is still inside the
  // accessible one, which is what voice control needs.
  const nameFor = (label, n) => (n > 0 ? `${label}, ${n} open` : label)

  if (variant === 'rail') {
    // Only from `list`: an area that was archived or un-shared out from under
    // the saved selection must not be nameable here just because the row is
    // still in `areas`.
    const active = areaById(list, value)
    const activeCount = active ? counts?.get(active.id) || 0 : total

    return (
      <div className="area-switcher area-switcher-rail">
        <button
          className="area-lens-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Filter by area: ${active ? active.name : 'All areas'}`}
        >
          {/* The legend for AreaDot, and only when a lens is on. Under All every
              row wears its own colour, so a single dot up here would be a
              colour that stands for nothing. */}
          {active && (
            <span
              className="area-pill-dot"
              style={active.color ? { background: active.color } : undefined}
            />
          )}
          {active?.icon && <span className="area-pill-icon">{active.icon}</span>}
          <span className="area-lens-name">{active ? active.name : 'All areas'}</span>
          {activeCount > 0 && <span className="area-pill-count">{activeCount}</span>}
          <ChevronDown className="area-lens-chevron" size={15} aria-hidden="true" />
        </button>

        {open && (
          <>
            {/* Same backdrop the title and account menus use: a click anywhere
                else closes it, without this having to grow its own
                outside-click detection. */}
            <button
              className="title-menu-backdrop"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <div className="area-lens-popover" role="menu">
              <button
                className={`area-lens-item ${value === ALL_AREAS ? 'on' : ''}`}
                role="menuitemradio"
                aria-checked={value === ALL_AREAS}
                onClick={pick(ALL_AREAS)}
                aria-label={nameFor('All areas', total)}
              >
                <span className="area-lens-item-name">All areas</span>
                {total > 0 && <span className="area-pill-count">{total}</span>}
                {value === ALL_AREAS && <Check size={15} aria-hidden="true" />}
              </button>
              {list.map((a) => {
                const n = counts?.get(a.id) || 0
                return (
                  <button
                    key={a.id}
                    className={`area-lens-item ${value === a.id ? 'on' : ''}`}
                    role="menuitemradio"
                    aria-checked={value === a.id}
                    onClick={pick(a.id)}
                    aria-label={nameFor(a.name, n)}
                  >
                    <span
                      className="area-pill-dot"
                      style={a.color ? { background: a.color } : undefined}
                    />
                    {a.icon && <span className="area-pill-icon">{a.icon}</span>}
                    <span className="area-lens-item-name">{a.name}</span>
                    {n > 0 && <span className="area-pill-count">{n}</span>}
                    {value === a.id && <Check size={15} aria-hidden="true" />}
                  </button>
                )
              })}
              {/* Below a divider rather than among the lenses: everything above
                  picks one, this one leaves. Settings has a pointer to the same
                  screen for when you go looking there instead. */}
              {onManage && (
                <>
                  <div className="area-lens-divider" />
                  <button
                    className="area-lens-item area-lens-manage"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      onManage()
                    }}
                  >
                    <Grid size={14} aria-hidden="true" />
                    <span className="area-lens-item-name">Manage areas</span>
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      className={`area-switcher area-switcher-${variant}`}
      role="group"
      aria-label="Filter by area"
    >
      <button
        className={`area-pill ${value === ALL_AREAS ? 'on' : ''}`}
        onClick={pick(ALL_AREAS)}
        aria-pressed={value === ALL_AREAS}
        aria-label={nameFor('All areas', total)}
      >
        All
        {/* The counts are volume, not attention — quiet, and only when there is
            something to count. */}
        {total > 0 && <span className="area-pill-count">{total}</span>}
      </button>
      {list.map((a) => {
        const n = counts?.get(a.id) || 0
        return (
          <button
            key={a.id}
            className={`area-pill ${value === a.id ? 'on' : ''}`}
            onClick={pick(a.id)}
            aria-pressed={value === a.id}
            title={a.name}
            aria-label={nameFor(a.name, n)}
          >
            {/* The legend for AreaDot. A colour on a task row is only
                learnable if the same colour is somewhere you already look, and
                until now an area's colour lived solely in the manager screen —
                which nobody visits twice. Always shown, icon or not: the dot on
                a row is always a colour, so the pill must always carry one. */}
            <span className="area-pill-dot" style={a.color ? { background: a.color } : undefined} />
            {a.icon && <span className="area-pill-icon">{a.icon}</span>}
            <span className="area-pill-name">{a.name}</span>
            {n > 0 && <span className="area-pill-count">{n}</span>}
          </button>
        )
      })}
      {/* Manage lives at the end of the row rather than in a menu: people tidy
          areas up where they see them, which is the instinct every workspace
          switcher sets. Settings has a pointer to the same screen for when you
          go looking there instead. */}
      {onManage && (
        <button className="area-pill area-pill-manage" onClick={onManage} title="Manage areas">
          <Grid size={13} />
          <span className="area-pill-name">Edit</span>
        </button>
      )}
    </div>
  )
}
