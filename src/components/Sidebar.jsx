import { Home, Users as PeopleIcon, CheckSquare, List, Briefcase, Users, Share2, DownloadCloud, Settings, LogOut } from 'react-feather'
import ThemeToggle from './ThemeToggle'

// Desktop sidebar — pure destinations, grouped by domain. "Today / Tasks / Lists"
// is the daily household side; "Network" is the rolodex (people and how they
// connect); "System" is housekeeping. Adds live on each page's header, not here.
export default function Sidebar({ active, go, onLogout }) {
  const Item = ({ id, icon: Icon, text, onClick }) => (
    <button
      className={`nav-item ${active === id ? 'active' : ''}`}
      onClick={onClick || (() => go(id === 'today' ? '' : id))}
      title={text}
    >
      <Icon size={18} />
      <span className="nav-text">{text}</span>
    </button>
  )

  return (
    <nav className="sidebar">
      <div className="brand">
        <img className="brand-mark" src="/logo-mark.png" alt="" width="28" height="28" />
        <span>Salernidex</span>
      </div>

      <Item id="today" icon={Home} text="Today" />
      <Item id="tasks" icon={CheckSquare} text="Tasks" />
      <Item id="lists" icon={List} text="Lists" />

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
