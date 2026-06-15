import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Plus,
  CheckSquare,
  Calendar,
  Clock,
  Repeat as RepeatIcon,
  User,
} from 'react-feather'
import {
  taskBucket,
  completionsFor,
  completionLog,
  capCompletionLog,
  completionTime,
  isProject,
  areaNames,
  taskTags,
  byDue,
  byUpcoming,
  isoDateIn,
} from '../lib/tasks'
import { describeRecurrence } from '../lib/recurrence'
import { parseTaskInput, quickTaskFields } from '../lib/taskParse'
import { PRIVATE_LEVEL } from '../lib/privacy'
import { relativeTime } from '../lib/contact'
import { members, assigneeLabel, normalizeAssignee, isSolo } from '../lib/household'
import { byOrder, moveUpdates } from '../lib/order'
import haptics from '../lib/haptics'
import PageHeader from './PageHeader'
import Segmented from './Segmented'
import TaskRow from './TaskRow'
import SharedDot from './SharedDot'
import ReorderableList from './ReorderableList'
import AddToCalendar from './AddToCalendar'
import { Check } from 'react-feather'

// Icons for the quick-add preview chips, matching TaskForm's smart-add tokens.
const TOKEN_ICON = { due: Calendar, time: Clock, repeat: RepeatIcon, who: User }

const BUCKETS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'someday', label: 'Someday' },
]

