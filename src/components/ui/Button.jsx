// Text buttons, in the three weights the app actually uses:
//
//   primary — the filled blue commit ("Add task", "Save")
//   pill    — a tinted rounded action sitting in a row of siblings
//   text    — quiet, inline, no chrome
//
// `tone="danger"` tints any of them destructive. Destructive actions should
// generally be `text` or `pill`, not `primary`: a filled red button carries the
// same visual weight as the safe action beside it, which is how Archive ended
// up looking as important as Edit on the person page.
export default function Button({
  variant = 'primary',
  tone,
  icon: Icon,
  full = false,
  children,
  className = '',
  ...rest
}) {
  const cls = [
    variant === 'primary' ? 'btn-primary' : variant === 'pill' ? 'pill-btn' : 'text-btn',
    tone === 'danger' && 'danger',
    full && 'btn-full',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} {...rest}>
      {Icon && <Icon size={variant === 'text' ? 14 : 16} aria-hidden="true" />}
      {children}
    </button>
  )
}
