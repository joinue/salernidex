import { useEffect, useState } from 'react'
import { DownloadCloud, LogOut, Settings } from 'react-feather'
import Avatar from '../ui/Avatar'
import ThemeToggle from '../ui/ThemeToggle'
import { AccountContext } from './accountContext'

// You, top right, on every top-level page — and behind you the four things that
// are about your account rather than your household's stuff: Settings, Import /
// Export, the theme, and Logout.
//
// They were in the nav drawer, at the bottom, which put the least-used and most
// destructive items in the easiest place to hit with a thumb. The red Logout sat
// one row above the Close button. Rare and damaging belongs in the corner that's
// hardest to reach by accident, and that corner is up here.
//
// So this must be a POPOVER, not an ActionSheet. A bottom sheet would slide those
// same four items back into the thumb zone and undo the entire point.
//
// The avatar itself needs nothing new: migration 0025 gave every member a self
// contact card, whose photo is the member's avatar, and useHousehold already
// joins it in. No linked contact (or demo) falls back to the monogram every other
// Avatar in the app falls back to.

export function AccountProvider({ value, children }) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export default function AccountMenu({ name, avatarUrl, onSettings, onImport, onLogout }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const item = (fn) => () => {
    setOpen(false)
    fn?.()
  }

  return (
    <div className="account-wrap">
      <button
        className="account-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name ? `Account: ${name}` : 'Account'}
      >
        <Avatar name={name || 'You'} src={avatarUrl} size={30} kind="person" />
      </button>

      {open && (
        <>
          {/* Same backdrop the title menu uses: a tap anywhere else closes it,
              without the popover having to guess at outside-click detection. */}
          <button
            className="title-menu-backdrop"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="account-popover" role="menu">
            {name && <div className="account-who">{name}</div>}
            <button className="account-item" role="menuitem" onClick={item(onSettings)}>
              <Settings size={17} aria-hidden="true" /> Settings
            </button>
            <button className="account-item" role="menuitem" onClick={item(onImport)}>
              <DownloadCloud size={17} aria-hidden="true" /> Import / Export
            </button>
            {/* Cycles system → light → dark in place, so it belongs in the list
                rather than behind another step. */}
            <ThemeToggle className="account-item" iconSize={17} />
            <div className="account-divider" />
            {/* Last, and the only red thing here. It keeps the confirm dialog it
                already had — this menu makes it harder to hit by accident, it
                doesn't make it safe to hit. */}
            <button className="account-item danger" role="menuitem" onClick={item(onLogout)}>
              <LogOut size={17} aria-hidden="true" /> Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
