import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  X,
  UserPlus,
  Repeat,
  Users,
  SkipForward,
  Calendar,
  Moon,
  CheckCircle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  List as ListIcon,
} from 'react-feather'
import { useConfirm } from '../../hooks/useConfirm'
import {
  completionsFor,
  deadlineLabel,
  dueLabel,
  dueState,
  isDeadline,
  projectDateSummary,
} from '../../lib/tasks'
import { relativeTime } from '../../lib/contact'
import { assigneeLabel, normalizeAssignee } from '../../lib/household'
import { describeRecurrence } from '../../lib/recurrence'
import { byOrder, moveUpdates } from '../../lib/order'
import { listIcon } from '../../lib/listKinds'
import { personSummary } from '../../lib/orgs'
import {
  extractMentions,
  mentionChipHtml,
  noteSnippet,
  noteTitle,
  notesMentioning,
  sortNotes,
  withMention,
  withoutMention,
} from '../../lib/notes'
import haptics from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import TaskRow from './TaskRow'
import ReorderableList from '../../components/ui/ReorderableList'
import LinkEntityForm from '../people/LinkEntityForm'
import AddToCalendar from '../../components/ui/AddToCalendar'
import Button from '../../components/ui/Button'
import NavBar from '../../components/ui/NavBar'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import IconButton from '../../components/ui/IconButton'
import Sheet from '../../components/ui/Sheet'
import SwipeRow from '../../components/ui/SwipeRow'

