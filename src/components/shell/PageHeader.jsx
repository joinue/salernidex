import { useState, useEffect, useRef } from 'react'
import { Plus, Search, ChevronDown, Check, Info } from 'react-feather'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import IconButton from '../ui/IconButton'

// iOS-style large title with up to two trailing round action buttons. The
// `secondaryAction` (if any) sits to the left of the primary `action`.
// `onSearch` (mobile) adds a leading Quick Find button before both.
// `subtitle` shows a quiet count/summary under the title.
//
// `createAction` is `action`'s sibling for the page's own "new thing" button:
// identical on desktop, but omitted on mobile, where the floating ➕ already
// offers exactly that create from the thumb zone. Passing both a header ➕ and
// a FAB (and, on Tasks, an inline quick-add too) gave three buttons for one
// job. Use plain `action` for anything that isn't a create.
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
  createAction,
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
  const isMobile = useMediaQuery('(max-width: 720px)')
  const primary = action || (isMobile ? undefined : createAction)

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
              <IconButton
                ref={infoBtnRef}
                icon={Info}
                className="info-btn"
                onClick={toggleInfo}
                label={infoTitle || 'About this page'}
                aria-expanded={infoOpen}
              />
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
      {(primary || secondaryAction || onSearch) && (
        <div className="header-actions">
          {onSearch && (
            <IconButton
              icon={Search}
              size="md"
              className="header-action neutral"
              onClick={onSearch}
              label="Quick Find"
            />
          )}
          {secondaryAction && SecondaryIcon && (
            <IconButton
              icon={SecondaryIcon}
              size="md"
              className="header-action neutral"
              onClick={secondaryAction}
              label={secondaryActionLabel || 'Options'}
            />
          )}
          {primary && (
            <IconButton
              icon={ActionIcon}
              size="md"
              variant="accent"
              className="header-action"
              onClick={primary}
              label={actionLabel || 'Add'}
            />
          )}
        </div>
      )}
    </header>
  )
}
