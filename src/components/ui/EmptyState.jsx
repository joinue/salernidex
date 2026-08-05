// The one empty/loading state. Replaces three drifting variants (`.empty`,
// `.empty-inline`, `.empty dots`) that differed only in padding and in whether
// they animated an ellipsis.
//
//   <EmptyState>Nothing here yet.</EmptyState>
//   <EmptyState inline>No tags</EmptyState>
//   <EmptyState loading>Loading</EmptyState>
//   <EmptyState action={<button …>Add one</button>}>No lists yet.</EmptyState>
//
// An empty state that can offer the create it's describing should: a dead end
// with no way forward is the most common way an empty screen goes wrong.
export default function EmptyState({
  children,
  icon: Icon,
  inline = false,
  loading = false,
  action,
}) {
  const cls = ['empty', inline && 'empty-inline', loading && 'dots'].filter(Boolean).join(' ')
  return (
    <div className={cls} role={loading ? 'status' : undefined}>
      {Icon && <Icon size={28} className="empty-icon" aria-hidden="true" />}
      <p>{children}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
