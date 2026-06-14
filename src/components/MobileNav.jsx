import { useState } from 'react'
import {
  Home,
  User as PeopleIcon,
  CheckSquare,
  List,
  Plus,
  Activity,
  Share2,
  Briefcase,
  UserPlus,
  Users,
} from 'react-feather'
import Sheet from './Sheet'
import { useLongPress } from '../hooks/useLongPress'

// Bottom bar: Today · People · Habits · Tasks · Lists, with a floating ➕ above
// the pill. The FAB is page-aware — a tap creates the obvious thing for the
// current tab; a long-press opens the full add menu so you can cross-create
// from anywhere. (The ➕ used to sit in the bar's center, but adding Habits
// needed that slot, so it floats now.)
export default function MobileNav({ active, adds, badge = 0 }) {
  const {
    go,
    onAddPerson,
    onAddTask,
    onAddList,
    onAddHabit,
    onAddOrg,
    onAddGroup,
    onAddRelationship,
  } = adds
  const [sheet, setSheet] = useState(false)
  const close = () => setSheet(false)
  const pick = (fn) => () => {
    close()
    fn()
  }

  // tap → the primary create for this tab; ambiguous tabs open the menu
  const primary = {
    people: onAddPerson,
    tasks: onAddTask,
    lists: onAddList,
    habits: onAddHabit,
    orgs: onAddOrg,
    groups: onAddGroup,
    relationships: onAddRelationship,
  }[active]
  const onFab = () => (primary ? primary() : setSheet(true))
  const longPress = useLongPress(() => setSheet(true))

  const Tab = ({ id, icon: Icon, text, count = 0 }) => (
    <button
      className={`tab ${active === id ? 'active' : ''}`}
      onClick={() => go(id === 'today' ? '' : id)}
    >
      <Icon size={22} />
      <span>{text}</span>
      {count > 0 && <span className="tab-badge">{count}</span>}
    </button>
  )

  return (
    <>
      <button className="fab" onClick={onFab} aria-label="Add" {...longPress}>
        <Plus size={26} />
      </button>

      <nav className="tabbar">
        <Tab id="today" icon={Home} text="Today" count={badge} />
        <Tab id="people" icon={PeopleIcon} text="People" />
        <Tab id="habits" icon={Activity} text="Habits" />
        <Tab id="tasks" icon={CheckSquare} text="Tasks" />
        <Tab id="lists" icon={List} text="Lists" />
      </nav>

      {sheet && (
        <Sheet title="Add" onClose={close}>
          <button className="sheet-item" onClick={pick(onAddPerson)}>
            <UserPlus size={20} /> Person
          </button>
          <button className="sheet-item" onClick={pick(onAddTask)}>
            <CheckSquare size={20} /> Task
          </button>
          <button className="sheet-item" onClick={pick(onAddList)}>
            <List size={20} /> List
          </button>
          <button className="sheet-item" onClick={pick(onAddHabit)}>
            <Activity size={20} /> Habit
          </button>
          <button className="sheet-item" onClick={pick(onAddOrg)}>
            <Briefcase size={20} /> Organization
          </button>
          <button className="sheet-item" onClick={pick(onAddRelationship)}>
            <Share2 size={20} /> Relationship
          </button>
          <button className="sheet-item" onClick={pick(onAddGroup)}>
            <Users size={20} /> Group
          </button>
        </Sheet>
      )}
    </>
  )
}
