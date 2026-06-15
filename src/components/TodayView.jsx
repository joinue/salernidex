import { useMemo, useState } from 'react'
import {
  Gift,
  Calendar,
  ChevronRight,
  Sun,
  Settings,
  MessageCircle,
  Clock,
  BellOff,
  Check,
  Search,
  SkipForward,
} from 'react-feather'
import { relativeTime } from '../lib/contact'
import { dueLabel } from '../lib/tasks'
import { buildAttention } from '../lib/reminders'
import { buildActivityFeed } from '../lib/activity'
import { personActions } from '../lib/personActions'
import {
  entryMap,
  valueOn,
  isScheduled,
  isSkipped,
  isWeekly,
  weekProgress,
  toISODate,
} from '../lib/habits'
import { byOrder } from '../lib/order'
import HabitQuickLog from './HabitQuickLog'
import { useNotificationPrefs } from '../hooks/useNotificationPrefs'
import { useNow } from '../hooks/useNow'
import haptics from '../lib/haptics'
import Avatar from './Avatar'
import ProfileNudge from './ProfileNudge'
import PageHeader from './PageHeader'
import SwipeRow from './SwipeRow'
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

// Warm, human phrasing — this is staying close to people, not working a
// pipeline. Never "overdue", never "cadence".
function checkInSub(item) {
  if (item.state === 'never') return 'No catch-ups logged yet — say hi'
  return `It's been a while · last catch-up ${relativeTime(item.lastIso)}`
}

const DAY = 86400000

