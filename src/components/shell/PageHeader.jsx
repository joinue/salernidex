import { useState, useEffect, useRef } from 'react'
import { Plus, Search, ChevronDown, Check, Info } from 'react-feather'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import IconButton from '../ui/IconButton'
import AccountMenu from './AccountMenu'
import { useAccount } from './accountContext'
import { useAreaLens } from './areaLensContext'

// iOS-style large title with up to two trailing round action buttons. The
// `secondaryAction` (if any) sits to the left of the primary `action`.
// `onSearch` (mobile) adds a leading Quick Find button before both.
// `subtitle` shows a quiet count/summary under the title.
//
// `actionQuiet` drops the primary action to the same neutral fill the
// secondary one wears. The accent-filled circle is the page's *primary* action;
// a header whose only trailing buttons are destinations (Today: Notes and
// Settings) shouldn't hand that weight to whichever one happens to sit last —
// on Today that painted Settings, the least-used thing on the screen, as the
// brightest control on it.
//
// `createAction` is `action`'s sibling for the page's own "new thing" button:
// identical on desktop, but omitted on mobile, where the floating ➕ already
// offers exactly that create from the thumb zone. Passing both a header ➕ and
// a FAB (and, on Tasks, an inline quick-add too) gave three buttons for one
// job. Use plain `action` for anything that isn't a create.
//
// `filter` is a page-wide scope control (Tasks: whose tasks you're looking at),
// rendered in the gap between the title and the trailing buttons. It belongs on
// the title row because it changes what the title means — "Tasks" answers
// *whose* — and because a filter row under the header scrolls away from the
// thing it's filtering. Keep it to one compact control; anything page-local
// (tag pills) still lives below.
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
  actionQuiet = false,
  secondaryAction,
  secondaryActionIcon: SecondaryIcon,
  secondaryActionLabel,
  onSearch,
  filter,
  navOptions,
  navActive,
  onNavigate,
  info,
  infoTitle,
}) {
  // Read, not passed: fifteen call sites construct a PageHeader, and threading
  // one more prop through all of them is a rule the next screen breaks. Every
  // top-level page gets the account menu by virtue of having a header.
  const account = useAccount()
  // The area lens, on the routes it scopes. Rendered UNDER the title, not above
  // it: the page's identity keeps the top slot, and a filter row that scrolls
  // away with the content has no business outranking it. On desktop the same
  // control lives in the sidebar, which is real persistent chrome — this is its
  // phone form, sitting where the member Segmented and the tag pills already do.
  const areaLens = useAreaLens()
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
    <>
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
        {filter && <div className="header-filter">{filter}</div>}
        {(primary || secondaryAction || onSearch || account) && (
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
                variant={actionQuiet ? undefined : 'accent'}
                className={`header-action ${actionQuiet ? 'neutral' : ''}`}
                onClick={primary}
                label={actionLabel || 'Add'}
              />
            )}
            {/* Furthest right, past the page's own actions: this one is about you,
              not about the page. Rare and destructive things live in the corner
              that's hardest to reach by accident. */}
            {account && <AccountMenu {...account} />}
          </div>
        )}
      </header>
      {areaLens}
    </>
  )
}
