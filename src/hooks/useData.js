import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { demoMode, demoPeople, demoOrgs, demoRelationships, demoGroups, demoInteractions, demoTasks, demoCompletions, demoTaskLinks, demoLists, demoListItems, demoFamilies, demoKeyDates } from '../lib/demo'
import { completionFields } from '../lib/tasks'
import { currentMember, currentMemberId } from '../lib/household'

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// Loads people, organizations, and relationships; keeps them fresh via
// Supabase realtime; exposes CRUD helpers used throughout the app.
// In demo mode everything lives in memory and nothing persists.
export function useData(session) {
  const [people, setPeople] = useState(demoMode ? demoPeople : [])
  const [orgs, setOrgs] = useState(demoMode ? demoOrgs : [])
  const [relationships, setRelationships] = useState(demoMode ? demoRelationships : [])
  const [interactions, setInteractions] = useState(demoMode ? demoInteractions : [])
  const [groups, setGroups] = useState(demoMode ? demoGroups : [])
  const [tasks, setTasks] = useState(demoMode ? demoTasks : [])
  const [completions, setCompletions] = useState(demoMode ? demoCompletions : [])
  const [taskLinks, setTaskLinks] = useState(demoMode ? demoTaskLinks : [])
  const [lists, setLists] = useState(demoMode ? demoLists : [])
  const [listItems, setListItems] = useState(demoMode ? demoListItems : [])
  const [families, setFamilies] = useState(demoMode ? demoFamilies : [])
  const [keyDates, setKeyDates] = useState(demoMode ? demoKeyDates : [])
  const [reminderSnoozes, setReminderSnoozes] = useState([])
  const [loading, setLoading] = useState(!demoMode)
  const [error, setError] = useState(null)

  // Who "I" am for ownership checks. Live: the signed-in auth user (matches the
  // people.created_by default of auth.uid()). Demo: the current household member
  // (no auth, so member ids stand in). Used to gate permanent deletes.
  const ownerId = demoMode ? currentMemberId() : session?.user?.id || null

  const refresh = useCallback(async () => {
    if (demoMode) return
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
  }, [])

  useEffect(() => {
    if (!session || demoMode) return
    refresh()
    const channel = supabase
      .channel('salernidex-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, refresh)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  const savePerson = async (fields, id) => {
    if (demoMode) {
      setPeople((prev) =>
        id
          ? prev.map((p) => (p.id === id ? { ...p, ...fields, updated_at: now() } : p))
          : [...prev, { deleted_at: null, created_by: ownerId, created_at: now(), updated_at: now(), ...fields, id: uuid() }]
      )
      return
    }
    const query = id
      ? supabase.from('people').update(fields).eq('id', id)
      : supabase.from('people').insert(fields)
    const { error } = await query
    if (error) throw error
    await refresh()
  }

  const deletePerson = async (id) => {
    if (demoMode) {
      setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: now() } : p)))
      return
    }
    const { error } = await supabase
      .from('people')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await refresh()
  }

  const restorePerson = async (id) => {
    if (demoMode) {
      setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: null } : p)))
      return
    }
    const { error } = await supabase
      .from('people')
      .update({ deleted_at: null })
      .eq('id', id)
    if (error) throw error
    await refresh()
  }

  // Permanent, irreversible delete (the soft delete above is "archive"; this
  // actually removes the row). Relationships + interactions cascade via FK on
  // the DB; polymorphic task_links carry no FK, so we clear them by hand.
  const purgePerson = async (id) => {
    // Only the contact's creator may permanently delete it. Either member can
    // still archive (reversible); this guards the irreversible path. Unknown/
    // legacy created_by (null) is treated as yours so old data isn't stranded.
    const target = people.find((p) => p.id === id)
    if (target?.created_by && target.created_by !== ownerId) {
      throw new Error('Only the member who added this contact can delete it permanently.')
    }
    if (demoMode) {
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

  const saveOrg = async (fields, id) => {
    if (demoMode) {
      setOrgs((prev) =>
        id
          ? prev.map((o) => (o.id === id ? { ...o, ...fields, updated_at: now() } : o))
          : [...prev, { created_at: now(), updated_at: now(), key_contacts: [], ...fields, id: uuid() }]
      )
      return
    }
    const query = id
      ? supabase.from('organizations').update(fields).eq('id', id)
      : supabase.from('organizations').insert(fields)
    const { error } = await query
    if (error) throw error
    await refresh()
  }

  const deleteOrg = async (id) => {
    if (demoMode) {
      setOrgs((prev) => prev.filter((o) => o.id !== id))
      return
    }
    const { error } = await supabase.from('organizations').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const addRelationship = async (fields) => {
    if (demoMode) {
      setRelationships((prev) => [...prev, { ...fields, id: uuid(), created_at: now() }])
      return
    }
    const { error } = await supabase.from('relationships').insert(fields)
    if (error) throw error
    await refresh()
  }

  const deleteRelationship = async (id) => {
    if (demoMode) {
      setRelationships((prev) => prev.filter((r) => r.id !== id))
      return
    }
    const { error } = await supabase.from('relationships').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const addInteraction = async (fields) => {
    if (demoMode) {
      setInteractions((prev) => [{ ...fields, id: uuid(), created_at: now() }, ...prev])
      return
    }
    const { error } = await supabase.from('interactions').insert(fields)
    if (error) throw error
    await refresh()
  }

  const deleteInteraction = async (id) => {
    if (demoMode) {
      setInteractions((prev) => prev.filter((i) => i.id !== id))
      return
    }
    const { error } = await supabase.from('interactions').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const addTask = async (fields) => {
    if (demoMode) {
      setTasks((prev) => [...prev, { recurrence: null, parent_id: null, is_project: false, completed_at: null, privacy_level: 'shared', assignee: 'anyone', created_at: now(), updated_at: now(), ...fields, id: uuid() }])
      return
    }
    const { error } = await supabase.from('tasks').insert(fields)
    if (error) throw error
    await refresh()
  }

  const updateTask = async (id, fields) => {
    if (demoMode) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields, updated_at: now() } : t)))
      return
    }
    const { error } = await supabase.from('tasks').update(fields).eq('id', id)
    if (error) throw error
    await refresh()
  }

  const deleteTask = async (id) => {
    if (demoMode) {
      // cascade to subtasks + completions + links (mirrors on-delete-cascade)
      const gone = new Set(tasks.filter((t) => t.id === id || t.parent_id === id).map((t) => t.id))
      setTasks((prev) => prev.filter((t) => !gone.has(t.id)))
      setCompletions((prev) => prev.filter((c) => !gone.has(c.task_id)))
      setTaskLinks((prev) => prev.filter((tl) => !gone.has(tl.task_id)))
      return
    }
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  // Attach a person/organization to a task or project. `entity_type` is
  // 'person' | 'organization'; `role` is optional free text (e.g. 'plumber').
  const addTaskLink = async (fields) => {
    if (demoMode) {
      setTaskLinks((prev) => {
        const dup = prev.some(
          (tl) => tl.task_id === fields.task_id && tl.entity_type === fields.entity_type && tl.entity_id === fields.entity_id
        )
        return dup ? prev : [...prev, { role: null, ...fields, id: uuid(), created_at: now() }]
      })
      return
    }
    const { error } = await supabase.from('task_links').insert(fields)
    if (error) throw error
    await refresh()
  }

  const deleteTaskLink = async (id) => {
    if (demoMode) {
      setTaskLinks((prev) => prev.filter((tl) => tl.id !== id))
      return
    }
    const { error } = await supabase.from('task_links').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  // Check a task off (or un-check a one-off). Rolls recurring tasks forward and,
  // for non-subtasks, records who/when in the completion log for accountability.
  const completeTask = async (task, done) => {
    const fields = completionFields(task, done)
    const by = currentMember()?.id || null // who actually checked it off
    const log = !task.parent_id // don't clutter history with subtask check-offs
    if (demoMode) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...fields, updated_at: now() } : t)))
      if (log && done) {
        setCompletions((prev) => [{ id: uuid(), task_id: task.id, completed_at: now(), completed_by: by, created_at: now() }, ...prev])
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
      return
    }
    const { error } = await supabase.from('tasks').update(fields).eq('id', task.id)
    if (error) throw error
    if (log && done) {
      await supabase.from('task_completions').insert({ task_id: task.id, completed_at: new Date().toISOString(), completed_by: by })
    } else if (log && !done) {
      const { data } = await supabase.from('task_completions').select('id').eq('task_id', task.id).order('completed_at', { ascending: false }).limit(1)
      if (data?.[0]) await supabase.from('task_completions').delete().eq('id', data[0].id)
    }
    await refresh()
  }

  const saveList = async (fields, id) => {
    if (demoMode) {
      setLists((prev) =>
        id
          ? prev.map((l) => (l.id === id ? { ...l, ...fields, updated_at: now() } : l))
          : [...prev, { icon: '📝', privacy_level: 'family_shared', created_at: now(), updated_at: now(), ...fields, id: uuid() }]
      )
      return
    }
    const query = id ? supabase.from('lists').update(fields).eq('id', id) : supabase.from('lists').insert(fields)
    const { error } = await query
    if (error) throw error
    await refresh()
  }

  const deleteList = async (id) => {
    if (demoMode) {
      setLists((prev) => prev.filter((l) => l.id !== id))
      setListItems((prev) => prev.filter((it) => it.list_id !== id))
      return
    }
    const { error } = await supabase.from('lists').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const addListItem = async (listId, text) => {
    if (demoMode) {
      setListItems((prev) => [...prev, { id: uuid(), list_id: listId, text, checked_at: null, created_at: now() }])
      return
    }
    const { error } = await supabase.from('list_items').insert({ list_id: listId, text })
    if (error) throw error
    await refresh()
  }

  const toggleListItem = async (item) => {
    const checked_at = item.checked_at ? null : new Date().toISOString()
    if (demoMode) {
      setListItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, checked_at } : it)))
      return
    }
    const { error } = await supabase.from('list_items').update({ checked_at }).eq('id', item.id)
    if (error) throw error
    await refresh()
  }

  const deleteListItem = async (id) => {
    if (demoMode) {
      setListItems((prev) => prev.filter((it) => it.id !== id))
      return
    }
    const { error } = await supabase.from('list_items').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  // Clear all checked items from a list (e.g. after a grocery run).
  const clearCheckedItems = async (listId) => {
    if (demoMode) {
      setListItems((prev) => prev.filter((it) => !(it.list_id === listId && it.checked_at)))
      return
    }
    const { error } = await supabase.from('list_items').delete().eq('list_id', listId).not('checked_at', 'is', null)
    if (error) throw error
    await refresh()
  }

  // Contact family units ("The Parks"). saveFamily returns the saved row so
  // callers (e.g. PersonForm's inline "new family") can link to it right away.
  const saveFamily = async (fields, id) => {
    if (demoMode) {
      const row = id
        ? { ...families.find((f) => f.id === id), ...fields, updated_at: now() }
        : { created_at: now(), updated_at: now(), ...fields, id: uuid() }
      setFamilies((prev) => (id ? prev.map((f) => (f.id === id ? row : f)) : [...prev, row]))
      return row
    }
    const query = id
      ? supabase.from('families').update(fields).eq('id', id).select().single()
      : supabase.from('families').insert(fields).select().single()
    const { data: row, error } = await query
    if (error) throw error
    await refresh()
    return row
  }

  // Deleting a family never deletes its people — they just become familyless
  // (mirrors the FK's on-delete-set-null).
  const deleteFamily = async (id) => {
    if (demoMode) {
      setFamilies((prev) => prev.filter((f) => f.id !== id))
      setPeople((prev) => prev.map((p) => (p.family_id === id ? { ...p, family_id: null } : p)))
      return
    }
    const { error } = await supabase.from('families').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const addKeyDate = async (fields) => {
    if (demoMode) {
      setKeyDates((prev) => [...prev, { annual: true, ...fields, id: uuid(), created_at: now() }])
      return
    }
    const { error } = await supabase.from('key_dates').insert(fields)
    if (error) throw error
    await refresh()
  }

  const deleteKeyDate = async (id) => {
    if (demoMode) {
      setKeyDates((prev) => prev.filter((kd) => kd.id !== id))
      return
    }
    const { error } = await supabase.from('key_dates').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  // Quiet an attention item for the current member only (their partner still
  // sees it). until = null means "don't remind me about this again";
  // otherwise hidden through that timestamp. Upserts per (member, item).
  // Live counterpart: reminder_snoozes (schema.sql Phase 6 section).
  const snoozeReminder = async ({ kind, target_key, until }) => {
    if (demoMode) {
      setReminderSnoozes((prev) => [
        ...prev.filter((s) => !(s.member_id === ownerId && s.target_key === target_key)),
        { id: uuid(), member_id: ownerId, kind, target_key, until, created_at: now() },
      ])
      return
    }
    const { error } = await supabase
      .from('reminder_snoozes')
      .upsert({ member_id: ownerId, kind, target_key, until }, { onConflict: 'member_id,kind,target_key' })
    if (error) throw error
    await refresh()
  }

  const saveGroup = async (fields, id) => {
    if (demoMode) {
      setGroups((prev) =>
        id
          ? prev.map((g) => (g.id === id ? { ...g, ...fields, updated_at: now() } : g))
          : [...prev, { created_at: now(), updated_at: now(), ...fields, id: uuid() }]
      )
      return
    }
    const query = id
      ? supabase.from('groups').update(fields).eq('id', id)
      : supabase.from('groups').insert(fields)
    const { error } = await query
    if (error) throw error
    await refresh()
  }

  const deleteGroup = async (id) => {
    if (demoMode) {
      setGroups((prev) => prev.filter((g) => g.id !== id))
      return
    }
    const { error } = await supabase.from('groups').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  const importPeople = async (rows) => {
    if (demoMode) {
      setPeople((prev) => [
        ...prev,
        ...rows.map((r) => ({ deleted_at: null, created_by: ownerId, created_at: now(), updated_at: now(), privacy_level: 'shared', ...r, id: uuid() })),
      ])
      return
    }
    const { error } = await supabase.from('people').insert(rows)
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
    if (demoMode) {
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
    // Live: upsert in dependency order (parents before their children).
    for (const name of ['families', 'organizations', 'people', 'relationships', 'interactions', 'key_dates', 'groups', 'tasks', 'task_completions', 'task_links', 'lists', 'list_items']) {
      const rows = tables[name]
      if (!rows?.length) continue
      const { error } = await supabase.from(name).upsert(rows)
      if (error) throw error
    }
    await refresh()
  }

  return {
    people,
    orgs,
    relationships,
    interactions,
    groups,
    tasks,
    completions,
    taskLinks,
    lists,
    listItems,
    families,
    keyDates,
    reminderSnoozes,
    loading,
    error,
    ownerId,
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