export default function TodayView({
  data,
  onOpenPerson,
  onOpenList,
  onOpenTasks,
  onOpenProject,
  onOpenActivity,
  onSettings,
  onSearch,
  onOpenHabits,
  household,
}) {
  const {
    addInteraction,
    completeTask,
    skipTaskOccurrence,
    snoozeReminder,
    memberId,
    habitEntries,
    logHabit,
  } = data
  const [prefs] = useNotificationPrefs(memberId)
  // Keep greetings, the date, and relative/overdue labels fresh on a wall-
  // mounted tablet that may run for days without a reload.
  const now = useNow()
  // Habits the user pinned to Today, that are scheduled for today. (useNow gives
  // a timestamp number, so wrap it in a Date for the date-aware habit helpers.)
  const nowDate = new Date(now)
  const todayISO = toISODate(nowDate)
  const habitMap = useMemo(() => entryMap(habitEntries), [habitEntries])
  const todayHabits = (data.habits || [])
    .filter((h) => h.show_on_today && !h.archived_at && isScheduled(h, nowDate))
    // A rest day (or a vacation, which rests the span) drops the habit off Today.
    .filter((h) => !isSkipped(h, todayISO, habitMap))
    // Weekly habits drop off Today once the week's target is met.
    .filter((h) => {
      if (!isWeekly(h)) return true
      const wp = weekProgress(h, habitMap, nowDate)
      return wp.count < wp.target
    })
    .sort(byOrder)
  const [logPerson, setLogPerson] = useState(null)
  const [actionPerson, setActionPerson] = useState(null)
  const [laterItem, setLaterItem] = useState(null) // attention item picking a snooze

  const attention = useMemo(
    () => buildAttention(data, prefs, data.reminderSnoozes, memberId, now),
    // Granular deps on purpose: `data` is a fresh object every render; these are
    // the fields buildAttention actually reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data.people,
      data.tasks,
      data.lists,
      data.interactions,
      data.keyDates,
      data.reminderSnoozes,
      prefs,
      memberId,
      now,
    ],
  )
  const dueTasks = attention.filter((i) => i.kind === 'task')
  const dueLists = attention.filter((i) => i.kind === 'list')
  const checkIns = attention.filter((i) => i.kind === 'nudge')
  const dates = attention.filter((i) => i.kind === 'date')

  const toggleTask = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  // Head of the shared household-activity feed (touchpoints, completed tasks,
  // list activity). The full log lives behind "See all".
  const feed = useMemo(() => buildActivityFeed(data), [data])
  const recent = useMemo(() => feed.slice(0, 6), [feed])

  const nothing = attention.length === 0 && recent.length === 0 && todayHabits.length === 0

  // Swipe action: "Later" → sheet with gentle snooze choices.
  const later = (item) => ({ label: 'Later', icon: Clock, onClick: () => setLaterItem(item) })

  // "We're caught up, nothing worth logging" — quiets the check-in for one
  // full cadence cycle without inventing a touchpoint.
  const clearCheckIn = (item) => {
    const days = item.person.keep_in_touch_days || 30
    haptics.light()
    snoozeReminder({
      kind: 'nudge',
      target_key: item.key,
      until: new Date(Date.now() + days * DAY).toISOString(),
    })
  }

  const snoozeChoices = laterItem && [
    // Recurring task: skip just this occurrence (rolls to the next date) without
    // logging it done. Sits above the snoozes — it's the more decisive choice.
    ...(laterItem.kind === 'task' && laterItem.task?.recurrence
      ? [
          {
            label: 'Skip this one',
            icon: SkipForward,
            onClick: () => {
              haptics.light()
              skipTaskOccurrence(laterItem.task)
            },
          },
        ]
      : []),
    {
      label: 'Remind me in 3 days',
      icon: Clock,
      onClick: () =>
        snoozeReminder({
          kind: laterItem.kind,
          target_key: laterItem.key,
          until: new Date(Date.now() + 3 * DAY).toISOString(),
        }),
    },
    {
      label: 'Remind me next week',
      icon: Clock,
      onClick: () =>
        snoozeReminder({
          kind: laterItem.kind,
          target_key: laterItem.key,
          until: new Date(Date.now() + 7 * DAY).toISOString(),
        }),
    },
    {
      label: "Don't remind me about this",
      icon: BellOff,
      danger: true,
      onClick: () =>
        snoozeReminder({ kind: laterItem.kind, target_key: laterItem.key, until: null }),
    },
  ]

  return (
    <div>
      <PageHeader
        title={greeting()}
        subtitle={longDate()}
        action={onSettings}
        actionIcon={Settings}
        actionLabel="Settings"
      />

      {/* iOS-style search bar under the large title — opens Quick Find.
          Keeps the header to two quiet actions instead of squeezing three. */}
      {onSearch && (
        <button className="search-bar-btn" onClick={onSearch} aria-label="Quick Find">
          <Search size={16} />
          Search
        </button>
      )}

      {household && <ProfileNudge household={household} />}

      {nothing && (
        <div className="empty">
          <Sun size={28} className="empty-icon" />
          You're all caught up. Nothing needs attention today.
        </div>
      )}

      {/* On wide screens (landscape iPad / desktop) these sections flow into
          two columns so the dashboard fills the width instead of leaving a
          tall empty gutter; portrait and phone stay single-column. */}
      <div className="today-dashboard">
        {todayHabits.length > 0 && (
          <section className="today-section">
            <div className="section-label">Habits</div>
            <div className="list">
              {todayHabits.map((h) => (
                <div className="list-row today-habit" key={h.id} onClick={() => onOpenHabits?.()}>
                  <span
                    className={`habit-dot ${h.icon ? 'emoji' : ''}`}
                    style={{ background: h.color || 'var(--accent)' }}
                  >
                    {h.icon || h.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="row-body">
                    <div className="row-title">{h.name}</div>
                    {isWeekly(h) && (
                      <div className="row-sub">
                        {weekProgress(h, habitMap, nowDate).count}/{h.weekly_target} this week
                      </div>
                    )}
                  </div>
                  <HabitQuickLog
                    habit={h}
                    value={valueOn(h, todayISO, habitMap)}
                    onLog={(v) => logHabit(h.id, todayISO, v)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {dueTasks.length > 0 && (
          <section className="today-section">
            <div className="section-label">To-do</div>
            <div className="list">
              {dueTasks.map((item) => (
                <SwipeRow
                  key={item.key}
                  actions={[later(item)]}
                  onClick={item.project ? () => onOpenProject?.(item.project.id) : undefined}
                >
                  <div className="list-row">
                    <TaskRow
                      task={item.task}
                      onToggle={toggleTask}
                      breadcrumb={item.project?.title || null}
                    />
                  </div>
                </SwipeRow>
              ))}
            </div>
          </section>
        )}

        {dueLists.length > 0 && (
          <section className="today-section">
            <div className="section-label">Lists</div>
            <div className="list">
              {dueLists.map((item) => {
                const l = item.list
                const left = (data.listItems || []).filter(
                  (it) => it.list_id === l.id && !it.checked_at,
                ).length
                return (
                  <SwipeRow key={item.key} actions={[later(item)]} onClick={() => onOpenList(l.id)}>
                    <div className="list-row">
                      <span className="list-emoji">{l.icon || '📝'}</span>
                      <div className="row-body">
                        <div className="row-title">{l.name}</div>
                        <div className="row-sub">
                          {left ? `${left} item${left === 1 ? '' : 's'} left` : 'All done'}
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className="row-time warn">{dueLabel(l.due_date)}</span>
                        <ChevronRight size={18} className="row-chevron" />
                      </div>
                    </div>
                  </SwipeRow>
                )
              })}
            </div>
          </section>
        )}

        {checkIns.length > 0 && (
          <section className="today-section">
            <div className="section-label">Check in</div>
            <div className="list">
              {checkIns.map((item) => (
                <SwipeRow
                  key={item.key}
                  actions={[
                    {
                      label: 'Check in',
                      icon: MessageCircle,
                      onClick: () => setLogPerson(item.person),
                    },
                    {
                      label: 'Clear',
                      icon: Check,
                      variant: 'neutral',
                      onClick: () => clearCheckIn(item),
                    },
                    later(item),
                  ]}
                  onClick={() => onOpenPerson(item.person.id)}
                  onLongPress={() => setActionPerson(item.person)}
                >
                  <div className="list-row">
                    <Avatar name={item.person.name} size={42} />
                    <div className="row-body">
                      <div className="row-title">{item.person.name}</div>
                      <div className="row-sub">{checkInSub(item)}</div>
                    </div>
                    <div className="row-meta">
                      <button
                        className="icon-btn accent touch-quick"
                        aria-label={`Check in with ${item.person.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setLogPerson(item.person)
                        }}
                      >
                        <MessageCircle size={17} />
                      </button>
                    </div>
                  </div>
                </SwipeRow>
              ))}
            </div>
          </section>
        )}

        {dates.length > 0 && (
          <section className="today-section">
            <div className="section-label">Dates</div>
            <div className="list">
              {dates.map((item) => {
                const entry = item.entry
                const Icon = entry.kind === 'birthday' ? Gift : Calendar
                return (
                  <SwipeRow
                    key={item.key}
                    actions={[later(item)]}
                    onClick={() => onOpenPerson(entry.person.id)}
                    onLongPress={() => setActionPerson(entry.person)}
                  >
                    <div className="list-row">
                      <Avatar name={entry.person.name} size={42} />
                      <div className="row-body">
                        <div className="row-title">{entry.person.name}</div>
                        <div className="row-sub">
                          <Icon size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                          {dateSub(entry)}
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className={`row-time ${entry.daysUntil <= 3 ? 'warn' : ''}`}>
                          {dateWhen(entry)}
                        </span>
                        <ChevronRight size={18} className="row-chevron" />
                      </div>
                    </div>
                  </SwipeRow>
                )
              })}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="today-section">
            <div className="section-head">
              <div className="section-label">Recent activity</div>
              {feed.length > recent.length && (
                <button className="see-all" onClick={onOpenActivity}>
                  See all
                </button>
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
          </section>
        )}
      </div>

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
      {laterItem && (
        <ActionSheet
          title="Remind me later"
          actions={snoozeChoices}
          onClose={() => setLaterItem(null)}
        />
      )}
    </div>
  )
}
