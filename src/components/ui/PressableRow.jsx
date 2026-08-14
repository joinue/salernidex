import { useLongPress } from '../../hooks/useLongPress'

const noop = () => {}

// A list row that supports tap (onClick) + press-and-hold (onLongPress) for
// rows that aren't inside a SwipeRow. The long-press click-suppression is
// handled by the hook so a hold doesn't also navigate.
//
// A row that does something on tap has to be reachable by keyboard too, so it
// carries role="button", a tab stop, and Enter/Space — a plain <div onClick> is
// invisible to anyone not using a pointer. It stays a <div> rather than a
// <button> because these rows nest their own controls (a check circle, a delete
// icon), and a button may not contain another button.
//
// Pass `interactive={false}` for a row that only displays (no onClick), so it
// doesn't advertise an action it doesn't have.
export default function PressableRow({
  onClick,
  onLongPress,
  className = 'list-row',
  label,
  interactive = true,
  children,
}) {
  const lp = useLongPress(onLongPress || noop)
  const active = interactive && !!onClick

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Let the row's own controls keep their native keyboard behavior; only
    // claim the key when the row itself is focused.
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    onClick(e)
  }

  return (
    <div
      className={className}
      onClick={onClick}
      {...(active
        ? { role: 'button', tabIndex: 0, onKeyDown, 'aria-label': label || undefined }
        : {})}
      {...lp}
    >
      {children}
    </div>
  )
}