export default function TasksView({
  data,
  expandId,
  onAdd,
  onEdit,
  onOpenProject,
  onSearch,
  hub,
  defaultFilter = 'all',
  defaultShowCompleted = false,
  defaultPrivacy = 'shared',
}) {
  const {
    tasks,
    completions,
    addTask,
    deleteTask,
    completeTask,
    skipTaskOccurrence,
    reorderTasks,
  } = data
  // Ad-hoc filters persist for the session only (sessionStorage), so stepping
  // into a task/project and back doesn't reset them — while a fresh app launch
  // still falls back to the saved per-member defaults. Keyed by member so
  // switching "I'm this" (demo) never carries one person's view onto another's.
  const sessionKey = `salernidex-tasks-filters:${data.memberId || ''}`
  const readSession = () => {
    try {
      return JSON.parse(sessionStorage.getItem(sessionKey) || '{}') || {}
    } catch {
      return {}
    }
  }
  // Default view from settings; fall back to 'all' if the saved member is gone.
  const [filter, setFilter] = useState(() => {
    const v = readSession().filter ?? defaultFilter
    return v === 'all' || members().some((m) => m.id === v) ? v : 'all'
  })
  // Optional narrowing to one area. The area pills only appear once areas exist
  // (see areaList below), so until then this is a no-op the user never sees.
  const [areaFilter, setAreaFilter] = useState(() => readSession().areaFilter ?? 'all')
  // Same idea for one tag (cross-cutting label). Independent of the area filter.
  const [tagFilter, setTagFilter] = useState(() => readSession().tagFilter ?? 'all')
  const [expanded, setExpanded] = useState(expandId || null)
  const [showDone, setShowDone] = useState(() => readSession().showDone ?? defaultShowCompleted)
  const [showAllDone, setShowAllDone] = useState(false)
  const [draftSub, setDraftSub] = useState('')
  // Inline quick-add: type a line, Enter adds it (running the same NL parser the
  // modal uses), and the field stays focused for the next one — fast capture
  // without opening the full form. The FAB/"New task" still opens the modal when
  // you want priority, area, notes, etc.
  const [quickDraft, setQuickDraft] = useState('')
  const quickRef = useRef(null)
  const quickPreview = useMemo(
    () => parseTaskInput(quickDraft, { today: isoDateIn(0), members: members() }),
    [quickDraft],
  )

  // Deep link from Quick Find (#/tasks/<id>): land with that task expanded.
  useEffect(() => {
    if (expandId) setExpanded(expandId)
  }, [expandId])

  // Mirror the active filters into sessionStorage so a remount (stepping into a
  // task/project and back) restores them; naturally cleared when the PWA closes.
  useEffect(() => {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({ filter, areaFilter, tagFilter, showDone }))
    } catch {
      // private mode / quota — non-essential, fine to skip
    }
  }, [sessionKey, filter, areaFilter, tagFilter, showDone])

  const filterOptions = [
    { value: 'all', label: 'Everyone' },
    ...members().map((m) => ({ value: m.id, label: m.name })),
  ]

  // Areas in use across open top-level tasks — drives the filter pills. Derived
  // from every open task (not the member-filtered set) so the pills don't flicker
  // in and out as you switch member.
  const areaList = useMemo(
    () => areaNames(tasks.filter((t) => !t.parent_id && !t.completed_at)),
    [tasks],
  )
  const tagList = useMemo(
    () => taskTags(tasks.filter((t) => !t.parent_id && !t.completed_at)),
    [tasks],
  )
  // Guard against a stale selection: if the last task in an area/tag is finished
  // or renamed, fall back to "All" rather than showing an empty list.
  const activeArea = areaList.includes(areaFilter) ? areaFilter : 'all'
  const activeTag = tagList.includes(tagFilter) ? tagFilter : 'all'

  const matches = (t) => {
    if (filter !== 'all') {
      const a = normalizeAssignee(t.assignee)
      if (a !== filter && a !== 'anyone') return false
    }
    if (activeArea !== 'all' && (t.area || '').trim() !== activeArea) return false
    if (activeTag !== 'all' && !(t.tags || []).includes(activeTag)) return false
    return true
  }

  // `matches` closes over filter/activeArea/activeTag — all listed below; ESLint
  // just can't see through the helper, so the dep lists are in fact complete.
  // Projects are excluded here — they live in their own index (ProjectsView),
  // reached via the Tasks↔Projects switcher. The Tasks list stays pure to-dos.
  const topOpen = useMemo(
    () =>
      tasks
        .filter((t) => !t.parent_id && !t.completed_at && !isProject(t) && matches(t))
        .sort(byOrder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, filter, activeArea, activeTag],
  )
  // Done is a dated logbook of check-offs, not a list of completed task rows.
  // Recurring tasks roll forward (completed_at stays null), so they'd never show
  // here otherwise — completionLog reads the completion log so every check-off
  // appears the day it happened. See lib/tasks.completionLog.
  // Completed projects belong to the Projects › Done section, not the Tasks
  // logbook — keep them out so a finished project surfaces in exactly one place.
  const log = useMemo(
    () => completionLog(tasks, completions, (t) => matches(t) && !isProject(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, completions, filter, activeArea, activeTag],
  )
  const logCount = useMemo(() => log.reduce((n, g) => n + g.events.length, 0), [log])
  // Inline view is capped to the last 2 weeks / 30 check-offs (whichever bites
  // first) so the list can't run away; "Show N earlier" reveals the rest in place.
  const { groups: cappedLog, omitted } = useMemo(() => capCompletionLog(log), [log])
  const shownLog = showAllDone ? log : cappedLog
  const grouped = useMemo(() => {
    const g = { overdue: [], today: [], upcoming: [], someday: [] }
    for (const t of topOpen) g[taskBucket(t)].push(t)
    // Upcoming is date-driven, so read it chronologically (soonest first) rather
    // than by manual drag order — what's "coming up next" belongs at the top.
    g.upcoming.sort(byUpcoming)
    return g
  }, [topOpen])

  // Today splits in two: clock-anchored tasks lead in time order (a 9 AM
  // commitment shouldn't sink under untimed to-dos), then untimed tasks keep the
  // user's manual order below. All Today tasks share today's date, so byDue here
  // collapses to time-of-day, then priority.
  const todayParts = useMemo(() => {
    const timed = grouped.today.filter((t) => t.due_time).sort(byDue)
    const untimed = grouped.today.filter((t) => !t.due_time)
    return { timed, untimed }
  }, [grouped.today])

  const subtasks = (id) => tasks.filter((t) => t.parent_id === id && !t.is_heading)

  const toggle = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  const addSub = (parent) => {
    const title = draftSub.trim()
    if (!title) return
    addTask({
      title,
      parent_id: parent.id,
      assignee: parent.assignee,
      privacy_level: parent.privacy_level,
    })
    setDraftSub('')
  }

  const addQuick = () => {
    if (!quickDraft.trim()) return
    const fields = quickTaskFields(quickDraft, { today: isoDateIn(0), members: members() })
    // When viewing one member's list, an unattributed quick task joins that list;
    // an explicit "for <name>" in the text still wins.
    if (fields.assignee === 'anyone' && filter !== 'all') fields.assignee = filter
    // Inherit the active content filters so a quick task stays in the view you
    // added it to — otherwise matches() hides it the moment it's created.
    if (activeArea !== 'all') fields.area = activeArea
    if (activeTag !== 'all') fields.tags = [activeTag]
    haptics.success()
    // Privacy follows the user's "new task" default, exactly like TaskForm — solo
    // households are always private; otherwise it's the configured taskPrivacy.
    addTask({ ...fields, privacy_level: isSolo() ? PRIVATE_LEVEL : defaultPrivacy })
    setQuickDraft('')
    quickRef.current?.focus()
  }

  const renderTask = (task) => {
    const subs = subtasks(task.id)
    const progress = subs.length
      ? { done: subs.filter((s) => s.completed_at).length, total: subs.length }
      : null

    // Projects get the full-page detail view; plain tasks expand inline.
    if (isProject(task)) {
      return (
        <div className="list-row" key={task.id} onClick={() => onOpenProject(task.id)}>
          <TaskRow task={task} onToggle={toggle} progress={progress} />
          <ChevronRight size={18} className="row-chevron" />
        </div>
      )
    }

    const isOpen = expanded === task.id
    const history = completionsFor(task.id, completions)
    return (
      <div key={task.id}>
        <div className="list-row" onClick={() => setExpanded(isOpen ? null : task.id)}>
          <TaskRow task={task} onToggle={toggle} progress={progress} />
          <ChevronRight
            size={18}
            className="row-chevron"
            style={{
              transform: isOpen ? 'rotate(90deg)' : 'none',
              transition: 'transform 200ms ease',
            }}
          />
        </div>
        {isOpen && (
          <div className="task-expand">
            {task.notes && (
              <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
                {task.notes}
              </p>
            )}
            {subs.map((s) => (
              <div className="list-row sub" key={s.id}>
                <TaskRow
                  task={s}
                  onToggle={toggle}
                  size="sm"
                  hideAssignee={normalizeAssignee(s.assignee) === normalizeAssignee(task.assignee)}
                />
                <button
                  className="icon-btn danger"
                  onClick={() => deleteTask(s.id)}
                  aria-label="Delete subtask"
                >
                  <Plus size={15} style={{ transform: 'rotate(45deg)' }} />
                </button>
              </div>
            ))}
            <div className="subtask-add">
              <input
                value={expanded === task.id ? draftSub : ''}
                onChange={(e) => setDraftSub(e.target.value)}
                placeholder="Add a subtask…"
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSub(task)
                  }
                }}
              />
              <button className="text-btn" onClick={() => addSub(task)}>
                Add
              </button>
            </div>
            {history.length > 0 && (
              <div className="task-history">
                <div className="task-history-head">
                  Last done {relativeTime(history[0].completed_at)}
                  {history[0].completed_by ? ` · ${assigneeLabel(history[0].completed_by)}` : ''}
                </div>
                {history.slice(1, 4).map((c) => (
                  <div className="task-history-row" key={c.id}>
                    {relativeTime(c.completed_at)}
                    {c.completed_by ? ` · ${assigneeLabel(c.completed_by)}` : ''}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="text-btn" onClick={() => onEdit(task)}>
                Edit
              </button>
              <AddToCalendar task={task} />
              {task.recurrence && (
                <button className="text-btn" onClick={() => skipTaskOccurrence(task)}>
                  Skip this one
                </button>
              )}
              <button className="text-btn danger" onClick={() => deleteTask(task.id)}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // One row in the Done logbook. Reads "done" (filled check, struck title) with a
  // right-aligned time-of-day stamp. One-offs keep their un-check (tap the check
  // to reopen); recurring occurrences are historical events, so their check is a
  // static marker — tap the row to open the live task.
  const renderLogEvent = (event) => {
    const { task } = event
    const oneOff = !task.recurrence
    return (
      <div className="list-row" key={event.id} onClick={() => onEdit(task)}>
        <button
          className="task-check done"
          onClick={(e) => {
            e.stopPropagation()
            if (oneOff) toggle(task)
          }}
          aria-label={oneOff ? 'Mark not done' : 'Completed'}
          disabled={!oneOff}
        >
          <Check size={15} />
        </button>
        <div className="row-body">
          <div className="row-titleline">
            <div className="row-title task-done">{task.title}</div>
            <SharedDot item={task} />
          </div>
          <div className="task-meta">
            {task.recurrence && (
              <span className="chip" title={describeRecurrence(task.recurrence)}>
                <RepeatIcon size={11} />
              </span>
            )}
            {task.area && <span className="chip area">{task.area}</span>}
            {event.completedBy && <span className="chip">{assigneeLabel(event.completedBy)}</span>}
            <span className="log-time">{completionTime(event.completedAt)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        navOptions={hub?.options}
        navActive={hub?.active}
        onNavigate={hub?.onNavigate}
        action={onAdd}
        actionLabel="New task"
        onSearch={onSearch}
      />

      {/* Member filter only makes sense with someone to filter by (see isSolo). */}
      {!isSolo() && <Segmented options={filterOptions} value={filter} onChange={setFilter} />}

      {areaList.length > 0 && (
        <div className="area-filter">
          <button
            className={`area-pill ${activeArea === 'all' ? 'on' : ''}`}
            onClick={() => setAreaFilter('all')}
          >
            All areas
          </button>
          {areaList.map((a) => (
            <button
              key={a}
              className={`area-pill ${activeArea === a ? 'on' : ''}`}
              onClick={() => setAreaFilter(a)}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {tagList.length > 0 && (
        <div className="area-filter">
          <button
            className={`area-pill ${activeTag === 'all' ? 'on' : ''}`}
            onClick={() => setTagFilter('all')}
          >
            All tags
          </button>
          {tagList.map((t) => (
            <button
              key={t}
              className={`area-pill ${activeTag === t ? 'on' : ''}`}
              onClick={() => setTagFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="task-quickadd">
        <div className="task-quickadd-row">
          <Plus size={18} className="task-quickadd-icon" />
          <input
            ref={quickRef}
            value={quickDraft}
            onChange={(e) => setQuickDraft(e.target.value)}
            placeholder="Add a task… e.g. trash out every Monday"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addQuick()
              }
            }}
          />
        </div>
        {quickPreview.tokens.length > 0 && (
          <div className="nl-preview" aria-live="polite">
            <span className="nl-preview-title">{quickPreview.title}</span>
            <span className="nl-chips">
              {quickPreview.tokens.map((t) => {
                const Icon = TOKEN_ICON[t.type]
                return (
                  <span key={t.type} className={`nl-chip nl-${t.type}`}>
                    {Icon && <Icon size={11} />} {t.label}
                  </span>
                )
              })}
            </span>
          </div>
        )}
      </div>

      {topOpen.length === 0 ? (
        <div className="empty">
          <CheckSquare size={28} className="empty-icon" />
          {activeArea !== 'all'
            ? `Nothing in ${activeArea}.`
            : filter === 'all'
              ? 'Nothing on the list. Add a task.'
              : 'Nothing assigned here.'}
          <button className="text-btn" onClick={onAdd}>
            <Plus size={14} /> New task
          </button>
        </div>
      ) : (
        BUCKETS.map((b) =>
          grouped[b.id].length ? (
            <div key={b.id}>
              <div className="section-label">{b.label}</div>
              {b.id === 'upcoming' ? (
                // Date-driven: chronological, no manual reorder.
                <div className="list">{grouped[b.id].map(renderTask)}</div>
              ) : b.id === 'today' ? (
                // Timed tasks lead in clock order; untimed stay reorderable below.
                <>
                  {todayParts.timed.length > 0 && (
                    <div className="list">{todayParts.timed.map(renderTask)}</div>
                  )}
                  <ReorderableList
                    items={todayParts.untimed}
                    onMove={(from, to) =>
                      reorderTasks(moveUpdates(todayParts.untimed, from, to))
                    }
                    renderItem={renderTask}
                  />
                </>
              ) : (
                <ReorderableList
                  items={grouped[b.id]}
                  onMove={(from, to) => reorderTasks(moveUpdates(grouped[b.id], from, to))}
                  renderItem={renderTask}
                />
              )}
            </div>
          ) : null,
        )
      )}

      {logCount > 0 && (
        <>
          <button className="section-label section-toggle" onClick={() => setShowDone((v) => !v)}>
            Done · {logCount}{' '}
            <ChevronRight size={13} style={{ transform: showDone ? 'rotate(90deg)' : 'none' }} />
          </button>
          {showDone && (
            <>
              {shownLog.map((g) => (
                <div key={g.day}>
                  <div className="log-day">{g.label}</div>
                  <div className="list">{g.events.map(renderLogEvent)}</div>
                </div>
              ))}
              {omitted > 0 && (
                <button className="text-btn log-more" onClick={() => setShowAllDone((v) => !v)}>
                  {showAllDone ? 'Show less' : `Show ${omitted} earlier`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