// Full-page view for a project (a task flagged is_project and/or with
// subtasks). What a plain task doesn't get: a roomy place to manage subtasks,
// and everything the project gathers around itself — notes, lists, and linked
// people/orgs (the rolodex bridge).
//
// It reads top to bottom in the order you'd work: what state it's in (one line,
// unfolded to change), then the steps, then the reference material, then who
// it involves. Status and dates used to open at full height above all of it.
//
// Subtasks can be grouped Things-style: a heading is just a subtask row with
// is_heading set, and the tasks that follow it (in manual order) sit under it.
// Dragging rows across a heading re-files them; deleting a heading merges its
// tasks into the section above.
export default function ProjectDetail({
  data,
  taskId,
  onBack,
  onEdit,
  onOpenPerson,
  onOpenOrg,
  onOpenGroup,
  onOpenList,
  onOpenNote,
  onAddNote,
}) {
  const {
    tasks,
    notes = [],
    completions,
    taskLinks,
    people,
    orgs,
    affiliations = [],
    groups = [],
    lists = [],
    addTask,
    updateTask,
    deleteTask,
    completeTask,
    skipTaskOccurrence,
    reorderTasks,
    addTaskLink,
    deleteTaskLink,
    saveList,
    updateNote,
  } = data
  const confirm = useConfirm()
  const task = tasks.find((t) => t.id === taskId)
  const [draftSub, setDraftSub] = useState('')
  const [draftList, setDraftList] = useState('')
  const [linking, setLinking] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [attachingNote, setAttachingNote] = useState(false)
  // Status and dates are set once and read for the rest of the project's life,
  // so the controls stay folded behind their summary line until you want them.
  const [metaOpen, setMetaOpen] = useState(false)
  // The quick note is edited inline (the project's own scratchpad —
  // measurements, confirmation #s). Seeded from the row; written back on blur.
  const [notesDraft, setNotesDraft] = useState(task?.notes || '')
  const quickNoteRef = useRef(null)

  // Grow the scratchpad to fit what's in it, so an empty one is a single line
  // and a full one never scrolls inside itself.
  const fitQuickNote = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(() => {
    fitQuickNote(quickNoteRef.current)
  }, [])

  const saveQuickNote = () => {
    if (task && notesDraft !== (task.notes || '')) updateTask(task.id, { notes: notesDraft })
  }

  // Blur is not the only way you stop typing in it. Tapping a note row leaves
  // the page and unmounts the box — no blur — and iOS kills backgrounded PWAs
  // whenever it likes, so both are real loss, not theoretical. Flush on the way
  // out instead. The ref keeps the handlers pointed at the current draft; the
  // save is a no-op when nothing changed, so whichever fires second is free.
  const saveQuickNoteRef = useRef(saveQuickNote)
  useEffect(() => {
    saveQuickNoteRef.current = saveQuickNote
  })
  useEffect(() => {
    const flush = () => saveQuickNoteRef.current()
    const onHidden = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      flush()
    }
  }, [])

  const projectLists = useMemo(() => lists.filter((l) => l.project_id === taskId), [lists, taskId])

  // Notes filed under this project: the ones that @-mention it. 'task' counts
  // too — a note that named it before it was promoted still carries the type it
  // was chosen with.
  const projectNotes = useMemo(
    () => sortNotes(notesMentioning(notes, ['project', 'task'], taskId)),
    [notes, taskId],
  )

  // Everything else in the notebook, offered for "Attach existing".
  const attachableNotes = useMemo(() => {
    const filed = new Set(projectNotes.map((n) => n.id))
    return sortNotes(notes.filter((n) => !filed.has(n.id)))
  }, [notes, projectNotes])

  // Free-standing lists (not already tied to a project) you can pull in. Keeping
  // it to unattached lists means attaching here never quietly steals a list from
  // another project.
  const attachableLists = useMemo(
    () => lists.filter((l) => !l.project_id).sort((a, b) => a.name.localeCompare(b.name)),
    [lists],
  )

  const orgsById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs])

  // headings + tasks interleaved, in manual order
  const subs = useMemo(
    () => tasks.filter((t) => t.parent_id === taskId).sort(byOrder),
    [tasks, taskId],
  )
  const realSubs = useMemo(() => subs.filter((s) => !s.is_heading), [subs])

  const links = useMemo(() => {
    const byType = {
      person: new Map(people.map((p) => [p.id, p])),
      organization: new Map(orgs.map((o) => [o.id, o])),
      group: new Map(groups.map((g) => [g.id, g])),
    }
    return (
      (taskLinks || [])
        .filter((l) => l.task_id === taskId)
        .map((l) => {
          const entity = byType[l.entity_type]?.get(l.entity_id)
          return entity ? { link: l, entity } : null
        })
        // drop links whose target was deleted (people soft-delete; orgs/groups vanish)
        .filter((r) => r && !(r.link.entity_type === 'person' && r.entity.deleted_at))
    )
  }, [taskLinks, taskId, people, orgs, groups])

  if (!task) {
    return (
      <div>
        <NavBar backLabel="Back" onBack={onBack} title="Not found" />
        <EmptyState>Project not found.</EmptyState>
      </div>
    )
  }

  const progress = realSubs.length
    ? { done: realSubs.filter((s) => s.completed_at).length, total: realSubs.length }
    : null
  const history = completionsFor(task.id, completions)
  // A project can carry a deadline too ("renovation done by the 30th"), and it
  // reads the same way here as on a task row: room left, not a day to show up.
  const dl = isDeadline(task)
    ? deadlineLabel(task.due_date, task.due_time)
    : dueLabel(task.due_date, task.due_time)
  const ds = dueState(task.due_date)

  const toggle = (t) => {
    if (!t.completed_at) haptics.success()
    completeTask(t, !t.completed_at)
  }

  const addSub = (asHeading = false) => {
    const title = draftSub.trim()
    if (!title) return
    addTask(
      asHeading
        ? { title, parent_id: task.id, is_heading: true, privacy_level: task.privacy_level }
        : { title, parent_id: task.id, assignee: task.assignee, privacy_level: task.privacy_level },
    )
    setDraftSub('')
  }

  const addList = () => {
    const name = draftList.trim()
    if (!name) return
    // Scoped to this project (project_id) yet still a normal household list —
    // it shows in global Lists too. Privacy follows the project's.
    saveList({ name, kind: 'standard', privacy_level: task.privacy_level, project_id: task.id })
    setDraftList('')
  }

  // Pull an existing household list into this project (it keeps living in global
  // Lists too — project_id is just a tag). Detach reverses it without deleting.
  const attachList = (listId) => {
    saveList({ project_id: task.id }, listId)
    setAttaching(false)
  }
  const detachList = async (listId) => {
    const l = lists.find((x) => x.id === listId)
    const ok = await confirm({
      title: `Remove “${l?.name || 'this list'}”?`,
      message: 'It comes off this project but stays in your Lists. Nothing is deleted.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (ok) saveList({ project_id: null }, listId)
  }

  // Notes file themselves under a project by @-mentioning it, so a note started
  // here opens with that chip already in its body — the same link you'd get by
  // typing "@" in the notebook, and the one the backlink list reads.
  //
  // The empty line after it is load-bearing: tapping into the body puts the
  // caret at the end, and anything typed onto the chip's own line would become
  // the note's title ("@Kitchen refreshPaint quotes"). With a line of its own to
  // land on, the first thing typed titles the note and the chip stays a marker.
  const newNote = () =>
    onAddNote?.({
      body: `<div>${mentionChipHtml({ type: 'project', id: task.id, label: task.title })}</div><div><br></div>`,
      mentions: [{ type: 'project', id: task.id }],
      privacy_level: task.privacy_level,
    })

  const saveMentions = (note, body) =>
    updateNote(note.id, { body, mentions: extractMentions(body) })

  const attachNote = (note) => {
    saveMentions(note, withMention(note.body, { type: 'project', id: task.id, label: task.title }))
    setAttachingNote(false)
  }

  // Detaching edits the note — the link lives in its text — so say so. Both
  // mention types come out: the note may have named this as a plain task.
  const detachNote = async (note) => {
    const ok = await confirm({
      title: `Remove “${noteTitle(note)}” from this project?`,
      message: 'The @mention comes out of the note. The note itself stays in your notebook.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    const stripped = ['project', 'task'].reduce(
      (body, type) => withoutMention(body, { type, id: task.id }),
      note.body,
    )
    saveMentions(note, stripped)
  }

  const setStatus = (status) => updateTask(task.id, { project_status: status })
  const toggleDone = () => completeTask(task, !task.completed_at)
  const setDate = (field, value) => updateTask(task.id, { [field]: value || null })

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${task.title}”?`,
      message: realSubs.length
        ? `Its ${realSubs.length} subtask${realSubs.length === 1 ? '' : 's'} go too. This can't be undone.`
        : "This can't be undone.",
      confirmLabel: 'Delete project',
      danger: true,
    })
    if (!ok) return
    deleteTask(task.id)
    onBack()
  }

  const isDone = !!task.completed_at
  const isSomeday = task.project_status === 'someday'
  const statusLabel = isDone ? 'Done' : isSomeday ? 'Someday' : 'Active'
  const dateSummary = projectDateSummary(task)

  return (
    <div className="detail">
      <NavBar backLabel="Projects" onBack={onBack} title={task.title}>
        <div className="profile-head">
          <h1 className="person-name">{task.title}</h1>
          <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
            {progress && (
              <span className="chip">
                {progress.done}/{progress.total} done
              </span>
            )}
            {isDone ? (
              <span className="chip">Done</span>
            ) : isSomeday ? (
              <span className="chip">
                <Moon size={11} /> Someday
              </span>
            ) : null}
            {normalizeAssignee(task.assignee) !== 'anyone' && (
              <span className="chip">{assigneeLabel(task.assignee)}</span>
            )}
            {dl && <span className={`chip due-${ds}`}>{dl}</span>}
            {task.recurrence && (
              <span className="chip" title={describeRecurrence(task.recurrence)}>
                <Repeat size={11} /> {describeRecurrence(task.recurrence)}
              </span>
            )}
          </div>
          <div className="profile-actions">
            <button className="pill-btn" onClick={() => onEdit(task)}>
              <Edit2 size={15} /> Edit
            </button>
            <AddToCalendar task={task} trigger="pill" />
            {task.recurrence && (
              <button className="pill-btn" onClick={() => skipTaskOccurrence(task)}>
                <SkipForward size={15} /> Skip this one
              </button>
            )}
          </div>
        </div>
      </NavBar>

      {/* Status and dates, folded into one line. They're set early and then
          mostly read, and as a permanent block of three buttons and two date
          pickers they pushed the actual work — the subtasks — off the first
          screenful. The summary is the button that unfolds them. */}
      <div className="list project-meta">
        <button
          type="button"
          className="project-meta-summary"
          aria-expanded={metaOpen}
          onClick={() => setMetaOpen((v) => !v)}
        >
          <span className={`chip ${isDone ? 'good' : isSomeday ? '' : 'accent'}`}>
            {isDone ? <CheckCircle size={11} /> : isSomeday ? <Moon size={11} /> : null}
            {statusLabel}
          </span>
          <span className={`project-meta-when ${dateSummary ? '' : 'unset'}`}>
            {dateSummary || 'No dates set'}
          </span>
          <ChevronDown size={16} className={`project-meta-caret ${metaOpen ? 'open' : ''}`} />
        </button>
        {metaOpen && (
          <div className="project-meta-edit">
            <div className="project-status-row">
              <button
                className={`pill-btn ${!isDone && !isSomeday ? 'on' : ''}`}
                onClick={() => {
                  if (isDone) toggleDone()
                  setStatus('active')
                }}
              >
                Active
              </button>
              <button
                className={`pill-btn ${!isDone && isSomeday ? 'on' : ''}`}
                onClick={() => {
                  if (isDone) toggleDone()
                  setStatus('someday')
                }}
              >
                <Moon size={14} /> Someday
              </button>
              <button className={`pill-btn ${isDone ? 'on' : ''}`} onClick={toggleDone}>
                {isDone ? (
                  <>
                    <RotateCcw size={14} /> Reopen
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} /> Mark done
                  </>
                )}
              </button>
            </div>
            <div className="project-dates">
              <label className="project-date-field">
                <span className="project-date-label">
                  <Calendar size={13} /> Start
                </span>
                <input
                  type="date"
                  value={task.start_date || ''}
                  onChange={(e) => setDate('start_date', e.target.value)}
                />
              </label>
              <label className="project-date-field">
                <span className="project-date-label">
                  <Calendar size={13} /> Target
                </span>
                <input
                  type="date"
                  value={task.end_date || ''}
                  min={task.start_date || undefined}
                  onChange={(e) => setDate('end_date', e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <SectionLabel>
        Subtasks
        {progress && (
          <span className="section-count">
            {progress.done}/{progress.total}
          </span>
        )}
      </SectionLabel>
      <div className="list">
        {subs.length > 0 && (
          <ReorderableList
            className="reorder-plain"
            items={subs}
            onMove={(from, to) => reorderTasks(moveUpdates(subs, from, to))}
            renderItem={(s) =>
              s.is_heading ? (
                <div className="heading-row">
                  <span className="heading-title">{s.title}</span>
                  <IconButton
                    icon={X}
                    variant="danger"
                    label="Delete heading"
                    onClick={() => deleteTask(s.id)}
                  />
                </div>
              ) : (
                <div className="list-row sub">
                  <TaskRow
                    task={s}
                    onToggle={toggle}
                    size="sm"
                    hideAssignee={
                      normalizeAssignee(s.assignee) === normalizeAssignee(task.assignee)
                    }
                  />
                  <AddToCalendar task={s} parent={task} trigger="icon" />
                  <IconButton
                    icon={X}
                    variant="danger"
                    label="Delete subtask"
                    onClick={() => deleteTask(s.id)}
                  />
                </div>
              )
            }
          />
        )}
        <div className={`subtask-composer ${subs.length > 0 ? 'divided' : ''}`}>
          <input
            value={draftSub}
            onChange={(e) => setDraftSub(e.target.value)}
            placeholder={subs.length ? 'Add a subtask…' : 'Add the first step…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSub()
              }
            }}
          />
          <div className="subtask-composer-actions">
            <button className="text-btn" onClick={() => addSub()} disabled={!draftSub.trim()}>
              <Plus size={15} /> Add task
            </button>
            <button
              className="text-btn quiet"
              onClick={() => addSub(true)}
              disabled={!draftSub.trim()}
              title="Group the steps below it, like “Materials” or “Phase 1”"
            >
              Add as heading
            </button>
          </div>
        </div>
      </div>

      {/* Notes read like the Lists section below: links out to real notebook
          notes, which a project can collect several of, rather than one box of
          text. The link is the note's own @-mention of this project, so it
          points both ways and shows up in the notebook too. */}
      <SectionLabel>
        Notes
        {projectNotes.length > 0 && <span className="section-count">{projectNotes.length}</span>}
      </SectionLabel>
      <div className="list">
        {projectNotes.length === 0 ? (
          <EmptyState inline>
            No notes filed here yet. Start one below, or @-mention this project in any note.
          </EmptyState>
        ) : (
          projectNotes.map((n) => (
            <SwipeRow
              key={n.id}
              label={noteTitle(n)}
              onClick={() => onOpenNote?.(n.id)}
              actions={[
                { label: 'Remove', icon: X, variant: 'danger', onClick: () => detachNote(n) },
              ]}
            >
              <div className="list-row">
                <div className="row-body">
                  <div className="row-title">{noteTitle(n)}</div>
                  <div className="row-sub">
                    {noteSnippet(n, 60) || `Edited ${relativeTime(n.updated_at)}`}
                  </div>
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </div>
            </SwipeRow>
          ))
        )}
        <div className={`subtask-composer ${projectNotes.length > 0 ? 'divided' : ''}`}>
          <div className="subtask-composer-actions">
            <Button variant="text" icon={Plus} onClick={newNote} disabled={!onAddNote}>
              New note
            </Button>
            <Button
              variant="text"
              className="quiet"
              onClick={() => setAttachingNote(true)}
              disabled={attachableNotes.length === 0}
              title={
                attachableNotes.length === 0
                  ? 'Every note is already filed here'
                  : 'File a note you already wrote under this project'
              }
            >
              Attach existing
            </Button>
          </div>
        </div>
      </div>

      {/* The project's own scratchpad, kept because it's the fastest place to
          put a confirmation number — but sized to what's in it, so an unused
          one costs a line rather than a card. */}
      <SectionLabel>Quick note</SectionLabel>
      <div className="list project-notes-card">
        <textarea
          ref={quickNoteRef}
          className="project-notes-edit"
          aria-label="Quick note"
          // One line to start; fitQuickNote takes it from there. The default
          // rows=2 is what the measurement floors at, not the CSS.
          rows={1}
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value)
            fitQuickNote(e.target)
          }}
          onBlur={saveQuickNote}
          placeholder="Measurements, confirmation #s, links, anything you want at hand."
        />
      </div>

      <SectionLabel>Lists</SectionLabel>
      <div className="list">
        {projectLists.map((l) => {
          const left = (data.listItems || []).filter(
            (it) => it.list_id === l.id && !it.checked_at,
          ).length
          return (
            <SwipeRow
              key={l.id}
              label={l.name}
              onClick={() => onOpenList?.(l.id)}
              actions={[
                {
                  label: 'Remove',
                  icon: X,
                  variant: 'danger',
                  onClick: () => detachList(l.id),
                },
              ]}
            >
              <div className="list-row project-list-row">
                <span className="list-emoji" style={l.color ? { background: l.color } : undefined}>
                  {listIcon(l)}
                </span>
                <div className="row-body">
                  <div className="row-title">{l.name}</div>
                  <div className="row-sub">
                    {left ? `${left} item${left === 1 ? '' : 's'} left` : 'All done'}
                  </div>
                </div>
                <ChevronRight size={18} className="row-chevron" />
              </div>
            </SwipeRow>
          )
        })}
        <div className={`subtask-composer ${projectLists.length > 0 ? 'divided' : ''}`}>
          <ListIcon size={15} className="muted" style={{ flexShrink: 0 }} />
          <input
            value={draftList}
            onChange={(e) => setDraftList(e.target.value)}
            placeholder={projectLists.length ? 'Add a list…' : 'Add a packing or materials list…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addList()
              }
            }}
          />
          <div className="subtask-composer-actions">
            <button className="text-btn" onClick={addList} disabled={!draftList.trim()}>
              <Plus size={15} /> Add list
            </button>
            <button
              className="text-btn quiet"
              onClick={() => setAttaching(true)}
              disabled={attachableLists.length === 0}
              title={
                attachableLists.length === 0
                  ? 'No unattached lists to add'
                  : 'Attach a list you already have'
              }
            >
              Attach existing
            </button>
          </div>
        </div>
      </div>

      <SectionLabel>
        Related people &amp; orgs
        <button className="text-btn" style={{ float: 'right' }} onClick={() => setLinking(true)}>
          <UserPlus size={14} /> Link
        </button>
      </SectionLabel>
      <div className="list">
        {links.length === 0 ? (
          <EmptyState inline>
            Nothing linked yet. Add a person, organization, or group tied to this project: a
            contractor, vendor, or family member.
          </EmptyState>
        ) : (
          links.map(({ link, entity }) => {
            const type = link.entity_type
            const isPerson = type === 'person'
            const isGroup = type === 'group'
            const sub =
              [
                link.role,
                isPerson
                  ? personSummary(entity, affiliations, orgsById)
                  : isGroup
                    ? null
                    : entity.type,
              ]
                .filter(Boolean)
                .join(' · ') || (isPerson ? 'Contact' : isGroup ? 'Group' : 'Organization')
            const open = isPerson
              ? () => onOpenPerson(entity.id)
              : isGroup
                ? () => onOpenGroup(entity.id)
                : () => onOpenOrg(entity.id)
            return (
              <div className="list-row" key={link.id} onClick={open}>
                <Avatar
                  name={entity.name}
                  src={entity.avatar_url}
                  size={38}
                  kind={isPerson ? 'person' : 'org'}
                  icon={isGroup ? Users : undefined}
                />
                <div className="row-body">
                  <div className="row-title">{entity.name}</div>
                  <div className="row-sub">{sub}</div>
                </div>
                <IconButton
                  icon={X}
                  variant="danger"
                  label="Remove link"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteTaskLink(link.id)
                  }}
                />
              </div>
            )
          })
        )}
      </div>

      {history.length > 0 && (
        <>
          <SectionLabel>History</SectionLabel>
          <div className="list">
            {history.slice(0, 6).map((c) => (
              <div className="value-row" key={c.id}>
                <span className="v-value">
                  Done {relativeTime(c.completed_at)}
                  {c.completed_by ? ` · ${assigneeLabel(c.completed_by)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Destructive action lives at the foot of the page and reads quietly.
          As a filled red pill next to Edit it carried the same weight as the
          safest action on the screen. */}
      <div className="danger-zone">
        <button className="text-btn danger" onClick={remove}>
          <Trash2 size={14} /> Delete project
        </button>
      </div>

      {linking && (
        <LinkEntityForm
          taskId={task.id}
          people={people}
          orgs={orgs}
          groups={groups}
          existing={links.map((l) => l.link)}
          onSave={addTaskLink}
          onClose={() => setLinking(false)}
        />
      )}

      {attaching && (
        <Sheet title="Attach a list" onClose={() => setAttaching(false)}>
          <div className="list">
            {attachableLists.length === 0 ? (
              <EmptyState inline>No unattached lists. Create one above instead.</EmptyState>
            ) : (
              attachableLists.map((l) => {
                const left = (data.listItems || []).filter(
                  (it) => it.list_id === l.id && !it.checked_at,
                ).length
                return (
                  <div className="list-row" key={l.id} onClick={() => attachList(l.id)}>
                    <span
                      className="list-emoji"
                      style={l.color ? { background: l.color } : undefined}
                    >
                      {listIcon(l)}
                    </span>
                    <div className="row-body">
                      <div className="row-title">{l.name}</div>
                      <div className="row-sub">
                        {left ? `${left} item${left === 1 ? '' : 's'} left` : 'All done'}
                      </div>
                    </div>
                    <Plus size={18} className="row-chevron" />
                  </div>
                )
              })
            )}
          </div>
        </Sheet>
      )}

      {attachingNote && (
        <Sheet title="Attach a note" onClose={() => setAttachingNote(false)}>
          <div className="list">
            {attachableNotes.length === 0 ? (
              <EmptyState inline>Every note you have is already filed here.</EmptyState>
            ) : (
              attachableNotes.map((n) => (
                <div className="list-row" key={n.id} onClick={() => attachNote(n)}>
                  <div className="row-body">
                    <div className="row-title">{noteTitle(n)}</div>
                    <div className="row-sub">
                      {noteSnippet(n, 60) || `Edited ${relativeTime(n.updated_at)}`}
                    </div>
                  </div>
                  <Plus size={18} className="row-chevron" />
                </div>
              ))
            )}
          </div>
        </Sheet>
      )}
    </div>
  )
}
