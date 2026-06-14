import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  demoMode,
  demoPeople,
  demoOrgs,
  demoRelationships,
  demoGroups,
  demoInteractions,
  demoTasks,
  demoCompletions,
  demoTaskLinks,
  demoLists,
  demoListItems,
  demoFamilies,
  demoKeyDates,
  demoHabits,
  demoHabitEntries,
} from '../lib/demo'
import { completionFields, skipFields } from '../lib/tasks'
import { categorize } from '../lib/aisles'
import { buildCatalog, bumpCatalog, catalogKey } from '../lib/catalog'
import { currentMember, currentMemberId, getHousehold } from '../lib/household'
import { entryMap, currentStreak, isScheduled, isSuccess, isWeekly, toISODate } from '../lib/habits'
import haptics from '../lib/haptics'
import { showToast } from '../lib/toast'
import { friendlyError } from '../lib/errors'
import { filterVisible, PRIVATE_LEVEL } from '../lib/privacy'
import { hydrateAppPrefs, bindAppPrefsRemote } from '../lib/appPrefs'
import { hydrateNotifyPrefs, bindNotifyRemote } from '../lib/notifyPrefs'

// Streak lengths (days, or weeks for weekly habits) worth a small celebration.
const MILESTONES = new Set([7, 14, 30, 50, 75, 100, 150, 200, 365])

// notification_prefs row <-> client notify-prefs shape. Column names already
// match the client keys, so this just picks the persisted fields (dropping
// id/member_id/digest_time/updated_at) — kept explicit so a schema change can't
// silently round-trip an unexpected column.
const NOTIFY_KEYS = ['tasks', 'lists', 'nudges', 'dates', 'fyi', 'dates_lead_days']
const fromNotifyRow = (r) => Object.fromEntries(NOTIFY_KEYS.map((k) => [k, r[k]]))
const toNotifyRow = (p) => Object.fromEntries(NOTIFY_KEYS.map((k) => [k, p[k]]))

