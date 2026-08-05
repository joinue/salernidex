// The grouped inset list — the app's one card surface. Rows inside get their
// hairline separators from the CSS, so a screen never re-decides radius,
// padding or divider treatment.
//
//   <Card>{rows.map(…)}</Card>
//   <Card padded>free-form content rather than rows</Card>
//
// `padded` is for a card holding prose or controls instead of `.list-row`s,
// which supply their own padding.
export default function Card({ children, padded = false, className = '', ...rest }) {
  return (
    <div className={`list ${padded ? 'list-padded' : ''} ${className}`.trim()} {...rest}>
      {children}
    </div>
  )
}
