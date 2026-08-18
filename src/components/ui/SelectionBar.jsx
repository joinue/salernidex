import { X } from 'react-feather'
import IconButton from './IconButton'

// The bar that appears while rows are selected: what you picked, on the left,
// and what you can do with it on the right.
//
// It sits over the tab bar rather than above it, which is the iOS pattern and
// also the only honest one — while selecting, the tab bar's destinations aren't
// where you're going, and stacking two bars puts the actions under the thumb's
// reach on a phone.
//
// `actions` is [{ label, icon, onClick, variant }]. A disabled action is left
// out by the caller rather than greyed here: an action that can't apply to the
// current selection has nothing to explain to the user, and a row of dimmed
// buttons reads as the app being broken.
export default function SelectionBar({
  count,
  onCancel,
  onToggleAll,
  allSelected,
  actions = [],
  noun = 'item',
}) {
  const plural = count === 1 ? noun : `${noun}s`
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selection actions">
      <div className="selection-bar-lead">
        {/* `lg` — 44px painted, not the 32px default leaning on .tap-target's
            invisible extension. This is the way OUT of the mode; it is the one
            control here that must never be a near-miss, and audit:mobile's
            modes pass caught it missing on list detail. */}
        <IconButton icon={X} label="Done selecting" size="lg" onClick={onCancel} />
        {/* Announced politely so a screen reader hears the running count
            without the whole bar being re-read on every tick. */}
        <span className="selection-bar-count" aria-live="polite">
          {count} {plural}
        </span>
      </div>
      <div className="selection-bar-actions">
        {onToggleAll && (
          <button type="button" className="text-btn selection-bar-all" onClick={onToggleAll}>
            {allSelected ? 'None' : 'All'}
          </button>
        )}
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`text-btn ${a.variant === 'danger' ? 'danger' : ''}`}
            onClick={a.onClick}
            // The count belongs in the name, not just the bar: "Delete" read on
            // its own gives no sense of how much is about to go.
            aria-label={`${a.label} ${count} ${plural}`}
          >
            {a.icon && <a.icon size={15} aria-hidden="true" />}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
