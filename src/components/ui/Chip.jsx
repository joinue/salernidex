import { X } from 'react-feather'

// The small rounded token: a tag, a due date, an assignee, a status. Tone
// carries the meaning, so a screen picks a tone rather than reaching for a
// colour.
//
//   <Chip>home</Chip>
//   <Chip tone="danger">2d overdue</Chip>
//   <Chip tone="accent" onRemove={…}>work</Chip>
//
// `onRemove` renders the ✕ affordance (tag editors); `onClick` makes the whole
// chip a toggle (filter rows). A chip with neither is a read-only marker and
// renders as a <span>, so it isn't in the tab order.
export default function Chip({
  children,
  tone = 'neutral',
  icon: Icon,
  onClick,
  onRemove,
  active = false,
  className = '',
  ...rest
}) {
  const cls = ['chip', tone !== 'neutral' && `chip-${tone}`, active && 'active', className]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </>
  )

  if (onRemove) {
    return (
      <span className={`${cls} chip-removable`} {...rest}>
        {inner}
        <button
          type="button"
          className="chip-x"
          onClick={onRemove}
          aria-label={`Remove ${children}`}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </span>
    )
  }

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={active} {...rest}>
        {inner}
      </button>
    )
  }

  return (
    <span className={cls} {...rest}>
      {inner}
    </span>
  )
}
