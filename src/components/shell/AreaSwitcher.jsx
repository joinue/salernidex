import { Grid } from 'react-feather'
import { ALL_AREAS, visibleAreas } from '../../lib/areas'

// The lens, in the chrome.
//
// This is the whole point of areas: pick once, and Today / Tasks / Projects /
// Reminders / Lists / Notes / Habits all narrow together and stay narrowed
// across launches. The per-page pill row it replaces made you re-apply the same
// decision on seven screens, which is why work never actually stayed out of a
// Saturday.
//
// Two placements, one component. `rail` is the desktop sidebar, above the
// destinations, because on a wide screen the lens is chrome you want in view.
// `bar` sits directly under the page header on a phone, where there is no
// sidebar to put it in and burying it in the drawer would make a
// several-times-a-day control a two-tap one.
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
  const list = visibleAreas(areas, userId)
  if (list.length === 0) return null

  const pick = (id) => () => onChange?.(id)
  const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0

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
        // Spelled out, because the count sits in its own element: read from the
        // DOM the name would come out "All5". The visible label is still inside
        // the accessible one, which is what voice control needs.
        aria-label={total > 0 ? `All areas, ${total} open` : 'All areas'}
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
            aria-label={n > 0 ? `${a.name}, ${n} open` : a.name}
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
