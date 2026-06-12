import { Plus } from 'react-feather'

// iOS-style large title with up to two trailing round action buttons. The
// `secondaryAction` (if any) sits to the left of the primary `action`.
// `subtitle` shows a quiet count/summary under the title.
export default function PageHeader({
  title,
  subtitle,
  action,
  actionIcon: ActionIcon = Plus,
  actionLabel,
  secondaryAction,
  secondaryActionIcon: SecondaryIcon,
  secondaryActionLabel,
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1 className="large-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="header-actions">
          {secondaryAction && SecondaryIcon && (
            <button className="header-action neutral" onClick={secondaryAction} aria-label={secondaryActionLabel || 'Options'} title={secondaryActionLabel}>
              <SecondaryIcon size={20} />
            </button>
          )}
          {action && (
            <button className="header-action" onClick={action} aria-label={actionLabel || 'Add'} title={actionLabel}>
              <ActionIcon size={20} />
            </button>
          )}
        </div>
      )}
    </header>
  )
}
