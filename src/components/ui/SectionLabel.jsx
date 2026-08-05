// The uppercase tracked label above a grouped inset list.
//
// It renders an <h2> rather than the <div> this used to be in 54 places. That
// was the app's only structural problem for a screen reader: one <h1> per page
// and then a completely flat document, with nothing to navigate by. The visual
// treatment is unchanged (the CSS resets the heading's size and weight).
//
// `action` puts a trailing control on the same line — a count, a "See all", an
// "+ Add" — which several screens were hand-assembling with their own flex row.
export default function SectionLabel({ children, action, className = '' }) {
  return (
    <h2 className={`section-label ${action ? 'section-label-row' : ''} ${className}`.trim()}>
      <span>{children}</span>
      {action}
    </h2>
  )
}
