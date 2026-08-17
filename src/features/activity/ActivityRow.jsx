import { Bell, CheckCircle, CheckSquare, Edit3, FileText, Folder, List } from 'react-feather'
import { relativeTime } from '../../lib/contact'
import { actorLabel, assigneeLabel } from '../../lib/household'
import { INTERACTION_BY_ID } from '../../lib/constants'
import { logLabel } from '../../lib/habits'
import Avatar from '../../components/ui/Avatar'
import PressableRow from '../../components/ui/PressableRow'
import { HabitDot } from '../habits/HabitRow'

// What a 'change' entry looks like per entity: the icon, and the noun the line
// uses. "Added a reminder" is the sentence worth reading; "added a task" for a
// row that happens to be a reminder is not.
const CHANGE = {
  task: { icon: CheckSquare, noun: 'task' },
  project: { icon: Folder, noun: 'project' },
  reminder: { icon: Bell, noun: 'reminder' },
  note: { icon: FileText, noun: 'note' },
  list: { icon: List, noun: 'list' },
}

// One line in the household-activity feed. Renders a touchpoint, a task
// completion, a habit check-in, list activity, or something made or edited (see
// lib/activity). Tapping navigates to the relevant place; touchpoints also
// support a long-press menu.
export default function ActivityRow({
  entry: e,
  onOpenPerson,
  onOpenList,
  onOpenTasks,
  onOpenHabit,
  onOpenChange,
  onPersonLongPress,
}) {
  if (e.kind === 'change') {
    const meta = CHANGE[e.entity] || CHANGE.task
    const Icon = e.action === 'edited' ? Edit3 : meta.icon
    // Same rule the list rows follow: no actor, no " · " — naming nobody beats
    // naming the wrong person on a feed the whole household reads.
    const who = actorLabel(e.by)
    // A collapsed burst (see COLLAPSE_AT in lib/activity) reports the count
    // rather than a name, because there isn't one thing it happened to.
    const many = e.count > 1
    return (
      <PressableRow key={e.key} onClick={onOpenChange ? () => onOpenChange(e) : undefined}>
        <span className="feed-change">
          <Icon size={18} />
        </span>
        <div className="row-body">
          <div className="row-title">{many ? `${e.count} new ${meta.noun}s` : e.title}</div>
          <div className="row-sub">
            {many
              ? 'Added'
              : e.action === 'edited'
                ? `Edited this ${meta.noun}`
                : `Added a ${meta.noun}`}
            {who ? ` · ${who}` : ''}
          </div>
        </div>
        <span className="row-time">{relativeTime(e.ts)}</span>
      </PressableRow>
    )
  }
  if (e.kind === 'completion') {
    return (
      <PressableRow key={e.key} onClick={onOpenTasks}>
        <span className="feed-check">
          <CheckCircle size={20} />
        </span>
        <div className="row-body">
          <div className="row-title">{e.task.title}</div>
          <div className="row-sub">Completed{e.by ? ` · ${assigneeLabel(e.by)}` : ''}</div>
        </div>
        <span className="row-time">{relativeTime(e.ts)}</span>
      </PressableRow>
    )
  }
  if (e.kind === 'habit') {
    return (
      <PressableRow key={e.key} onClick={onOpenHabit ? () => onOpenHabit(e.habit.id) : undefined}>
        <HabitDot habit={e.habit} />
        <div className="row-body">
          <div className="row-title">{e.habit.name}</div>
          <div className="row-sub">
            {logLabel(e.habit, e.value)}
            {e.note ? ` · ${e.note}` : ''}
          </div>
        </div>
        <span className="row-time">{relativeTime(e.ts)}</span>
      </PressableRow>
    )
  }
  if (e.kind === 'list') {
    // Same " · Name" shape as a completion above. Dropped entirely when the
    // actor is unknown (a row from before the columns were written, or a member
    // since removed) — "Added grout sealer · " reads as a bug, and naming the
    // wrong person on a shared feed is worse than naming nobody.
    const who = actorLabel(e.by)
    return (
      <PressableRow key={e.key} onClick={() => onOpenList(e.list.id)}>
        <span
          className="list-emoji"
          style={e.list.color ? { background: e.list.color } : undefined}
        >
          {e.list.icon || '📝'}
        </span>
        <div className="row-body">
          <div className="row-title">{e.list.name}</div>
          <div className="row-sub">
            {e.action === 'checked' ? `Checked off ${e.text}` : `Added ${e.text}`}
            {who ? ` · ${who}` : ''}
          </div>
        </div>
        <span className="row-time">{relativeTime(e.ts)}</span>
      </PressableRow>
    )
  }
  const meta = INTERACTION_BY_ID[e.it.type] || INTERACTION_BY_ID.note
  return (
    <PressableRow
      key={e.key}
      onClick={() => onOpenPerson(e.person.id)}
      onLongPress={onPersonLongPress ? () => onPersonLongPress(e.person) : undefined}
    >
      <Avatar name={e.person.name} src={e.person.avatar_url} size={38} />
      <div className="row-body">
        <div className="row-title">{e.person.name}</div>
        <div className="row-sub">
          {meta.label}
          {e.it.note ? ` · ${e.it.note}` : ''}
        </div>
      </div>
      <span className="row-time">{relativeTime(e.ts)}</span>
    </PressableRow>
  )
}
