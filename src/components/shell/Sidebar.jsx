import { useEffect, useState } from 'react'
import {
  Home,
  User as PeopleIcon,
  CheckSquare,
  Folder,
  List,
  Activity,
  FileText,
  Briefcase,
  Users,
  Share2,
  DownloadCloud,
  Settings,
  LogOut,
  Search,
  ChevronsLeft,
  ChevronsRight,
} from 'react-feather'
import ThemeToggle from '../ui/ThemeToggle'
import { isEditableTarget } from '../../lib/keys'

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
        <img className="brand-mark" src="/logo-mark.png" alt="" width="28" height="28" />
        <span className="nav-text">Salernidex</span>
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

      <Item id="today" icon={Home} text="Today" count={badge} />
      <Item id="tasks" icon={CheckSquare} text="Tasks" count={counts.tasks} quiet />
      <Item id="projects" icon={Folder} text="Projects" count={counts.projects} quiet />
      <Item id="lists" icon={List} text="Lists" count={counts.lists} quiet />
      <Item id="habits" icon={Activity} text="Habits" />
      <Item id="notes" icon={FileText} text="Notes" />

      <div className="nav-group">Contacts</div>
      <Item id="people" icon={PeopleIcon} text="People" />
      <Item id="relationships" icon={Share2} text="Relationships" />
      <Item id="orgs" icon={Briefcase} text="Organizations" />
      <Item id="groups" icon={Users} text="Groups" />

      <div className="nav-group">System</div>
      <Item id="import" icon={DownloadCloud} text="Import / Export" />
      <Item id="settings" icon={Settings} text="Settings" />

      <div className="spacer" />
      <ThemeToggle />
      <Item id="logout" icon={LogOut} text="Logout" onClick={onLogout} />
    </nav>
  )
}
