import { useMemo, useState } from 'react'
import { Gift, Calendar, ChevronRight, Sun, MoreHorizontal, Settings } from 'react-feather'
import { upcomingDates } from '../lib/contact'
import { taskBucket } from '../lib/tasks'
import { buildActivityFeed } from '../lib/activity'
import { personActions } from '../lib/personActions'
import haptics from '../lib/haptics'
import Avatar from './Avatar'
import PageHeader from './PageHeader'
import PressableRow from './PressableRow'
import TaskRow from './TaskRow'
import ActivityRow from './ActivityRow'
import ActionSheet from './ActionSheet'
import InteractionForm from './InteractionForm'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const longDate = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

function dateWhen(entry) {
  if (entry.daysUntil === 0) return entry.kind === 'birthday' ? 'Today 🎂' : 'Today'
  if (entry.daysUntil === 1) return 'Tomorrow'
  return `in ${entry.daysUntil}d`
}

// "Turns 36" / "Wedding anniversary · 9 years" / "Retirement party"
function dateSub(entry) {
  if (entry.kind === 'birthday') return entry.turning ? `Turns ${entry.turning}` : 'Birthday'
  return entry.years ? `${entry.label} · ${entry.years} years` : entry.label
}

export default function TodayView({ data, onOpenPerson, onOpenList, onOpenTasks, onOpenActivity, onMore, onSettings }) {
  const { people, addInteraction, tasks, completeTask, keyDates } = data
  const [logPerson, setLogPerson] = useState(null)
  const [actionPerson, setActionPerson] = useState(null)

  const active = useMemo(() => people.filter((p) => !p.deleted_at), [people])

  // Open top-level tasks that are overdue or due today — the household's "do it
  // now" list.
  const dueTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.parent_id && !t.completed_at && ['overdue', 'today'].includes(taskBucket(t)))
        .sort((a, b) => (a.due_date < b.due_date ? -1 : 1)),
    [tasks]
  )

  const toggleTask = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  // Birthdays + key dates (anniversaries etc.) in the next 30 days, merged
  // and soonest first.
  const dates = useMemo(() => upcomingDates(active, keyDates, 30), [active, keyDates])

  // Head of the shared household-activity feed (touchpoints, completed tasks,
  // list activity). The full log lives behind "See all".
  const feed = useMemo(() => buildActivityFeed(data), [data])
  const recent = useMemo(() => feed.slice(0, 6), [feed])

  const nothing = dueTasks.length === 0 && dates.length === 0 && recent.length === 0

  return (
    <div>
      <PageHeader
        title={greeting()}
        subtitle={longDate()}
        action={onMore}
        actionIcon={MoreHorizontal}
        actionLabel="More"
        secondaryAction={onSettings}
        secondaryActionIcon={Settings}
        secondaryActionLabel="Settings"
      />

      {nothing && (
        <div className="empty">
          <Sun size={28} className="empty-icon" />
          You're all caught up. Nothing needs attention today.
        </div>
      )}

      {dueTasks.length > 0 && (
        <>
          <div className="section-label">To-do</div>
          <div className="list">
            {dueTasks.map((t) => (
              <div className="list-row" key={t.id}>
                <TaskRow task={t} onToggle={toggleTask} />
              </div>
            ))}
          </div>
        </>
      )}

      {dates.length > 0 && (
        <>
          <div className="section-label">Dates</div>
          <div className="list">
            {dates.map((entry) => {
              const Icon = entry.kind === 'birthday' ? Gift : Calendar
              return (
                <PressableRow
                  key={entry.kind === 'birthday' ? `b-${entry.person.id}` : entry.keyDate.id}
                  onClick={() => onOpenPerson(entry.person.id)}
                  onLongPress={() => setActionPerson(entry.person)}
                >
                  <Avatar name={entry.person.name} size={42} />
                  <div className="row-body">
                    <div className="row-title">{entry.person.name}</div>
                    <div className="row-sub">
                      <Icon size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                      {dateSub(entry)}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className={`row-time ${entry.daysUntil <= 3 ? 'warn' : ''}`}>{dateWhen(entry)}</span>
                    <ChevronRight size={18} className="row-chevron" />
                  </div>
                </PressableRow>
              )
            })}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <div className="section-head">
            <div className="section-label">Recent activity</div>
            {feed.length > recent.length && (
              <button className="see-all" onClick={onOpenActivity}>See all</button>
            )}
          </div>
          <div className="list">
            {recent.map((e) => (
              <ActivityRow
                key={e.key}
                entry={e}
                onOpenPerson={onOpenPerson}
                onOpenList={onOpenList}
                onOpenTasks={onOpenTasks}
                onPersonLongPress={setActionPerson}
              />
            ))}
          </div>
        </>
      )}

      {actionPerson && (
        <ActionSheet
          title={actionPerson.name}
          actions={personActions(actionPerson, {
            onOpen: onOpenPerson,
            onLog: (p) => setLogPerson(p),
          })}
          onClose={() => setActionPerson(null)}
        />
      )}
      {logPerson && (
        <InteractionForm
          person={logPerson}
          presetType="call"
          onSave={addInteraction}
          onClose={() => setLogPerson(null)}
        />
      )}
    </div>
  )
}