// member_preferences row (snake_case; task_filter is a uuid/null FK) <-> the
// client appPrefs shape (camelCase; taskFilter uses the 'all' sentinel).
const fromPrefRow = (r) => ({
  taskPrivacy: r.default_task_privacy,
  listPrivacy: r.default_list_privacy,
  personPrivacy: r.default_person_privacy,
  taskFilter: r.task_filter || 'all',
  showCompleted: r.show_completed,
  peopleSort: r.people_sort,
})
const toPrefRow = (p) => ({
  default_task_privacy: p.taskPrivacy,
  default_list_privacy: p.listPrivacy,
  default_person_privacy: p.personPrivacy,
  task_filter: p.taskFilter === 'all' ? null : p.taskFilter,
  show_completed: p.showCompleted,
  people_sort: p.peopleSort,
})

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// Loads people, organizations, and relationships; keeps them fresh via
// Supabase realtime; exposes CRUD helpers used throughout the app.
//
// Every mutation is optimistic: local state changes immediately (the UI never
// waits on the network), then the write syncs to Supabase in the background.
// Rows get client-generated ids so the local copy and the server row match.
// If a write fails, an error toast appears and we re-pull server state, which
// rolls the UI back to truth. Destructive actions raise an Undo toast.
// In demo mode the local apply is the whole story — nothing persists.
export function useData(session) {
  // Demo can be on at build time (no Supabase / VITE_DEMO) or chosen at runtime
  // via the auth screen's "Explore the demo" button (App passes session.demo).
  const isDemo = demoMode || session?.demo
  const [people, setPeople] = useState(isDemo ? demoPeople : [])
  const [orgs, setOrgs] = useState(isDemo ? demoOrgs : [])
  const [relationships, setRelationships] = useState(isDemo ? demoRelationships : [])
  const [interactions, setInteractions] = useState(isDemo ? demoInteractions : [])
  const [groups, setGroups] = useState(isDemo ? demoGroups : [])
  const [tasks, setTasks] = useState(isDemo ? demoTasks : [])
  const [completions, setCompletions] = useState(isDemo ? demoCompletions : [])
  const [taskLinks, setTaskLinks] = useState(isDemo ? demoTaskLinks : [])
  const [lists, setLists] = useState(isDemo ? demoLists : [])
  const [listItems, setListItems] = useState(isDemo ? demoListItems : [])
  // Remembered items for add-as-you-type autocomplete. Live: hydrated from the
  // list_catalog table. Demo: seeded from the demo items so suggestions work
  // without a DB. Either way addListItem keeps it current.
  const [listCatalog, setListCatalog] = useState(isDemo ? buildCatalog(demoListItems) : [])
  const [families, setFamilies] = useState(isDemo ? demoFamilies : [])
  const [keyDates, setKeyDates] = useState(isDemo ? demoKeyDates : [])
  const [habits, setHabits] = useState(isDemo ? demoHabits : [])
  const [habitEntries, setHabitEntries] = useState(isDemo ? demoHabitEntries : [])
  const [reminderSnoozes, setReminderSnoozes] = useState([])
  const [loading, setLoading] = useState(!isDemo)
  const [error, setError] = useState(null)

  // Two distinct identities, deliberately kept apart (live mode used to conflate
  // them, which broke privacy and snoozes):
  //   userId   = the signed-in auth user (auth.uid()). Backs `created_by` and the
  //              "Private — only me" check — people.created_by defaults to auth.uid().
  //   memberId = my household_members row id in the active household. Backs
  //              tasks.assignee, task_completions.completed_by, reminder_snoozes,
  //              and the "for me" attention badge.
  // In demo there's no auth, so both collapse to the localStorage member id (m-1).
  const userId = isDemo ? currentMemberId() : session?.user?.id || null
  const memberId = currentMemberId()

  // Active household id (from the cache useHousehold hydrates before the Shell
  // mounts). Every live insert is scoped to it; RLS rejects rows without it.
  // Demo writes never reach the DB, so household_id is left off there.
  const householdId = isDemo ? null : getHousehold()?.id || null
  const stamp = (row) => (householdId ? { ...row, household_id: householdId } : row)

  // Live, tasks.assignee / task_completions.completed_by are uuid FKs to
  // household_members (null = "Anyone"). The form/local model uses the sentinel
  // 'anyone' and member ids; map the sentinel to null on the way to the DB.
  // (Demo never writes to the DB, so its local rows keep 'anyone' for display.)
  const dbAssignee = (a) => (!a || a === 'anyone' ? null : a)
  const isUuid = (v) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

  const refresh = useCallback(async () => {
    if (isDemo) return
    const [p, o, r, i, g, t, c, tl, l, li, f, kd, sn, h, he, lc] = await Promise.all([
      supabase.from('people').select('*').order('name'),
      supabase.from('organizations').select('*').order('name'),
      supabase.from('relationships').select('*'),
      supabase.from('interactions').select('*').order('occurred_at', { ascending: false }),
      supabase.from('groups').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('task_completions').select('*').order('completed_at', { ascending: false }),
      supabase.from('task_links').select('*'),
      supabase.from('lists').select('*').order('created_at'),
      supabase.from('list_items').select('*').order('created_at'),
      supabase.from('families').select('*').order('name'),
      supabase.from('key_dates').select('*').order('date'),
      // My snoozes/dismissals (RLS already limits to own rows; member_id is
      // explicit too). Kept OUT of firstError below for the same reason
      // member_preferences is loaded separately — a missing Phase 6 table must
      // degrade to "no snoozes", not blank the whole app.
      supabase.from('reminder_snoozes').select('*').eq('member_id', memberId),
      // Habits (Phase: habit tracking). Kept OUT of firstError below, like
      // snoozes — a missing table (migration not yet run) must degrade to "no
      // habits", not blank the whole app.
      supabase.from('habits').select('*').order('created_at'),
      supabase.from('habit_entries').select('*'),
      // Recent-items catalog (autocomplete). Kept OUT of firstError too — a
      // missing table degrades to "no suggestions", not a blanked app.
      supabase.from('list_catalog').select('*'),
    ])
    const firstError =
      p.error ||
      o.error ||
      r.error ||
      i.error ||
      g.error ||
      t.error ||
      c.error ||
      tl.error ||
      l.error ||
      li.error ||
      f.error ||
      kd.error
    if (firstError) {
      setError(firstError.message)
    } else {
      setError(null)
      setPeople(p.data)
      setOrgs(o.data)
      setRelationships(r.data)
      setInteractions(i.data)
      setGroups(g.data)
      setTasks(t.data)
      setCompletions(c.data)
      setTaskLinks(tl.data)
      setLists(l.data)
      setListItems(li.data)
      setFamilies(f.data)
      setKeyDates(kd.data)
      // Snoozes load alongside but don't gate core data: if the table is absent
      // (migration not yet run) keep the prior in-session list instead of
      // wiping it — dismissals made this session still hold until reload.
      if (!sn.error) setReminderSnoozes(sn.data || [])
      if (!h.error) setHabits(h.data || [])
      if (!he.error) setHabitEntries(he.data || [])
      if (!lc.error) setListCatalog(lc.data || [])
    }
    setLoading(false)
  }, [isDemo, memberId])

  // App preferences are loaded apart from the main data pull so a pref-specific
  // failure — most likely the member_preferences table not existing yet because
  // its migration hasn't been run — degrades to localStorage defaults instead
  // of blocking the whole app. Result is folded into the appPrefs cache.
  const refreshPrefs = useCallback(async () => {
    if (isDemo || !memberId) return
    const { data, error: prefErr } = await supabase
      .from('member_preferences')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle()
    if (!prefErr && data) hydrateAppPrefs(memberId, fromPrefRow(data))
  }, [isDemo, memberId])

  // Notification prefs load the same way (separate table, same degrade-to-
  // localStorage-defaults safety net), folded into the notifyPrefs cache.
  const refreshNotifyPrefs = useCallback(async () => {
    if (isDemo || !memberId) return
    const { data, error: prefErr } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle()
    if (!prefErr && data) hydrateNotifyPrefs(memberId, fromNotifyRow(data))
  }, [isDemo, memberId])

  useEffect(() => {
    if (!session || isDemo) return
    refresh()
    refreshPrefs()
    refreshNotifyPrefs()
    // Writes from the client mirror to the table; the cache stays the source the
    // UI reads (bindAppPrefsRemote pushes the full merged prefs on each change).
    bindAppPrefsRemote((mid, prefs) =>
      sync(() =>
        supabase
          .from('member_preferences')
          .upsert({ member_id: mid, ...toPrefRow(prefs) }, { onConflict: 'member_id' }),
      ),
    )
    bindNotifyRemote((mid, prefs) =>
      sync(() =>
        supabase
          .from('notification_prefs')
          .upsert({ member_id: mid, ...toNotifyRow(prefs) }, { onConflict: 'member_id' }),
      ),
    )
    // Realtime fires one event per changed row, so a burst — a bulk import, a
    // multi-row edit, or our own optimistic write echoing back — would trigger a
    // full 13-table refetch per event. Coalesce them into a single refresh.
    let refreshTimer
    const debouncedRefresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(refresh, 250)
    }
    const channel = supabase
      .channel('salernidex-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, debouncedRefresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_preferences' },
        refreshPrefs,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notification_prefs' },
        refreshNotifyPrefs,
      )
      .subscribe()
    return () => {
      clearTimeout(refreshTimer)
      bindAppPrefsRemote(null)
      bindNotifyRemote(null)
      supabase.removeChannel(channel)
    }
    // refresh/refreshPrefs/refreshNotifyPrefs already close over isDemo (via
    // their own deps), and `sync` is intentionally left out — listing it would
    // re-subscribe the realtime channel on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, refresh, refreshPrefs, refreshNotifyPrefs])

  // Background write. `op` returns a Supabase query (thenable resolving to
  // { error }) or a promise from a multi-step async fn that throws on failure.
  // On error: toast + refresh, which snaps local state back to the server's.
  const sync = (op) => {
    if (isDemo) return
    Promise.resolve()
      .then(op)
      .then((res) => {
        if (res?.error) throw res.error
      })
      .catch((err) => {
        showToast(friendlyError(err), { variant: 'error', duration: 6000 })
        refresh()
      })
  }

  // For multi-step sync ops: throw if a step failed so sync() rolls back.
  const must = (res) => {
    if (res.error) throw res.error
    return res
  }

  const savePerson = (fields, id) => {
    const rowId = id || uuid()
    setPeople((prev) =>
      id
        ? prev.map((p) => (p.id === id ? { ...p, ...fields, updated_at: now() } : p))
        : [
            ...prev,
            {
              deleted_at: null,
              created_by: userId,
              created_at: now(),
              updated_at: now(),
              ...fields,
              id: rowId,
            },
          ],
    )
    sync(() =>
      id
        ? supabase.from('people').update(fields).eq('id', id)
        : supabase.from('people').insert(stamp({ ...fields, id: rowId })),
    )
  }

  // Soft delete = archive (reversible), so it gets an Undo toast.
  const deletePerson = (id) => {
    const name = people.find((p) => p.id === id)?.name
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: now() } : p)))
    sync(() =>
      supabase.from('people').update({ deleted_at: new Date().toISOString() }).eq('id', id),
    )
    showToast(name ? `Archived ${name}` : 'Contact archived', {
      actionLabel: 'Undo',
      onAction: () => restorePerson(id),
    })
  }

  const restorePerson = (id) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: null } : p)))
    sync(() => supabase.from('people').update({ deleted_at: null }).eq('id', id))
  }

  // Permanent, irreversible delete (the soft delete above is "archive"; this
  // actually removes the row). Relationships + interactions cascade via FK on
  // the DB; polymorphic task_links carry no FK, so we clear them by hand.
  // Stays awaited (not optimistic): callers confirm first and surface errors.
  const purgePerson = async (id) => {
    // Only the contact's creator may permanently delete it. Either member can
    // still archive (reversible); this guards the irreversible path. Unknown/
    // legacy created_by (null) is treated as yours so old data isn't stranded.
    const target = people.find((p) => p.id === id)
    if (target?.created_by && target.created_by !== userId) {
      throw new Error('Only the member who added this contact can delete it permanently.')
    }
    if (isDemo) {
      setPeople((prev) => prev.filter((p) => p.id !== id))
      setRelationships((prev) => prev.filter((r) => r.person_a_id !== id && r.person_b_id !== id))
      setInteractions((prev) => prev.filter((i) => i.person_id !== id))
      setTaskLinks((prev) =>
        prev.filter((tl) => !(tl.entity_type === 'person' && tl.entity_id === id)),
      )
      setKeyDates((prev) => prev.filter((kd) => kd.person_id !== id))
      return
    }
    await supabase.from('task_links').delete().eq('entity_type', 'person').eq('entity_id', id)
    const { error } = await supabase.from('people').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const saveOrg = (fields, id) => {
    const rowId = id || uuid()
    setOrgs((prev) =>
      id
        ? prev.map((o) => (o.id === id ? { ...o, ...fields, updated_at: now() } : o))
        : [
            ...prev,
            { created_at: now(), updated_at: now(), key_contacts: [], ...fields, id: rowId },
          ],
    )
    sync(() =>
      id
        ? supabase.from('organizations').update(fields).eq('id', id)
        : supabase.from('organizations').insert(stamp({ ...fields, id: rowId })),
    )
  }

  const deleteOrg = (id) => {
    setOrgs((prev) => prev.filter((o) => o.id !== id))
    sync(() => supabase.from('organizations').delete().eq('id', id))
  }

  // Find an org by name (case-insensitive, trimmed) or create one, returning the
  // row — so a typed "+ New organization" in PersonForm, or an imported ORG/CSV
  // name, resolves to a single real organizations row instead of free text.
  const findOrCreateOrg = (name) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return null
    const existing = orgs.find((o) => (o.name || '').trim().toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing
    const row = stamp({
      created_at: now(),
      updated_at: now(),
      key_contacts: [],
      name: trimmed,
      id: uuid(),
    })
    setOrgs((prev) => [...prev, row])
    sync(() => supabase.from('organizations').insert(stamp({ name: trimmed, id: row.id })))
    return row
  }

  const addRelationship = (fields) => {
    const rowId = uuid()
    setRelationships((prev) => [...prev, stamp({ ...fields, id: rowId, created_at: now() })])
    sync(() => supabase.from('relationships').insert(stamp({ ...fields, id: rowId })))
  }

  const deleteRelationship = (id) => {
    setRelationships((prev) => prev.filter((r) => r.id !== id))
    sync(() => supabase.from('relationships').delete().eq('id', id))
  }

  const addInteraction = (fields) => {
    const rowId = uuid()
    setInteractions((prev) => [stamp({ ...fields, id: rowId, created_at: now() }), ...prev])
    sync(() => supabase.from('interactions').insert(stamp({ ...fields, id: rowId })))
  }

  const deleteInteraction = (id) => {
    const gone = interactions.find((i) => i.id === id)
    setInteractions((prev) => prev.filter((i) => i.id !== id))
    sync(() => supabase.from('interactions').delete().eq('id', id))
    if (!gone) return
    showToast('Touchpoint deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        setInteractions((prev) => [gone, ...prev])
        sync(() => supabase.from('interactions').upsert(gone))
      },
    })
  }

  const addTask = (fields) => {
    const rowId = uuid()
    setTasks((prev) => [
      ...prev,
      stamp({
        recurrence: null,
        parent_id: null,
        is_project: false,
        is_heading: false,
        sort_order: null,
        completed_at: null,
        privacy_level: 'shared',
        assignee: 'anyone',
        notes: '',
        created_at: now(),
        updated_at: now(),
        ...fields,
        id: rowId,
      }),
    ])
    sync(() =>
      supabase
        .from('tasks')
        .insert(stamp({ ...fields, id: rowId, assignee: dbAssignee(fields.assignee) })),
    )
    return rowId // so callers can link the just-created task (e.g. from a person/org page)
  }

  const updateTask = (id, fields) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields, updated_at: now() } : t)))
    const dbFields =
      'assignee' in fields ? { ...fields, assignee: dbAssignee(fields.assignee) } : fields
    sync(() => supabase.from('tasks').update(dbFields).eq('id', id))
  }

  // Persist a manual ordering: [{ id, sort_order }, ...]. Local apply is one
  // pass; the network side is a few tiny updates (fractional ranks mean a drag
  // usually touches exactly one row).
  const reorderTasks = (updates) => {
    const byId = new Map(updates.map((u) => [u.id, u.sort_order]))
    setTasks((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, sort_order: byId.get(t.id) } : t)))
    sync(async () => {
      for (const u of updates) {
        must(await supabase.from('tasks').update({ sort_order: u.sort_order }).eq('id', u.id))
      }
    })
  }

  const reorderListItems = (updates) => {
    const byId = new Map(updates.map((u) => [u.id, u.sort_order]))
    setListItems((prev) =>
      prev.map((it) => (byId.has(it.id) ? { ...it, sort_order: byId.get(it.id) } : it)),
    )
    sync(async () => {
      for (const u of updates) {
        must(await supabase.from('list_items').update({ sort_order: u.sort_order }).eq('id', u.id))
      }
    })
  }

  const deleteTask = (id) => {
    // cascade to subtasks + completions + links (mirrors on-delete-cascade),
    // snapshotting everything so Undo can put it all back.
    const target = tasks.find((t) => t.id === id)
    const goneTasks = tasks.filter((t) => t.id === id || t.parent_id === id)
    const goneIds = new Set(goneTasks.map((t) => t.id))
    const goneCompletions = completions.filter((c) => goneIds.has(c.task_id))
    const goneLinks = taskLinks.filter((tl) => goneIds.has(tl.task_id))
    setTasks((prev) => prev.filter((t) => !goneIds.has(t.id)))
    setCompletions((prev) => prev.filter((c) => !goneIds.has(c.task_id)))
    setTaskLinks((prev) => prev.filter((tl) => !goneIds.has(tl.task_id)))
    sync(() => supabase.from('tasks').delete().eq('id', id))
    showToast(target ? `Deleted “${target.title}”` : 'Task deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        setTasks((prev) => [...prev, ...goneTasks])
        setCompletions((prev) => [...goneCompletions, ...prev])
        setTaskLinks((prev) => [...prev, ...goneLinks])
        sync(async () => {
          // parent before children (self-referencing FK)
          must(await supabase.from('tasks').upsert(goneTasks.filter((t) => t.id === id)))
          const children = goneTasks.filter((t) => t.id !== id)
          if (children.length) must(await supabase.from('tasks').upsert(children))
          if (goneCompletions.length)
            must(await supabase.from('task_completions').upsert(goneCompletions))
          if (goneLinks.length) must(await supabase.from('task_links').upsert(goneLinks))
        })
      },
    })
  }

  // Attach a person/organization/group to a task or project. `entity_type` is
  // 'person' | 'organization' | 'group'; `role` is optional free text (e.g. 'plumber').
  const addTaskLink = (fields) => {
    const dup = taskLinks.some(
      (tl) =>
        tl.task_id === fields.task_id &&
        tl.entity_type === fields.entity_type &&
        tl.entity_id === fields.entity_id,
    )
    if (dup) return
    const rowId = uuid()
    setTaskLinks((prev) => [
      ...prev,
      stamp({ role: null, ...fields, id: rowId, created_at: now() }),
    ])
    sync(() => supabase.from('task_links').insert(stamp({ ...fields, id: rowId })))
  }

  const deleteTaskLink = (id) => {
    setTaskLinks((prev) => prev.filter((tl) => tl.id !== id))
    sync(() => supabase.from('task_links').delete().eq('id', id))
  }

  // Check a task off (or un-check a one-off). Rolls recurring tasks forward and,
  // for non-subtasks, records who/when in the completion log for accountability.
  const completeTask = (task, done) => {
    const fields = completionFields(task, done)
    const by = currentMember()?.id || null // who actually checked it off
    const log = !task.parent_id // don't clutter history with subtask check-offs
    const completionId = uuid()
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, ...fields, updated_at: now() } : t)),
    )
    if (log && done) {
      setCompletions((prev) => [
        stamp({
          id: completionId,
          task_id: task.id,
          completed_at: now(),
          completed_by: by,
          created_at: now(),
        }),
        ...prev,
      ])
    } else if (log && !done) {
      // undo a one-off: drop its most recent completion
      setCompletions((prev) => {
        const idx = prev.findIndex((c) => c.task_id === task.id)
        if (idx === -1) return prev
        const copy = [...prev]
        copy.splice(idx, 1)
        return copy
      })
    }
    sync(async () => {
      must(await supabase.from('tasks').update(fields).eq('id', task.id))
      if (log && done) {
        must(
          await supabase.from('task_completions').insert(
            stamp({
              id: completionId,
              task_id: task.id,
              completed_at: new Date().toISOString(),
              completed_by: by,
            }),
          ),
        )
      } else if (log && !done) {
        const { data, error } = await supabase
          .from('task_completions')
          .select('id')
          .eq('task_id', task.id)
          .order('completed_at', { ascending: false })
          .limit(1)
        if (error) throw error
        if (data?.[0]) must(await supabase.from('task_completions').delete().eq('id', data[0].id))
      }
    })

    // A recurring roll-forward is the one check-off that can't be reversed by
    // re-toggling — the task immediately reads unchecked at its new date — so an
    // accidental tap would silently advance the schedule. Offer Undo, like the
    // deletes do. (One-offs re-toggle freely, so they don't need this.)
    const rolledForward = done && task.recurrence && fields.due_date && fields.completed_at === null
    if (rolledForward) {
      showToast(`Checked off “${task.title}”`, {
        actionLabel: 'Undo',
        onAction: () => {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    due_date: task.due_date,
                    completed_at: task.completed_at,
                    updated_at: now(),
                  }
                : t,
            ),
          )
          if (log) setCompletions((prev) => prev.filter((c) => c.id !== completionId))
          sync(async () => {
            must(
              await supabase
                .from('tasks')
                .update({ due_date: task.due_date, completed_at: task.completed_at })
                .eq('id', task.id),
            )
            if (log) must(await supabase.from('task_completions').delete().eq('id', completionId))
          })
        },
      })
    }
  }

  // Skip the current occurrence of a recurring task without logging it as done:
  // records the date in the rule's exdates and rolls to the next occurrence (or
  // closes the task if the series is over). Reversible via Undo.
  const skipTaskOccurrence = (task) => {
    const fields = skipFields(task)
    if (!fields) return
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, ...fields, updated_at: now() } : t)),
    )
    sync(() => supabase.from('tasks').update(fields).eq('id', task.id))
    showToast(`Skipped this one · “${task.title}”`, {
      actionLabel: 'Undo',
      onAction: () => {
        const revert = {
          recurrence: task.recurrence,
          due_date: task.due_date,
          completed_at: task.completed_at ?? null,
        }
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...revert, updated_at: now() } : t)),
        )
        sync(() => supabase.from('tasks').update(revert).eq('id', task.id))
      },
    })
  }

  const saveList = (fields, id) => {
    const rowId = id || uuid()
    setLists((prev) =>
      id
        ? prev.map((l) => (l.id === id ? { ...l, ...fields, updated_at: now() } : l))
        : [
            ...prev,
            stamp({
              icon: '📝',
              privacy_level: 'family_shared',
              created_at: now(),
              updated_at: now(),
              ...fields,
              id: rowId,
            }),
          ],
    )
    sync(() =>
      id
        ? supabase.from('lists').update(fields).eq('id', id)
        : supabase.from('lists').insert(stamp({ ...fields, id: rowId })),
    )
  }

  const deleteList = (id) => {
    const goneList = lists.find((l) => l.id === id)
    const goneItems = listItems.filter((it) => it.list_id === id)
    setLists((prev) => prev.filter((l) => l.id !== id))
    setListItems((prev) => prev.filter((it) => it.list_id !== id))
    sync(() => supabase.from('lists').delete().eq('id', id))
    showToast(goneList ? `Deleted “${goneList.name}”` : 'List deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        if (goneList) setLists((prev) => [...prev, goneList])
        setListItems((prev) => [...prev, ...goneItems])
        sync(async () => {
          if (goneList) must(await supabase.from('lists').upsert(goneList))
          if (goneItems.length) must(await supabase.from('list_items').upsert(goneItems))
        })
      },
    })
  }

  // Add an item to a list. opts carries the optional extras: a detail `note`, a
  // structured `qty` ("2 lbs"), an `assignee` (member id or 'anyone'), and a
  // `category` override (e.g. from tapping a remembered suggestion — skips the
  // keyword guess). Adding also records the item in the recent-items catalog so
  // it autocompletes next time (private lists are exempt — see recordCatalog).
  const addListItem = (listId, text, opts = {}) => {
    const { note = null, qty = null, assignee = 'anyone', category: categoryOverride } = opts
    const list = lists.find((l) => l.id === listId)
    // Grocery lists file each item into an aisle on the way in (overridable). A
    // suggestion supplies its remembered aisle; otherwise guess from the text.
    const category = categoryOverride ?? (list?.kind === 'grocery' ? categorize(text) : null)
    const rowId = uuid()
    const row = { id: rowId, list_id: listId, text, note, qty, category, assignee }
    setListItems((prev) => [
      ...prev,
      stamp({ ...row, is_heading: false, checked_at: null, sort_order: null, created_at: now() }),
    ])
    sync(() =>
      supabase.from('list_items').insert(stamp({ ...row, assignee: dbAssignee(assignee) })),
    )
    if (list) recordCatalog(list, text, category)
  }

  // Remember an item for autocomplete: bump its catalog entry (count + recency +
  // learned aisle). Skipped for "Private — only me" lists so their item names
  // can't surface as suggestions to another household member.
  const recordCatalog = (list, text, category) => {
    if (!text.trim() || list.privacy_level === PRIVATE_LEVEL) return
    const at = now()
    const next = bumpCatalog(listCatalog, {
      text,
      category,
      at,
      id: uuid(),
      household_id: householdId,
    })
    setListCatalog(next)
    const entry = next.find((e) => e.norm === catalogKey(text))
    sync(() =>
      supabase.from('list_catalog').upsert(
        {
          household_id: householdId,
          text: entry.text,
          norm: entry.norm,
          category: entry.category,
          use_count: entry.use_count,
          last_used_at: at,
        },
        { onConflict: 'household_id,norm' },
      ),
    )
  }

  // A Things-style section header on a standard list (is_heading row). The items
  // that follow it in manual order belong to that section.
  const addListHeading = (listId, text) => {
    const rowId = uuid()
    const row = { id: rowId, list_id: listId, text, is_heading: true }
    setListItems((prev) => [
      ...prev,
      stamp({
        ...row,
        note: null,
        category: null,
        checked_at: null,
        sort_order: null,
        created_at: now(),
      }),
    ])
    sync(() => supabase.from('list_items').insert(stamp(row)))
  }

  const toggleListItem = (item) => {
    const checked_at = item.checked_at ? null : new Date().toISOString()
    setListItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, checked_at } : it)))
    sync(() => supabase.from('list_items').update({ checked_at }).eq('id', item.id))
  }

  // Inline edits to an item (text, note, qty, aisle, assignee) — tap-to-edit in
  // ListDetail. assignee uses the 'anyone' sentinel locally; map it to null for
  // the DB, like updateTask does.
  const updateListItem = (id, fields) => {
    setListItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...fields } : it)))
    const dbFields =
      'assignee' in fields ? { ...fields, assignee: dbAssignee(fields.assignee) } : fields
    sync(() => supabase.from('list_items').update(dbFields).eq('id', id))
  }

  const deleteListItem = (id) => {
    const gone = listItems.find((it) => it.id === id)
    setListItems((prev) => prev.filter((it) => it.id !== id))
    sync(() => supabase.from('list_items').delete().eq('id', id))
    if (!gone) return
    showToast(`Deleted “${gone.text}”`, {
      actionLabel: 'Undo',
      onAction: () => {
        setListItems((prev) => [...prev, gone])
        sync(() => supabase.from('list_items').upsert(gone))
      },
    })
  }

  // Clear all checked items from a list (e.g. after a grocery run).
  const clearCheckedItems = (listId) => {
    const gone = listItems.filter((it) => it.list_id === listId && it.checked_at)
    if (!gone.length) return
    setListItems((prev) => prev.filter((it) => !(it.list_id === listId && it.checked_at)))
    sync(() =>
      supabase.from('list_items').delete().eq('list_id', listId).not('checked_at', 'is', null),
    )
    showToast(`Cleared ${gone.length} ${gone.length === 1 ? 'item' : 'items'}`, {
      actionLabel: 'Undo',
      onAction: () => {
        setListItems((prev) => [...prev, ...gone])
        sync(() => supabase.from('list_items').upsert(gone))
      },
    })
  }

  // Contact family units ("The Parks"). saveFamily returns the saved row so
  // callers (e.g. PersonForm's inline "new family") can link to it right away.
  const saveFamily = (fields, id) => {
    const row = id
      ? { ...(families.find((f) => f.id === id) || {}), ...fields, id, updated_at: now() }
      : stamp({ created_at: now(), updated_at: now(), ...fields, id: uuid() })
    setFamilies((prev) => (id ? prev.map((f) => (f.id === id ? row : f)) : [...prev, row]))
    sync(() =>
      id
        ? supabase.from('families').update(fields).eq('id', id)
        : supabase.from('families').insert(stamp({ ...fields, id: row.id })),
    )
    return row
  }

  // Deleting a family never deletes its people — they just become familyless
  // (mirrors the FK's on-delete-set-null).
  const deleteFamily = (id) => {
    setFamilies((prev) => prev.filter((f) => f.id !== id))
    setPeople((prev) => prev.map((p) => (p.family_id === id ? { ...p, family_id: null } : p)))
    sync(() => supabase.from('families').delete().eq('id', id))
  }

  const addKeyDate = (fields) => {
    const rowId = uuid()
    setKeyDates((prev) => [...prev, { annual: true, ...fields, id: rowId, created_at: now() }])
    sync(() => supabase.from('key_dates').insert(stamp({ ...fields, id: rowId })))
  }

  const deleteKeyDate = (id) => {
    setKeyDates((prev) => prev.filter((kd) => kd.id !== id))
    sync(() => supabase.from('key_dates').delete().eq('id', id))
  }

  // Quiet an attention item for the current member only (their partner still
  // sees it). until = null means "don't remind me about this again";
  // otherwise hidden through that timestamp. Upserts per (member, item).
  // Live counterpart: reminder_snoozes (schema.sql Phase 6 section).
  const snoozeReminder = ({ kind, target_key, until }) => {
    setReminderSnoozes((prev) => [
      ...prev.filter((s) => !(s.member_id === memberId && s.target_key === target_key)),
      { id: uuid(), member_id: memberId, kind, target_key, until, created_at: now() },
    ])
    sync(() =>
      supabase
        .from('reminder_snoozes')
        .upsert(
          { member_id: memberId, kind, target_key, until },
          { onConflict: 'member_id,kind,target_key' },
        ),
    )
  }

  const saveGroup = (fields, id) => {
    const rowId = id || uuid()
    setGroups((prev) =>
      id
        ? prev.map((g) => (g.id === id ? { ...g, ...fields, updated_at: now() } : g))
        : [...prev, stamp({ created_at: now(), updated_at: now(), ...fields, id: rowId })],
    )
    sync(() =>
      id
        ? supabase.from('groups').update(fields).eq('id', id)
        : supabase.from('groups').insert(stamp({ ...fields, id: rowId })),
    )
  }

  const deleteGroup = (id) => {
    setGroups((prev) => prev.filter((g) => g.id !== id))
    sync(() => supabase.from('groups').delete().eq('id', id))
  }

  // Habits are personal (owned by the current member). Create stamps member_id;
  // edits patch in place. Archiving keeps the row + its history but drops it
  // from the active list; deleting cascades its entries (FK on delete cascade).
  const addHabit = (fields) => {
    const rowId = uuid()
    const row = stamp({
      created_at: now(),
      updated_at: now(),
      ...fields,
      id: rowId,
      member_id: memberId,
    })
    setHabits((prev) => [...prev, row])
    sync(() => supabase.from('habits').insert(stamp({ ...fields, id: rowId, member_id: memberId })))
    return rowId
  }

  const updateHabit = (id, fields) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...fields, updated_at: now() } : h)))
    sync(() => supabase.from('habits').update(fields).eq('id', id))
  }

  const archiveHabit = (id, archived = true) =>
    updateHabit(id, { archived_at: archived ? now() : null })

  const deleteHabit = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id))
    setHabitEntries((prev) => prev.filter((e) => e.habit_id !== id))
    sync(() => supabase.from('habits').delete().eq('id', id))
  }

  // Log (or change) a habit's value for one day. One row per (habit_id, date):
  // upsert replaces. Absence already means 0, so logging 0 is just an explicit
  // confirmation of a clean day. `note` is preserved across value-only logs
  // (pass a string to set it, '' to clear); omit it and an existing note stays.
  const logHabit = (habitId, date, value, skipped = false, note = undefined) => {
    const existing = habitEntries.find((e) => e.habit_id === habitId && e.date === date)
    const noteVal = note === undefined ? (existing?.note ?? null) : note || null
    const row = {
      id: existing?.id || uuid(),
      habit_id: habitId,
      date,
      value,
      skipped,
      note: noteVal,
    }
    const next = [...habitEntries.filter((e) => e !== existing), row]
    setHabitEntries(next)
    sync(() =>
      supabase
        .from('habit_entries')
        .upsert(stamp({ habit_id: habitId, date, value, skipped, note: noteVal }), {
          onConflict: 'habit_id,date',
        }),
    )
    maybeCelebrate(habitId, date, value, skipped, existing, next)
  }

  // Streak milestones: a small celebration the first time a fresh success today
  // pushes the streak onto a milestone. Fires only on today, only on the
  // success edge (not every increment), so it never nags or repeats.
  const maybeCelebrate = (habitId, date, value, skipped, existing, next) => {
    if (skipped || date !== toISODate(new Date())) return
    const habit = habits.find((h) => h.id === habitId)
    if (!habit || !habit.track_streak) return
    const wasSuccess = isSuccess(habit, Number(existing?.value ?? 0)) && !existing?.skipped
    if (wasSuccess || !isSuccess(habit, Number(value))) return // only on the not-yet→success edge
    const streak = currentStreak(habit, entryMap(next), new Date())
    if (!MILESTONES.has(streak)) return
    haptics.success()
    const unit = isWeekly(habit) ? 'week' : 'day'
    showToast(`🔥 ${streak}-${unit} streak — ${habit.name}!`)
  }

  const reorderHabits = (updates) => {
    const byId = new Map(updates.map((u) => [u.id, u.sort_order]))
    setHabits((prev) =>
      prev.map((h) => (byId.has(h.id) ? { ...h, sort_order: byId.get(h.id) } : h)),
    )
    sync(async () => {
      for (const u of updates) {
        must(await supabase.from('habits').update({ sort_order: u.sort_order }).eq('id', u.id))
      }
    })
  }

  // Vacation / pause: rest every scheduled day in [startISO, endISO] inclusive,
  // reusing the rest-day primitive — so the streak engine already treats the
  // span as transparent (no schema or streak-math change). We never clobber a
  // real logged value; only unlogged or already-rested days become rest days.
  const parseISO = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const pauseHabit = (habitId, startISO, endISO) => {
    const habit = habits.find((h) => h.id === habitId)
    if (!habit) return
    const rows = []
    const d = parseISO(startISO)
    const end = parseISO(endISO)
    while (d <= end) {
      const iso = toISODate(d)
      const existing = habitEntries.find((e) => e.habit_id === habitId && e.date === iso)
      if (
        isScheduled(habit, d) &&
        (!existing || existing.skipped || Number(existing.value) === 0)
      ) {
        rows.push({
          id: existing?.id || uuid(),
          habit_id: habitId,
          date: iso,
          value: 0,
          skipped: true,
          note: existing?.note ?? null,
        })
      }
      d.setDate(d.getDate() + 1)
    }
    if (!rows.length) return
    const dates = new Set(rows.map((r) => r.date))
    setHabitEntries((prev) => [
      ...prev.filter((e) => !(e.habit_id === habitId && dates.has(e.date))),
      ...rows,
    ])
    sync(() =>
      supabase.from('habit_entries').upsert(
        rows.map((r) => stamp(r)),
        { onConflict: 'habit_id,date' },
      ),
    )
    showToast(`Paused ${habit.name} · ${rows.length} day${rows.length === 1 ? '' : 's'}`, {
      actionLabel: 'Undo',
      onAction: () => resumeHabit(habitId, startISO),
    })
  }

  // End a break: drop the auto-created rest days (value 0, no note) from fromISO
  // onward, so the habit comes back. Hand-written rest days with a note stay.
  const resumeHabit = (habitId, fromISO) => {
    const gone = habitEntries.filter(
      (e) =>
        e.habit_id === habitId &&
        e.skipped &&
        Number(e.value) === 0 &&
        !e.note &&
        e.date >= fromISO,
    )
    if (!gone.length) return
    const ids = new Set(gone.map((e) => e.id))
    setHabitEntries((prev) => prev.filter((e) => !ids.has(e.id)))
    sync(() =>
      supabase
        .from('habit_entries')
        .delete()
        .in('id', [...ids]),
    )
  }

  // Bulk import stays awaited (not optimistic): ImportExport shows progress
  // and reports row-level errors inline.
  const importPeople = async (rows) => {
    // Imported records (CSV/vCard) carry an `organization` *name*. Resolve each
    // to a single organizations row — creating any missing one once per name so
    // the same company in 50 rows yields one org — then store organization_id.
    const orgByName = new Map(orgs.map((o) => [(o.name || '').trim().toLowerCase(), o]))
    const newOrgs = []
    const resolveOrg = (name) => {
      const trimmed = (name || '').trim()
      if (!trimmed) return null
      const key = trimmed.toLowerCase()
      let o = orgByName.get(key)
      if (!o) {
        o = stamp({
          created_at: now(),
          updated_at: now(),
          key_contacts: [],
          name: trimmed,
          id: uuid(),
        })
        orgByName.set(key, o)
        newOrgs.push(o)
      }
      return o.id
    }
    const peopleRows = rows.map(({ organization, ...rest }) => ({
      ...rest,
      organization_id: rest.organization_id ?? resolveOrg(organization),
    }))

    if (isDemo) {
      if (newOrgs.length) setOrgs((prev) => [...prev, ...newOrgs])
      setPeople((prev) => [
        ...prev,
        ...peopleRows.map((r) => ({
          deleted_at: null,
          created_by: userId,
          created_at: now(),
          updated_at: now(),
          privacy_level: 'shared',
          ...r,
          id: uuid(),
        })),
      ])
      return
    }
    if (newOrgs.length) {
      const { error: orgErr } = await supabase
        .from('organizations')
        .insert(newOrgs.map((o) => stamp({ name: o.name, id: o.id })))
      if (orgErr) throw orgErr
    }
    const { error } = await supabase.from('people').insert(peopleRows.map(stamp))
    if (error) throw error
    await refresh()
  }

  // Full-database restore from a JSON backup. Round-trips with the export in
  // ImportExport so data stays portable (e.g. moving off Supabase later).
  // Upserts by id so re-importing a backup is idempotent and merges cleanly.
  const restoreBackup = async (backup) => {
    const tables = {
      families: backup.families,
      organizations: backup.organizations,
      people: backup.people,
      relationships: backup.relationships,
      interactions: backup.interactions,
      key_dates: backup.key_dates,
      groups: backup.groups,
      tasks: backup.tasks,
      task_completions: backup.task_completions,
      task_links: backup.task_links,
      lists: backup.lists,
      list_items: backup.list_items,
      reminder_snoozes: backup.reminder_snoozes,
      habits: backup.habits,
      habit_entries: backup.habit_entries,
    }
    // Backups taken before migration 0023 store the old 'marc_only' privacy
    // label; map it to 'private' so they still restore against the renamed enum.
    for (const t of ['people', 'organizations', 'tasks', 'lists']) {
      if (Array.isArray(tables[t])) {
        tables[t] = tables[t].map((row) =>
          row?.privacy_level === 'marc_only' ? { ...row, privacy_level: 'private' } : row,
        )
      }
    }
    // Backups v<=6 stored people.organization as a name string. Map it to
    // organization_id, find-or-creating orgs (seeded from both the backup's
    // organizations and the current ones) so they restore as real rows.
    if (
      Array.isArray(tables.people) &&
      tables.people.some((p) => p.organization && !p.organization_id)
    ) {
      const incomingOrgs = Array.isArray(tables.organizations) ? tables.organizations : []
      const byName = new Map()
      for (const o of [...orgs, ...incomingOrgs]) {
        const k = (o.name || '').trim().toLowerCase()
        if (k && !byName.has(k)) byName.set(k, o)
      }
      const created = []
      const resolveOrg = (name) => {
        const trimmed = (name || '').trim()
        if (!trimmed) return null
        const key = trimmed.toLowerCase()
        let o = byName.get(key)
        if (!o) {
          o = stamp({
            created_at: now(),
            updated_at: now(),
            key_contacts: [],
            name: trimmed,
            id: uuid(),
          })
          byName.set(key, o)
          created.push(o)
        }
        return o.id
      }
      tables.people = tables.people.map(({ organization, ...rest }) =>
        rest.organization_id ? rest : { ...rest, organization_id: resolveOrg(organization) },
      )
      if (created.length) tables.organizations = [...incomingOrgs, ...created]
    }
    if (isDemo) {
      const merge = (prev, incoming) => {
        if (!Array.isArray(incoming)) return prev
        const map = new Map(prev.map((row) => [row.id, row]))
        for (const row of incoming) map.set(row.id, { ...map.get(row.id), ...row })
        return [...map.values()]
      }
      if (tables.families) setFamilies((prev) => merge(prev, tables.families))
      if (tables.organizations) setOrgs((prev) => merge(prev, tables.organizations))
      if (tables.people) setPeople((prev) => merge(prev, tables.people))
      if (tables.key_dates) setKeyDates((prev) => merge(prev, tables.key_dates))
      if (tables.relationships) setRelationships((prev) => merge(prev, tables.relationships))
      if (tables.interactions) setInteractions((prev) => merge(prev, tables.interactions))
      if (tables.groups) setGroups((prev) => merge(prev, tables.groups))
      if (tables.tasks) setTasks((prev) => merge(prev, tables.tasks))
      if (tables.task_completions) setCompletions((prev) => merge(prev, tables.task_completions))
      if (tables.task_links) setTaskLinks((prev) => merge(prev, tables.task_links))
      if (tables.lists) setLists((prev) => merge(prev, tables.lists))
      if (tables.list_items) setListItems((prev) => merge(prev, tables.list_items))
      if (tables.reminder_snoozes)
        setReminderSnoozes((prev) => merge(prev, tables.reminder_snoozes))
      if (tables.habits) setHabits((prev) => merge(prev, tables.habits))
      if (tables.habit_entries) setHabitEntries((prev) => merge(prev, tables.habit_entries))
      return
    }
    // Live: re-home each row into the active household, sanitize legacy ids
    // (a backup may carry another household's id, demo localStorage member ids
    // in assignee/completed_by, or pre-multitenancy snooze member ids), then
    // upsert in dependency order (parents before their children).
    const prep = (name, rows) =>
      rows.map((r) => {
        // reminder_snoozes is member-scoped (no household_id); the rest are
        // household-scoped. Restoring snoozes makes them mine.
        const row = name === 'reminder_snoozes' ? { ...r, member_id: memberId } : stamp({ ...r })
        if (name === 'tasks') row.assignee = isUuid(row.assignee) ? row.assignee : null
        if (name === 'task_completions')
          row.completed_by = isUuid(row.completed_by) ? row.completed_by : null
        return row
      })
    for (const name of [
      'families',
      'organizations',
      'people',
      'relationships',
      'interactions',
      'key_dates',
      'groups',
      'tasks',
      'task_completions',
      'task_links',
      'lists',
      'list_items',
      'reminder_snoozes',
      'habits',
      'habit_entries',
    ]) {
      const rows = tables[name]
      if (!rows?.length) continue
      const { error } = await supabase.from(name).upsert(prep(name, rows))
      if (error) throw error
    }
    await refresh()
  }

  // "Private — only me" enforcement (lib/privacy.js): filtered once here, so
  // every view, search, group, reminder, badge, and CSV/vCard export inherits
  // it. The all* arrays bypass the filter for the lossless JSON backup only.
  const visiblePeople = filterVisible(people, userId)
  const visibleOrgs = filterVisible(orgs, userId)
  const visibleTasks = filterVisible(tasks, userId)
  const visibleLists = filterVisible(lists, userId)
  const visibleListIds = new Set(visibleLists.map((l) => l.id))
  const visibleListItems =
    visibleLists.length === lists.length
      ? listItems
      : listItems.filter((it) => visibleListIds.has(it.list_id))

  // Habits are personal by default — the main list is the current member's.
  // Anything a *different* member flagged `shared` shows up read-only in a
  // "Shared with you" section (the couple's-OS dimension). In demo, "me" is the
  // seed owner m-1 so the partner's shared habits demo correctly. Soft-deleted
  // always hidden.
  const meId = isDemo ? 'm-1' : memberId
  const liveHabits = habits.filter((h) => !h.deleted_at)
  const myHabits = liveHabits.filter((h) => h.member_id === meId)
  const sharedHabits = liveHabits.filter((h) => h.member_id !== meId && h.shared)

  return {
    people: visiblePeople,
    orgs: visibleOrgs,
    relationships,
    interactions,
    groups,
    tasks: visibleTasks,
    completions,
    taskLinks,
    lists: visibleLists,
    listItems: visibleListItems,
    listCatalog,
    families,
    keyDates,
    reminderSnoozes,
    habits: myHabits,
    sharedHabits,
    habitEntries,
    allPeople: people,
    allOrgs: orgs,
    allTasks: tasks,
    allLists: lists,
    allListItems: listItems,
    allHabits: habits,
    allHabitEntries: habitEntries,
    loading,
    error,
    userId,
    memberId,
    refresh,
    savePerson,
    deletePerson,
    restorePerson,
    purgePerson,
    saveOrg,
    findOrCreateOrg,
    deleteOrg,
    addRelationship,
    deleteRelationship,
    addInteraction,
    deleteInteraction,
    addTask,
    updateTask,
    deleteTask,
    completeTask,
    skipTaskOccurrence,
    reorderTasks,
    reorderListItems,
    addTaskLink,
    deleteTaskLink,
    saveList,
    deleteList,
    addListItem,
    addListHeading,
    toggleListItem,
    updateListItem,
    deleteListItem,
    clearCheckedItems,
    saveGroup,
    deleteGroup,
    addHabit,
    updateHabit,
    archiveHabit,
    deleteHabit,
    logHabit,
    pauseHabit,
    resumeHabit,
    reorderHabits,
    saveFamily,
    deleteFamily,
    addKeyDate,
    deleteKeyDate,
    snoozeReminder,
    importPeople,
    restoreBackup,
  }
}
