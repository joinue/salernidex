import { useState, useEffect, useRef } from 'react'
import { Plus, Search, ChevronDown, Check, Info } from 'react-feather'

// iOS-style large title with up to two trailing round action buttons. The
// `secondaryAction` (if any) sits to the left of the primary `action`.
// `onSearch` (mobile) adds a leading Quick Find button before both.
// `subtitle` shows a quiet count/summary under the title.
//
// When `navOptions` is supplied the title becomes a dropdown (iOS title-menu,
// à la Mail's mailbox switcher) — used by the People hub to switch between
// People / Groups / Organizations / Network without spending nav space.
// `info` (with optional `infoTitle`) adds a small ⓘ next to the title that
// opens an explanatory popover — a lighter touch than a permanent subtitle.
export default function PageHeader({
  title,
  subtitle,
  action,
  actionIcon: ActionIcon = Plus,
  actionLabel,
  secondaryAction,
  secondaryActionIcon: SecondaryIcon,
  secondaryActionLabel,
  onSearch,
  navOptions,
  navActive,
  onNavigate,
  info,
  infoTitle,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoTop, setInfoTop] = useState(0)
  const infoBtnRef = useRef(null)
  const hasMenu = Array.isArray(navOptions) && navOptions.length > 0

  // Center horizontally on the viewport, but pin the top just below the button.
  const toggleInfo = () => {
    setInfoOpen((open) => {
      if (!open && infoBtnRef.current) {
        setInfoTop(infoBtnRef.current.getBoundingClientRect().bottom + 6)
      }
      return !open
    })
  }

  useEffect(() => {
    if (!menuOpen && !infoOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      setInfoOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, infoOpen])

  return (
    <header className="page-header">
      <div className="page-header-text">
        <div className="title-row">
          {hasMenu ? (
            <div className="title-menu-wrap">
              <button
                className="large-title title-menu"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                {title}
                <ChevronDown className="title-menu-chevron" size={20} aria-hidden="true" />
              </button>
              {menuOpen && (
                <>
                  <button
                    className="title-menu-backdrop"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="title-menu-popover" role="menu">
                    {navOptions.map((opt) => (
                      <button
                        key={opt.id}
                        role="menuitemradio"
                        aria-checked={opt.id === navActive}
                        className={`title-menu-item ${opt.id === navActive ? 'active' : ''}`}
                        onClick={() => {
                          setMenuOpen(false)
                          if (opt.id !== navActive) onNavigate(opt.id)
                        }}
                      >
                        <span>{opt.label}</span>
                        {opt.id === navActive && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <h1 className="large-title">{title}</h1>
          )}
          {info && (
            <div className="info-pop-wrap">
              <button
                ref={infoBtnRef}
                className="info-btn"
                onClick={toggleInfo}
                aria-label={infoTitle || 'About this page'}
                aria-expanded={infoOpen}
              >
                <Info size={18} />
              </button>
              {infoOpen && (
                <>
                  <button
                    className="title-menu-backdrop"
                    aria-label="Close"
                    onClick={() => setInfoOpen(false)}
                  />
                  <div className="info-popover" role="dialog" style={{ top: infoTop }}>
                    {infoTitle && <p className="info-popover-title">{infoTitle}</p>}
                    <div className="info-popover-body">{info}</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {(action || secondaryAction || onSearch) && (
        <div className="header-actions">
          {onSearch && (
            <button
              className="header-action neutral"
              onClick={onSearch}
              aria-label="Quick Find"
              title="Quick Find"
            >
              <Search size={20} />
            </button>
          )}
          {secondaryAction && SecondaryIcon && (
            <button
              className="header-action neutral"
              onClick={secondaryAction}
              aria-label={secondaryActionLabel || 'Options'}
              title={secondaryActionLabel}
            >
              <SecondaryIcon size={20} />
            </button>
          )}
          {action && (
            <button
              className="header-action"
              onClick={action}
              aria-label={actionLabel || 'Add'}
              title={actionLabel}
            >
              <ActionIcon size={20} />
            </button>
          )}
        </div>
      )}
    </header>
  )
}
