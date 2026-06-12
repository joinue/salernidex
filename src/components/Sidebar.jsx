import { Search, UserPlus, Briefcase, Users, Share2, DownloadCloud, LogOut } from 'react-feather'
import ThemeToggle from './ThemeToggle'

export default function Sidebar({ active, go, onAddPerson, onAddOrg, onLogout }) {
  const Item = ({ id, icon: Icon, text, onClick }) => (
    <button
      className={`nav-item ${active === id ? 'active' : ''}`}
      onClick={onClick || (() => go(id === 'search' ? '' : id))}
      title={text}
    >
      <Icon size={18} />
      <span className="nav-text">{text}</span>
    </button>
  )

  return (
    <nav className="sidebar">
      <div className="brand">Salernidex</div>
      <Item id="search" icon={Search} text="Search" />
      <Item id="add-person" icon={UserPlus} text="Add Person" onClick={onAddPerson} />
      <Item id="orgs" icon={Briefcase} text="Organizations" />
      <Item id="groups" icon={Users} text="Groups" />
      <Item id="relationships" icon={Share2} text="Relationships" />
      <Item id="import" icon={DownloadCloud} text="Import / Export" />
      <div className="spacer" />
      <ThemeToggle />
      <Item id="logout" icon={LogOut} text="Logout" onClick={onLogout} />
    </nav>
  )
}
