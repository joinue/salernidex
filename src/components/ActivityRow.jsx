import { CheckCircle } from 'react-feather'
import { relativeTime } from '../lib/contact'
import { assigneeLabel } from '../lib/household'
import { INTERACTION_BY_ID } from '../lib/constants'
import Avatar from './Avatar'
import PressableRow from './PressableRow'

// One line in the household-activity feed. Renders a touchpoint, a task
// completion, or list activity from a feed entry (see lib/activity). Tapping
// navigates to the relevant place; touchpoints also support a long-press menu.
export default function ActivityRow({
  entry: e,
  onOpenPerson,
  onOpenList,
  onOpenTasks,
  onPersonLongPress,
}) {
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
  if (e.kind === 'list') {
    return (
      <PressableRow key={e.key} onClick={() => onOpenList(e.list.id)}>
        <span className="list-emoji">{e.list.icon || '📝'}</span>
        <div className="row-body">
          <div className="row-title">{e.list.name}</div>
          <div className="row-sub">
            {e.action === 'checked' ? `Checked off ${e.text}` : `Added ${e.text}`}
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
          {e.it.note ? ` — ${e.it.note}` : ''}
        </div>
      </div>
      <span className="row-time">{relativeTime(e.ts)}</span>
    </PressableRow>
  )
}
