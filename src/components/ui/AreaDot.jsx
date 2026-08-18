// Which area a row belongs to, as a quiet ring in the area's own colour.
//
// Only meaningful on All: under a lens every row on screen is in the same area,
// so a column of identical dots would say nothing. Callers resolve the area and
// pass null while a lens is active — the same rule TaskRow's area chip followed
// before this replaced it.
//
// A ring, and LEADING the title, so it can't be read as a SharedDot: that one is
// filled, trails the title, and answers who can see this. Left of the title is
// what this belongs to; right of it is its state. Two dots on one line only work
// if they're told apart at a glance rather than by hovering them.
//
// The colour is only learnable because AreaSwitcher carries the same colour on
// every pill — the rail is this dot's legend. Don't ship one without the other.
export default function AreaDot({ area }) {
  if (!area) return null
  return (
    <span
      className="area-dot"
      style={area.color ? { borderColor: area.color } : undefined}
      // Both, deliberately: `title` is the hover affordance on a desktop, and on
      // a phone there is no hover — so the name has to be in the accessible name
      // or the mark is colour-only, which is no name at all.
      title={area.name}
      role="img"
      aria-label={`In ${area.name}`}
    />
  )
}
