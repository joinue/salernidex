import { useLongPress } from '../../hooks/useLongPress'

const noop = () => {}

// A list row that supports tap (onClick) + press-and-hold (onLongPress) for
// rows that aren't inside a SwipeRow. The long-press click-suppression is
// handled by the hook so a hold doesn't also navigate.
export default function PressableRow({ onClick, onLongPress, className = 'list-row', children }) {
  const lp = useLongPress(onLongPress || noop)
  return (
    <div className={className} onClick={onClick} {...lp}>
      {children}
    </div>
  )
}
