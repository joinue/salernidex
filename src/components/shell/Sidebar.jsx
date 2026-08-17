import { Fragment, useEffect, useState } from 'react'
import { LogOut, Search, ChevronsLeft, ChevronsRight } from 'react-feather'
import ThemeToggle from '../ui/ThemeToggle'
import Wordmark from '../ui/Wordmark'
import { isEditableTarget } from '../../lib/keys'
import { destinationGroups } from '../../lib/nav'
import NAV_ICONS from './navIcons'

const isMac = /Mac/.test(navigator.platform)
const COLLAPSE_KEY = 'salernidex-sidebar-collapsed'

// Desktop sidebar — pure destinations, grouped by domain. "Today / Tasks / Lists"
// is the daily household side; "Network" is the rolodex (people and how they
// connect); "System" is housekeeping. Adds live on each page's header, not here.
// Today's badge is red (needs attention); other counts are quiet gray (volume).
//
// Collapsed it becomes a 64px icon rail: labels and quiet counts drop away, the
// red attention badge rides the icon, and every button keeps its title tooltip
// so the destination is still nameable. The choice sticks per device
// (localStorage) and toggles with ⌘B / Ctrl+B.
export default function Sidebar({ active, go, onSearch, onLogout, badge = 0, counts = {} }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* private mode — the sidebar still toggles, it just won't persist */
    }
  }, [collapsed])

  useEffect(() => {
    const onKey = (e) => {
      // Never inside a text field: ⌘B there means bold, which the note editor
      // gets from contentEditable and we would otherwise preventDefault away.
      if (isEditableTarget(e.target)) return
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setCollapsed((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const Item = ({ id, icon: Icon, text, onClick, count = 0, quiet = false }) => (
    <button
      className={`nav-item ${active === id ? 'active' : ''}`}
      onClick={onClick || (() => go(id === 'today' ? '' : id))}
      title={text}
    >
      <Icon size={18} />
      <span className="nav-text">{text}</span>
      {count > 0 && <span className={quiet ? 'nav-count' : 'nav-badge'}>{count}</span>}
    </button>
  )

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <Wordmark className="brand-mark" />
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (${isMac ? '⌘B' : 'Ctrl B'})`}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <button className="nav-search" onClick={onSearch} title="Quick Find">
        <Search size={16} />
        <span className="nav-search-text">Search</span>
        <span className="nav-kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
      </button>

      {/* Destinations come from lib/nav.js, which the mobile drawer reads too —
          they were two hand-maintained lists, and that is how Notes ended up
          with a sidebar entry and no route into it on a phone. A destination
          still pending its route stays out of both. */}
      {/* Fragments, not wrappers: `.sidebar` is a flex column and these buttons
          are its direct children — nesting them a level down would hand the
          spacing to normal flow. */}
      {destinationGroups().map((group) => (
        <Fragment key={group.label || 'main'}>
          {group.label && <div className="nav-group">{group.label}</div>}
          {group.items
            .filter((d) => !d.pending)
            .map((d) => (
              <Item
                key={d.id}
                id={d.id}
                icon={NAV_ICONS[d.icon]}
                text={d.label}
                count={d.badge ? badge : counts[d.count] || 0}
                quiet={!d.badge}
              />
            ))}
        </Fragment>
      ))}

      <div className="spacer" />
      <ThemeToggle />
      <Item id="logout" icon={LogOut} text="Logout" onClick={onLogout} />
    </nav>
  )
}
