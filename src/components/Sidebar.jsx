import {
  Home,
  User as PeopleIcon,
  CheckSquare,
  List,
  Activity,
  Briefcase,
  Users,
  Share2,
  DownloadCloud,
  Settings,
  LogOut,
  Search,
} from 'react-feather'
import ThemeToggle from './ThemeToggle'

const isMac = /Mac/.test(navigator.platform)

// Desktop sidebar — pure destinations, grouped by domain. "Today / Tasks / Lists"
// is the daily household side; "Network" is the rolodex (people and how they
// connect); "System" is housekeeping. Adds live on each page's header, not here.
// Today's badge is red (needs attention); other counts are quiet gray (volume).
export default function Sidebar({ active, go, onSearch, onLogout, badge = 0, counts = {} }) {
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
    <nav className="sidebar">
      <div className="brand">
        <img className="brand-mark" src="/logo-mark.png" alt="" width="28" height="28" />
        <span>Salernidex</span>
      </div>

      <button className="nav-search" onClick={onSearch} title="Quick Find">
        <Search size={16} />
        <span className="nav-search-text">Search</span>
        <span className="nav-kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
      </button>

      <Item id="today" icon={Home} text="Today" count={badge} />
      <Item id="tasks" icon={CheckSquare} text="Tasks" count={counts.tasks} quiet />
      <Item id="lists" icon={List} text="Lists" count={counts.lists} quiet />
      <Item id="habits" icon={Activity} text="Habits" />

      <div className="nav-group">Network</div>
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
