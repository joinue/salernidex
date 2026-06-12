import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { demoMode, demoPeople, demoOrgs, demoRelationships, demoGroups, demoInteractions, demoTasks, demoCompletions, demoTaskLinks, demoLists, demoListItems, demoFamilies, demoKeyDates } from '../lib/demo'
import { completionFields } from '../lib/tasks'
import { currentMember, currentMemberId, getHousehold } from '../lib/household'
import { showToast } from '../lib/toast'
import { filterVisible } from '../lib/privacy'
import { hydrateAppPrefs, bindAppPrefsRemote } from '../lib/appPrefs'

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
  const [families, setFamilies] = useState(isDemo ? demoFamilies : [])
  const [keyDates, setKeyDates] = useState(isDemo ? demoKeyDates : [])
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
  const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

  const refresh = useCallback(async () => {
    if (isDemo) return
    const [p, o, r, i, g, t, c, tl, l, li, f, kd] = await Promise.all([
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
    ])
    const firstError = p.error || o.error || r.error || i.error || g.error || t.error || c.error || tl.error || l.error || li.error || f.error || kd.error
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
    }
    setLoading(false)
  }, [isDemo])

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

  useEffect(() => {
    if (!session || isDemo) return
    refresh()
    refreshPrefs()
    // Writes from the client mirror to the table; the cache stays the source the
    // UI reads (bindAppPrefsRemote pushes the full merged prefs on each change).
    bindAppPrefsRemote((mid, prefs) =>
      sync(() =>
        supabase
          .from('member_preferences')
          .upsert({ member_id: mid, ...toPrefRow(prefs) }, { onConflict: 'member_id' })
      )
    )
    const channel = supabase
      .channel('salernidex-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_preferences' }, refreshPrefs)
      .subscribe()
    return () => {
      bindAppPrefsRemote(null)
      supabase.removeChannel(channel)
    }
  }, [session, refresh, refreshPrefs])

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
        showToast(err.message || "Couldn't save that change", { variant: 'error', duration: 6000 })
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
        : [...prev, { deleted_at: null, created_by: userId, created_at: now(), updated_at: now(), ...fields, id: rowId }]
    )
    sync(() =>
      id
        ? supabase.from('people').update(fields).eq('id', id)
        : supabase.from('people').insert(stamp({ ...fields, id: rowId }))
    )
  }

  // Soft delete = archive (reversible), so it gets an Undo toast.
  const deletePerson = (id) => {
    const name = people.find((p) => p.id === id)?.name
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: now() } : p)))
    sync(() => supabase.from('people').update({ deleted_at: new Date().toISOString() }).eq('id', id))
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
      setTaskLinks((prev) => prev.filter((tl) => !(tl.entity_type === 'person' && tl.entity_id === id)))
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
        : [...prev, { created_at: now(), updated_at: now(), key_contacts: [], ...fields, id: rowId }]
    )
    sync(() =>
      id
        ? supabase.from('organizations').update(fields).eq('id', id)
        : supabase.from('organizations').insert(stamp({ ...fields, id: rowId }))
    )
  }

  const deleteOrg = (id) => {
    setOrgs((prev) => prev.filter((o) => o.id !== id))
    sync(() => supabase.from('organizations').delete().eq('id', id))
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
      stamp({ recurrence: null, parent_id: null, is_project: false, is_heading: false, sort_order: null, completed_at: null, privacy_level: 'shared', assignee: 'anyone', notes: '', created_at: now(), updated_at: now(), ...fields, id: rowId }),
    ])
    sync(() => supabase.from('tasks').insert(stamp({ ...fields, id: rowId, assignee: dbAssignee(fields.assignee) })))
  }

  const updateTask = (id, fields) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields, updated_at: now() } : t)))
    const dbFields = 'assignee' in fields ? { ...fields, assignee: dbAssignee(fields.assignee) } : fields
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
    setListItems((prev) => prev.map((it) => (byId.has(it.id) ? { ...it, sort_order: byId.get(it.id) } : it)))
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
          if (goneCompletions.length) must(await supabase.from('task_completions').upsert(goneCompletions))
          if (goneLinks.length) must(await supabase.from('task_links').upsert(goneLinks))
        })
      },
    })
  }

  // Attach a person/organization to a task or project. `entity_type` is
  // 'person' | 'organization'; `role` is optional free text (e.g. 'plumber').
  const addTaskLink = (fields) => {
    const dup = taskLinks.some(
      (tl) => tl.task_id === fields.task_id && tl.entity_type === fields.entity_type && tl.entity_id === fields.entity_id
    )
    if (dup) return
    const rowId = uuid()
    setTaskLinks((prev) => [...prev, stamp({ role: null, ...fields, id: rowId, created_at: now() })])
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
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...fields, updated_at: now() } : t)))
    if (log && done) {
      setCompletions((prev) => [stamp({ id: completionId, task_id: task.id, completed_at: now(), completed_by: by, created_at: now() }), ...prev])
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
        must(await supabase.from('task_completions').insert({ id: completionId, task_id: task.id, completed_at: new Date().toISOString(), completed_by: by }))
      } else if (log && !done) {
        const { data, error } = await supabase.from('task_completions').select('id').eq('task_id', task.id).order('completed_at', { ascending: false }).limit(1)
        if (error) throw error
        if (data?.[0]) must(await supabase.from('task_completions').delete().eq('id', data[0].id))
      }
    })
  }

  const saveList = (fields, id) => {
    const rowId = id || uuid()
    setLists((prev) =>
      id
        ? prev.map((l) => (l.id === id ? { ...l, ...fields, updated_at: now() } : l))
        : [...prev, stamp({ icon: '📝', privacy_level: 'family_shared', created_at: now(), updated_at: now(), ...fields, id: rowId })]
    )
    sync(() =>
      id
        ? supabase.from('lists').update(fields).eq('id', id)
        : supabase.from('lists').insert(stamp({ ...fields, id: rowId }))
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

  const addListItem = (listId, text) => {
    const rowId = uuid()
    setListItems((prev) => [...prev, stamp({ id: rowId, list_id: listId, text, checked_at: null, sort_order: null, created_at: now() })])
    sync(() => supabase.from('list_items').insert(stamp({ id: rowId, list_id: listId, text })))
  }

  const toggleListItem = (item) => {
    const checked_at = item.checked_at ? null : new Date().toISOString()
    setListItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, checked_at } : it)))
    sync(() => supabase.from('list_items').update({ checked_at }).eq('id', item.id))
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
    sync(() => supabase.from('list_items').delete().eq('list_id', listId).not('checked_at', 'is', null))
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
      ? { ...families.find((f) => f.id === id), ...fields, updated_at: now() }
      : stamp({ created_at: now(), updated_at: now(), ...fields, id: uuid() })
    setFamilies((prev) => (id ? prev.map((f) => (f.id === id ? row : f)) : [...prev, row]))
    sync(() =>
      id
        ? supabase.from('families').update(fields).eq('id', id)
        : supabase.from('families').insert(stamp({ ...fields, id: row.id }))
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
        .upsert({ member_id: memberId, kind, target_key, until }, { onConflict: 'member_id,kind,target_key' })
    )
  }

  const saveGroup = (fields, id) => {
    const rowId = id || uuid()
    setGroups((prev) =>
      id
        ? prev.map((g) => (g.id === id ? { ...g, ...fields, updated_at: now() } : g))
        : [...prev, stamp({ created_at: now(), updated_at: now(), ...fields, id: rowId })]
    )
    sync(() =>
      id
        ? supabase.from('groups').update(fields).eq('id', id)
        : supabase.from('groups').insert(stamp({ ...fields, id: rowId }))
    )
  }

  const deleteGroup = (id) => {
    setGroups((prev) => prev.filter((g) => g.id !== id))
    sync(() => supabase.from('groups').delete().eq('id', id))
  }

  // Bulk import stays awaited (not optimistic): ImportExport shows progress
  // and reports row-level errors inline.
  const importPeople = async (rows) => {
    if (isDemo) {
      setPeople((prev) => [
        ...prev,
        ...rows.map((r) => ({ deleted_at: null, created_by: userId, created_at: now(), updated_at: now(), privacy_level: 'shared', ...r, id: uuid() })),
      ])
      return
    }
    const { error } = await supabase.from('people').insert(rows.map(stamp))
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
      if (tables.reminder_snoozes) setReminderSnoozes((prev) => merge(prev, tables.reminder_snoozes))
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
        if (name === 'task_completions') row.completed_by = isUuid(row.completed_by) ? row.completed_by : null
        return row
      })
    for (const name of ['families', 'organizations', 'people', 'relationships', 'interactions', 'key_dates', 'groups', 'tasks', 'task_completions', 'task_links', 'lists', 'list_items', 'reminder_snoozes']) {
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
    visibleLists.length === lists.length ? listItems : listItems.filter((it) => visibleListIds.has(it.list_id))

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
    families,
    keyDates,
    reminderSnoozes,
    allPeople: people,
    allOrgs: orgs,
    allTasks: tasks,
    allLists: lists,
    allListItems: listItems,
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
    deleteOrg,
    addRelationship,
    deleteRelationship,
    addInteraction,
    deleteInteraction,
    addTask,
    updateTask,
    deleteTask,
    completeTask,
    reorderTasks,
    reorderListItems,
    addTaskLink,
    deleteTaskLink,
    saveList,
    deleteList,
    addListItem,
    toggleListItem,
    deleteListItem,
    clearCheckedItems,
    saveGroup,
    deleteGroup,
    saveFamily,
    deleteFamily,
    addKeyDate,
    deleteKeyDate,
    snoozeReminder,
    importPeople,
    restoreBackup,
  }
}
