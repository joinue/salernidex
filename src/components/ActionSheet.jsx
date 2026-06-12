import Sheet from './Sheet'

// iOS-style action sheet for long-press quick actions. `actions` is
// [{ label, icon, onClick, danger }]. Picking one closes the sheet, then runs.
export default function ActionSheet({ title, actions, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      {actions.map((a) => (
        <button
          key={a.label}
          className={`sheet-item ${a.danger ? 'danger' : ''}`}
          onClick={() => {
            onClose()
            a.onClick()
          }}
        >
          {a.icon && <a.icon size={20} />} {a.label}
        </button>
      ))}
    </Sheet>
  )
}
