import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  demoMode,
  demoPeople,
  demoOrgs,
  demoAffiliations,
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
  demoNotes,
  demoAreas,
} from '../lib/demo'
import { completionFields, skipFields } from '../lib/tasks'
import { categorize } from '../lib/aisles'
import { buildCatalog, bumpCatalog, catalogKey } from '../lib/catalog'
import { mergeQty, qtyLabel } from '../lib/listItems'
import { MEAL_PLAN } from '../lib/mealPlan'
import { currentMember, currentMemberId, getHousehold, isSolo } from '../lib/household'
import { entryMap, currentStreak, isScheduled, isSuccess, isWeekly, toISODate } from '../lib/habits'
import haptics from '../lib/haptics'
import { showToast } from '../lib/toast'
import { friendlyError } from '../lib/errors'
import { filterVisible, PRIVATE_LEVEL } from '../lib/privacy'
import { hydrateAppPrefs, bindAppPrefsRemote, getAppPrefs } from '../lib/appPrefs'
import { hydrateNotifyPrefs, bindNotifyRemote } from '../lib/notifyPrefs'
import { loadSnapshot, saveSnapshot } from '../lib/offlineCache'
import { createGuardBook, mutationQueue, record } from '../lib/mutationQueue'
import { TABLES, recentLogFloor } from '../lib/tables'
import { migrateBackup } from '../lib/backupMigrations'

// Streak lengths (days, or weeks for weekly habits) worth a small celebration.
const MILESTONES = new Set([7, 14, 30, 50, 75, 100, 150, 200, 365])

// notification_prefs row <-> client notify-prefs shape. Column names already
// match the client keys, so this just picks the persisted fields (dropping
// id/member_id/updated_at) — kept explicit so a schema change can't silently
// round-trip an unexpected column. digest_time (the morning-summary push time)
// round-trips too: the server reads it and the Settings picker sets it.
const NOTIFY_KEYS = ['tasks', 'lists', 'nudges', 'dates', 'fyi', 'dates_lead_days', 'digest_time']
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
  projectsSort: r.projects_sort,
  // The area lens (0040). Same 'all' sentinel ↔ null mapping task_filter uses:
  // the column is a real FK to areas(id), and "no lens" is the absence of one.
  area: r.area || 'all',
})
const toPrefRow = (p) => ({
  default_task_privacy: p.taskPrivacy,
  default_list_privacy: p.listPrivacy,
  default_person_privacy: p.personPrivacy,
  task_filter: p.taskFilter === 'all' ? null : p.taskFilter,
  show_completed: p.showCompleted,
  people_sort: p.peopleSort,
  projects_sort: p.projectsSort,
  area: !p.area || p.area === 'all' ? null : p.area,
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
  // person ↔ organization links (0033). Many-to-many, and each row owns the
  // person's role at that org.
  const [affiliations, setAffiliations] = useState(isDemo ? demoAffiliations : [])
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
  const [notes, setNotes] = useState(isDemo ? demoNotes : [])
  // The lens: Work / Home / the band (0040). One per item or none, and the only
  // axis that scopes the whole app — see lib/areas.js.
  const [areas, setAreas] = useState(isDemo ? demoAreas : [])
  const [reminderSnoozes, setReminderSnoozes] = useState([])
  const [loading, setLoading] = useState(!isDemo)
  const [error, setError] = useState(null)
  // How many optimistic writes are still settling. A realtime echo (our own
  // write, or a co-member's) must NOT trigger a full refetch while our writes
  // are in flight — the server read can still be missing our just-added row and
  // would momentarily clobber it. We defer the refetch until this hits 0.
  const pendingWrites = useRef(0)
  // Which columns member_preferences actually has on THIS database, learned
  // from the row we read. null until we've read one.
  //
  // Expand/contract cuts both ways and this is the direction that gets
  // forgotten: the rule protects an old client reading a new database, but a new
  // client writing an OLD database is just as real — a deploy lands before its
  // migration is run, and every deploy is that for a few minutes. toPrefRow
  // sends the whole prefs object, so one column the database hasn't got yet
  // fails the entire upsert with PGRST204 and NOTHING syncs. That is exactly
  // what `area` did (0040 adds it; a client shipped ahead of it toasted "Could
  // not find the 'area' column" on every preference change).
  //
  // So: send only what the database has admitted to having. Self-healing — the
  // next read after the migration includes the column and writes resume.
  const prefColumns = useRef(null)
  const knownPrefColumns = (row) => {
    const known = prefColumns.current
    if (!known) return row // nothing read yet — assume an up-to-date schema
    return Object.fromEntries(Object.entries(row).filter(([k]) => known.has(k)))
  }

  // This render's mutation closures, for the stable façade built at the bottom.
  const latestMutations = useRef(null)

  // The `updated_at` values the server has actually shown us, per row — the
  // only thing a queued write may be guarded against. See createGuardBook for
  // why local state's optimistic updated_at cannot be used here.
  const guardBook = useRef(createGuardBook())
  // Sugar for the write paths below: the guard for a row, or null when we have
  // no server observation of it and must fall back to last-write-wins.
  const guardOf = (table, id) => guardBook.current.guardFor(table, id)

  // Whether the realtime channel has completed a subscribe before. Lets the
  // handler tell a first connection (already covered by refresh()) from a
  // reconnect, which may have missed events and needs a full re-pull.
  const subscribedOnce = useRef(false)

  // Once a real server refresh has landed, the IndexedDB snapshot must never
  // overwrite it (the cache hydrate is async and can resolve after the network
  // when both race on a warm start). This flag lets the hydrate bail.
  const serverLoaded = useRef(false)

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

  // Where each table's rows land. React guarantees a useState setter's identity
  // never changes, so this is built once — which is what lets refresh() below
  // stay a stable useCallback despite touching all nineteen.
  const setters = useMemo(
    () => ({
      areas: setAreas,
      families: setFamilies,
      orgs: setOrgs,
      people: setPeople,
      affiliations: setAffiliations,
      relationships: setRelationships,
      interactions: setInteractions,
      keyDates: setKeyDates,
      groups: setGroups,
      tasks: setTasks,
      completions: setCompletions,
      taskLinks: setTaskLinks,
      lists: setLists,
      listItems: setListItems,
      reminderSnoozes: setReminderSnoozes,
      habits: setHabits,
      habitEntries: setHabitEntries,
      listCatalog: setListCatalog,
      notes: setNotes,
    }),
    [],
  )

  // The last full pull, mirrored to IndexedDB. Held in memory so a partial
  // refetch can patch one table without reading the snapshot back off disk.
  const snapshot = useRef(null)
  const snapshotTimer = useRef(null)
  // Writing the snapshot serialises the whole household, so it rides a trailing
  // timer rather than following every refetch — a realtime burst would
  // otherwise pay that cost once per event. It is a cold-launch nicety, never a
  // source of truth, so being a few seconds behind costs nothing.
  const queueSnapshotSave = useCallback(() => {
    if (!householdId) return
    clearTimeout(snapshotTimer.current)
    snapshotTimer.current = setTimeout(() => {
      if (snapshot.current) saveSnapshot(householdId, snapshot.current)
    }, 5000)
  }, [householdId])

  // One table's read, shaped by its spec in lib/tables.js.
  //
  // Every household-scoped read is filtered to householdId: RLS's is_member()
  // returns rows for ALL households you belong to, so without this filter a
  // multi-household user would see their households' data commingled.
  // reminder_snoozes is member-scoped, so it filters on member_id instead.
  const readTable = useCallback(
    (spec) => {
      let q = supabase.from(spec.table).select('*')
      q = spec.scope === 'member' ? q.eq('member_id', memberId) : q.eq('household_id', householdId)
      if (spec.since) q = q.gte(spec.since, recentLogFloor())
      if (spec.order) q = q.order(spec.order, { ascending: !spec.desc })
      return q
    },
    [memberId, householdId],
  )

  // Pull some subset of the tables and apply them. `critical` decides what a
  // failure means: one of those blanks the app with an error rather than
  // showing a half-loaded household, while everything else degrades to keeping
  // whatever is already in state — a table whose migration hasn't run yet must
  // cost you that feature, not the whole app.
  const refreshTables = useCallback(
    async (specs) => {
      if (isDemo || !householdId || !specs.length) return
      const results = await Promise.all(specs.map(readTable))
      const fatal = specs.find((s, n) => s.critical && results[n].error)
      if (fatal) {
        setError(results[specs.indexOf(fatal)].error.message)
        setLoading(false)
        return
      }
      setError(null)
      specs.forEach((spec, n) => {
        const { data, error: rowsErr } = results[n]
        if (rowsErr) return // non-critical: keep what's already there
        const rows = data || []
        setters[spec.key](rows)
        // Fresh server truth is exactly what a staleness guard is allowed to
        // compare against, so every read feeds the book.
        guardBook.current.observe(spec.table, rows)
        if (snapshot.current) snapshot.current[spec.key] = rows
      })
      // Server truth is in: from here the offline snapshot must not clobber it.
      serverLoaded.current = true
      setLoading(false)
      queueSnapshotSave()
    },
    [isDemo, householdId, readTable, setters, queueSnapshotSave],
  )

  // The full pull: every table at once. Used on mount, on reconnect, and by
  // pull-to-refresh. Seeds the in-memory snapshot, which partial refetches then
  // patch. A table that failed caches as empty rather than missing, so the next
  // cold launch reads a complete shape.
  const refresh = useCallback(async () => {
    if (isDemo || !householdId) return
    snapshot.current = Object.fromEntries(TABLES.map((t) => [t.key, []]))
    await refreshTables(TABLES)
  }, [isDemo, householdId, refreshTables])

  // The lossless read, for the JSON backup only. Bounded tables (see
  // RECENT_LOG_DAYS) hold back years of history that the app has no use for but
  // a backup is contractually required to carry, so the export pulls those in
  // full rather than exporting the window the UI happens to be using.
  const fetchFullTable = useCallback(
    async (key) => {
      const spec = TABLES.find((t) => t.key === key)
      if (!spec || isDemo || !householdId) return null
      const { since: _since, ...unbounded } = spec
      const { data, error: readErr } = await readTable(unbounded)
      return readErr ? null : data || []
    },
    [isDemo, householdId, readTable],
  )

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
    if (!prefErr && data) {
      // The columns this database actually has, learned from the row itself —
      // PostgREST returns every column, nulls included, so presence is the test.
      // See prefColumns for why.
      prefColumns.current = new Set(Object.keys(data))
      hydrateAppPrefs(memberId, fromPrefRow(data))
    }
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

  // Tier-1 offline: paint last-known-good data from IndexedDB immediately, so a
  // cold launch (especially with no/slow network) shows the household instead of
  // empty lists. Bails if a server refresh has already landed — fresh truth wins
  // the race. Keyed by householdId so each household reads its own snapshot.
  useEffect(() => {
    if (isDemo || !householdId) return
    let cancelled = false
    loadSnapshot(householdId).then((snap) => {
      if (cancelled || !snap || serverLoaded.current) return
      for (const spec of TABLES) setters[spec.key](snap[spec.key] || [])
      snapshot.current = { ...snap }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isDemo, householdId, setters])

  useEffect(() => {
    if (!session || isDemo) return
    refresh()
    refreshPrefs()
    refreshNotifyPrefs()
    // Writes from the client mirror to the table; the cache stays the source the
    // UI reads (bindAppPrefsRemote pushes the full merged prefs on each change).
    bindAppPrefsRemote((mid, prefs) =>
      sync((db) =>
        db
          .from('member_preferences')
          .upsert(knownPrefColumns({ member_id: mid, ...toPrefRow(prefs) }), {
            onConflict: 'member_id',
          }),
      ),
    )
    bindNotifyRemote((mid, prefs) =>
      sync((db) =>
        db
          .from('notification_prefs')
          .upsert({ member_id: mid, ...toNotifyRow(prefs) }, { onConflict: 'member_id' }),
      ),
    )
    // Realtime fires one event per changed row. This used to listen to the whole
    // public schema and answer every event with a full nineteen-table refetch,
    // so one partner ticking one checkbox re-downloaded both households' entire
    // datasets. Now each table is subscribed by name and an event only refetches
    // the table it came from — a burst still coalesces, but into "reread tasks"
    // rather than "reread everything".
    let refetchTimer
    const dirty = new Set()
    const fire = () => {
      // Hold off while our own optimistic writes are still settling so a stale
      // server read can't drop a just-added row; their echoes keep re-arming
      // this, and we refetch once everything has landed.
      if (pendingWrites.current > 0) {
        refetchTimer = setTimeout(fire, 250)
        return
      }
      const specs = TABLES.filter((t) => dirty.has(t.key))
      dirty.clear()
      refreshTables(specs)
    }
    const queueRefetch = (spec) => () => {
      dirty.add(spec.key)
      clearTimeout(refetchTimer)
      refetchTimer = setTimeout(fire, 250)
    }

    const channel = supabase.channel('doot-sync')
    for (const spec of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: spec.table },
        queueRefetch(spec),
      )
    }
    channel
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
      // A dropped-and-restored socket may have missed events entirely, and a
      // per-table refetch can't know what it didn't hear about — so a RE-subscribe
      // (not the first one, which the refresh() above already covers) falls back
      // to the full pull.
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        if (subscribedOnce.current) refresh()
        subscribedOnce.current = true
      })
    return () => {
      clearTimeout(refetchTimer)
      bindAppPrefsRemote(null)
      bindNotifyRemote(null)
      supabase.removeChannel(channel)
    }
    // refresh/refreshTables/refreshPrefs/refreshNotifyPrefs already close over
    // isDemo (via their own deps), and `sync` is intentionally left out —
    // listing it would re-subscribe the realtime channel on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, refresh, refreshTables, refreshPrefs, refreshNotifyPrefs])

  // Drain the outbox against the server. Safe to call often — it no-ops while
  // already running, so a burst of writes doesn't start a burst of drains.
  //
  // Only a DROPPED or SUPERSEDED write refetches. That's the important change
  // from the old behavior: a write that failed because the network is gone is
  // still going to land, so snapping local state back to the server would undo
  // an edit that is merely waiting.
  const flushing = useRef(false)
  const flush = useCallback(async () => {
    if (flushing.current || isDemo || !supabase) return
    flushing.current = true
    try {
      const res = await mutationQueue.drain(supabase, {
        householdId,
        onDrop: (m, err) => showToast(friendlyError(err), { variant: 'error', duration: 6000 }),
        // Our own write may have moved the row, which spends the observation we
        // were guarding it with. Dropping it here means the next edit goes out
        // unguarded rather than guarded against a value we just invalidated.
        onSettled: (m) => guardBook.current.forgetTarget(m),
      })
      if (res.dropped || res.superseded) refresh()
    } finally {
      flushing.current = false
    }
  }, [isDemo, householdId, refresh])

  // Background write. `op` receives a client-shaped recorder and performs its
  // writes against it; what it would have done is captured as data, put in a
  // durable outbox, and only then sent.
  //
  // The indirection is the whole point. Before this, `op` closed over the real
  // client, and a closure cannot outlive the page — so a write that failed
  // because a phone went through a tunnel was gone, announced by a toast the
  // user had already walked away from. Recorded, it survives a reload.
  const sync = (op) => {
    if (isDemo) return
    pendingWrites.current += 1
    Promise.resolve()
      .then(() => record(op))
      .then(async (mutations) => {
        for (const m of mutations) await mutationQueue.enqueue({ ...m, householdId })
      })
      .then(flush)
      .catch((err) => {
        // Reaching here means the closure itself threw while being recorded —
        // a bug in the write, not a failed request. Those never reach the queue.
        showToast(friendlyError(err), { variant: 'error', duration: 6000 })
        refresh()
      })
      .finally(() => {
        pendingWrites.current = Math.max(0, pendingWrites.current - 1)
      })
  }

  // Send anything left over from a previous session as soon as there's a
  // household to send it for, and again whenever the network comes back. This
  // is what makes the outbox durable rather than merely deferred.
  useEffect(() => {
    if (isDemo || !householdId) return
    flush()
    const onOnline = () => flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [isDemo, householdId, flush])

  // Multi-step ops wrap each step so a failure aborts the rest. Against the
  // recorder nothing can fail, so this now only catches a genuine bug — but it
  // stays, because it is also what documents each step as required.
  const must = (res) => {
    if (res.error) throw res.error
    return res
  }

  // Persist a manual ordering: [{ id, sort_order }, ...]. Four tables are
  // drag-reorderable and all four wanted the identical twelve lines, so this is
  // the one copy — each table below is a single binding of it.
  //
  // Stays row-by-row rather than one upsert on purpose: a Supabase upsert is a
  // full INSERT ... ON CONFLICT, so sending {id, sort_order} would write column
  // defaults over every other field on the row. Fractional ranks mean a drag
  // usually touches exactly one row anyway, so the loop is nearly always one
  // request.
  const reorderRows = (table, setRows) => (updates) => {
    const byId = new Map(updates.map((u) => [u.id, u.sort_order]))
    setRows((prev) => prev.map((r) => (byId.has(r.id) ? { ...r, sort_order: byId.get(r.id) } : r)))
    sync(async (db) => {
      for (const u of updates) {
        must(await db.from(table).update({ sort_order: u.sort_order }).eq('id', u.id))
      }
    })
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
    // Guarded, like every general edit path below. Saving a form over a change
    // your partner made an hour ago is exactly the lost work the guard is for:
    // the form sends whole fields, so a replayed stale save doesn't merge with
    // theirs, it erases it.
    //
    // The dedicated intent paths — archive, delete, check-off — deliberately
    // stay unguarded. Those carry a decision rather than a field's contents,
    // there is nothing in them to lose, and "your delete didn't apply because
    // somebody renamed it" is a worse answer than simply deleting it.
    sync((db) =>
      id
        ? db.from('people').update(fields).eq('id', id).guard(guardOf('people', id))
        : db.from('people').insert(stamp({ ...fields, id: rowId })),
    )
    // Returned so a caller that just created someone can attach rows keyed to
    // them (PersonForm saves the person, then their affiliations).
    return rowId
  }

  // Soft delete = archive (reversible), so it gets an Undo toast.
  const deletePerson = (id) => {
    const name = people.find((p) => p.id === id)?.name
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: now() } : p)))
    sync((db) => db.from('people').update({ deleted_at: new Date().toISOString() }).eq('id', id))
    showToast(name ? `Archived ${name}` : 'Contact archived', {
      actionLabel: 'Undo',
      onAction: () => restorePerson(id),
    })
  }

  const restorePerson = (id) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, deleted_at: null } : p)))
    sync((db) => db.from('people').update({ deleted_at: null }).eq('id', id))
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
      setAffiliations((prev) => prev.filter((a) => a.person_id !== id))
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
    sync((db) =>
      id
        ? db.from('organizations').update(fields).eq('id', id).guard(guardOf('organizations', id))
        : db.from('organizations').insert(stamp({ ...fields, id: rowId })),
    )
  }

  // The org row goes; the people at it don't. affiliations.organization_id
  // cascades on the DB side, so their links to THIS org disappear with it —
  // mirrored locally here (and it's the whole story in demo).
  const deleteOrg = (id) => {
    setOrgs((prev) => prev.filter((o) => o.id !== id))
    setAffiliations((prev) => prev.filter((a) => a.organization_id !== id))
    sync((db) => db.from('organizations').delete().eq('id', id))
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
    sync((db) => db.from('organizations').insert(stamp({ name: trimmed, id: row.id })))
    return row
  }

  // Replace the whole set of a person's org links in one call — PersonForm
  // edits them as a list, so a diff here beats making the form issue its own
  // add/update/delete calls.
  //
  // `rows` is [{ organization_id, role, is_primary, show_in_summary,
  // started_on, ended_on }]. Matching is by organization_id (the table's unique
  // key with person_id), so an existing link keeps its id and created_at rather
  // than being deleted and re-inserted.
  const setPersonAffiliations = (personId, rows = []) => {
    const existing = affiliations.filter((a) => a.person_id === personId)
    const byOrg = new Map(existing.map((a) => [a.organization_id, a]))
    const seen = new Set()
    const next = []
    for (const r of rows) {
      // Skip blanks (an empty picker row) and any repeat of an org already
      // listed — the unique constraint would reject the second one.
      if (!r.organization_id || seen.has(r.organization_id)) continue
      seen.add(r.organization_id)
      const prev = byOrg.get(r.organization_id)
      next.push({
        id: prev?.id || uuid(),
        person_id: personId,
        organization_id: r.organization_id,
        role: r.role?.trim() || null,
        is_primary: false, // settled below — exactly one wins
        show_in_summary: r.show_in_summary ?? null,
        started_on: r.started_on || null,
        ended_on: r.ended_on || null,
        created_by: prev?.created_by ?? userId,
        created_at: prev?.created_at || now(),
        updated_at: now(),
      })
    }
    // Exactly one primary, always: honor the flag the form sent, otherwise
    // promote the first. Without this a person could end up with none (nothing
    // to lead the summary line) or several (a coin flip between them).
    if (next.length) {
      const chosen = rows.findIndex((r) => r.is_primary && seen.has(r.organization_id))
      const lead =
        chosen >= 0 ? next.find((a) => a.organization_id === rows[chosen].organization_id) : next[0]
      if (lead) lead.is_primary = true
    }
    const removed = existing.filter((a) => !seen.has(a.organization_id)).map((a) => a.id)

    setAffiliations((prev) => [...prev.filter((a) => a.person_id !== personId), ...next])
    sync(async (db) => {
      if (removed.length) must(await db.from('affiliations').delete().in('id', removed))
      if (next.length) must(await db.from('affiliations').upsert(next.map(stamp)))
    })
  }

  const addRelationship = (fields) => {
    const rowId = uuid()
    setRelationships((prev) => [...prev, stamp({ ...fields, id: rowId, created_at: now() })])
    sync((db) => db.from('relationships').insert(stamp({ ...fields, id: rowId })))
  }

  const deleteRelationship = (id) => {
    setRelationships((prev) => prev.filter((r) => r.id !== id))
    sync((db) => db.from('relationships').delete().eq('id', id))
  }

  // A touchpoint's subject is a person OR an organization (0042) — the caller
  // passes whichever, and the DB check constraint refuses both or neither.
  const addInteraction = (fields) => {
    const rowId = uuid()
    setInteractions((prev) => [stamp({ ...fields, id: rowId, created_at: now() }), ...prev])
    sync((db) => db.from('interactions').insert(stamp({ ...fields, id: rowId })))
  }

  // Editing one (0042). It was insert-and-delete only, which quietly made the
  // log a streak counter rather than a record: a call logged on the wrong day,
  // or a note you wanted to finish later, could only be destroyed and retyped.
  // Patch-shaped like every other save here, so a caller can correct just the
  // date or just the note.
  const saveInteraction = (fields, id) => {
    setInteractions((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...fields, updated_at: now() } : i)),
    )
    sync((db) =>
      db.from('interactions').update(fields).eq('id', id).guard(guardOf('interactions', id)),
    )
  }

  const deleteInteraction = (id) => {
    const gone = interactions.find((i) => i.id === id)
    setInteractions((prev) => prev.filter((i) => i.id !== id))
    sync((db) => db.from('interactions').delete().eq('id', id))
    if (!gone) return
    showToast('Touchpoint deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        setInteractions((prev) => [gone, ...prev])
        sync((db) => db.from('interactions').upsert(gone))
      },
    })
  }

  const addTask = (rawFields) => {
    const rowId = uuid()
    // A subtask takes its parent's area, always — a subtask filed somewhere
    // other than the thing it's a step of is incoherent, and it would show up
    // under a lens its parent isn't in. Enforced here rather than at each of the
    // half-dozen call sites that add children, because one that forgets doesn't
    // look like a bug, it looks like the lens leaking.
    const parent = rawFields?.parent_id ? tasks.find((t) => t.id === rawFields.parent_id) : null
    const fields = parent ? { ...rawFields, area_id: parent.area_id ?? null } : rawFields
    setTasks((prev) => [
      ...prev,
      stamp({
        recurrence: null,
        due_kind: 'on', // matches the column default, so the optimistic row reads like the stored one
        parent_id: null,
        is_project: false,
        is_heading: false,
        is_reminder: false,
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
    sync((db) =>
      db
        .from('tasks')
        .insert(stamp({ ...fields, id: rowId, assignee: dbAssignee(fields.assignee) })),
    )
    return rowId // so callers can link the just-created task (e.g. from a person/org page)
  }

  const updateTask = (id, fields) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields, updated_at: now() } : t)))
    const dbFields =
      'assignee' in fields ? { ...fields, assignee: dbAssignee(fields.assignee) } : fields
    sync((db) => db.from('tasks').update(dbFields).eq('id', id).guard(guardOf('tasks', id)))
    // Refiling a project carries its subtasks with it — the other half of the
    // rule addTask applies. Without this, moving "Kitchen refresh" to Home would
    // leave its five steps behind in whatever area they were created under, and
    // they'd vanish from the project's own lens.
    if ('area_id' in fields) {
      const children = tasks.filter((t) => t.parent_id === id && t.area_id !== fields.area_id)
      if (children.length) {
        const ids = children.map((t) => t.id)
        setTasks((prev) =>
          prev.map((t) => (ids.includes(t.id) ? { ...t, area_id: fields.area_id } : t)),
        )
        sync((db) => db.from('tasks').update({ area_id: fields.area_id }).in('id', ids))
      }
    }
  }

  const reorderTasks = reorderRows('tasks', setTasks)
  const reorderListItems = reorderRows('list_items', setListItems)

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
    sync((db) => db.from('tasks').delete().eq('id', id))
    showToast(target ? `Deleted “${target.title}”` : 'Task deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        setTasks((prev) => [...prev, ...goneTasks])
        setCompletions((prev) => [...goneCompletions, ...prev])
        setTaskLinks((prev) => [...prev, ...goneLinks])
        sync(async (db) => {
          // parent before children (self-referencing FK)
          must(await db.from('tasks').upsert(goneTasks.filter((t) => t.id === id)))
          const children = goneTasks.filter((t) => t.id !== id)
          if (children.length) must(await db.from('tasks').upsert(children))
          if (goneCompletions.length)
            must(await db.from('task_completions').upsert(goneCompletions))
          if (goneLinks.length) must(await db.from('task_links').upsert(goneLinks))
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
    sync((db) => db.from('task_links').insert(stamp({ ...fields, id: rowId })))
  }

  const deleteTaskLink = (id) => {
    setTaskLinks((prev) => prev.filter((tl) => tl.id !== id))
    sync((db) => db.from('task_links').delete().eq('id', id))
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
    }
    // Which completion an un-check drops, decided HERE rather than by asking the
    // server for it. `completions` is already ordered newest-first, so this is
    // the same row the optimistic update below removes — and picking it locally
    // is what lets the write be queued: a mutation that has to read from the
    // network mid-flight cannot be replayed from an outbox after a reload.
    const undone = log && !done ? completions.find((c) => c.task_id === task.id) : null
    if (log && !done) {
      // undo a one-off: drop its most recent completion
      setCompletions((prev) => {
        const idx = prev.findIndex((c) => c.task_id === task.id)
        if (idx === -1) return prev
        const copy = [...prev]
        copy.splice(idx, 1)
        return copy
      })
    }
    sync(async (db) => {
      must(await db.from('tasks').update(fields).eq('id', task.id))
      if (log && done) {
        must(
          await db.from('task_completions').insert(
            stamp({
              id: completionId,
              task_id: task.id,
              completed_at: new Date().toISOString(),
              completed_by: by,
            }),
          ),
        )
      } else if (undone) {
        must(await db.from('task_completions').delete().eq('id', undone.id))
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
          sync(async (db) => {
            must(
              await db
                .from('tasks')
                .update({ due_date: task.due_date, completed_at: task.completed_at })
                .eq('id', task.id),
            )
            if (log) must(await db.from('task_completions').delete().eq('id', completionId))
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
    sync((db) => db.from('tasks').update(fields).eq('id', task.id))
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
        sync((db) => db.from('tasks').update(revert).eq('id', task.id))
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
    sync((db) =>
      id
        ? db.from('lists').update(fields).eq('id', id).guard(guardOf('lists', id))
        : db.from('lists').insert(stamp({ ...fields, id: rowId })),
    )
  }

  const deleteList = (id) => {
    const goneList = lists.find((l) => l.id === id)
    const goneItems = listItems.filter((it) => it.list_id === id)
    setLists((prev) => prev.filter((l) => l.id !== id))
    setListItems((prev) => prev.filter((it) => it.list_id !== id))
    sync((db) => db.from('lists').delete().eq('id', id))
    showToast(goneList ? `Deleted “${goneList.name}”` : 'List deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        if (goneList) setLists((prev) => [...prev, goneList])
        setListItems((prev) => [...prev, ...goneItems])
        sync(async (db) => {
          if (goneList) must(await db.from('lists').upsert(goneList))
          if (goneItems.length) must(await db.from('list_items').upsert(goneItems))
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
    const {
      note = null,
      qty = null,
      assignee = 'anyone',
      category: categoryOverride,
      on_date = null, // meal-plan day (0037); null everywhere else
    } = opts
    const list = lists.find((l) => l.id === listId)
    // Grocery lists file each item into an aisle on the way in (overridable). A
    // suggestion supplies its remembered aisle; otherwise guess from the text.
    const category = categoryOverride ?? (list?.kind === 'grocery' ? categorize(text) : null)

    // Adding something already open on the list bumps its quantity instead of
    // laying down a second identical row — you don't want two "milk" lines on
    // a shopping list, you want two milk. Suggestions already hide duplicates,
    // so typing the name and pressing Enter was the only way to make one.
    // mergeQty returns null when the two can't be combined ("2 lbs" + "3 oz"),
    // and then a separate row is the honest answer.
    //
    // Never on a meal plan: "tacos" twice means Tuesday AND Friday, not tacos
    // ×2, and the second one carries a different on_date that merging would
    // throw away.
    const dupe =
      list?.kind === MEAL_PLAN
        ? null
        : listItems.find(
            (it) =>
              it.list_id === listId &&
              !it.checked_at &&
              !it.is_heading &&
              catalogKey(it.text) === catalogKey(text),
          )
    if (dupe) {
      const merged = mergeQty(dupe.qty, qty)
      if (merged !== null) {
        const before = dupe.qty ?? null
        updateListItem(dupe.id, { qty: merged || null })
        if (list) recordCatalog(list, text, category)
        showToast(`Already on the list · now ${qtyLabel(merged) || '×1'}`, {
          actionLabel: 'Undo',
          onAction: () => updateListItem(dupe.id, { qty: before }),
        })
        return
      }
    }

    const rowId = uuid()
    // created_by is sent explicitly even though the column defaults to
    // auth.uid(): the default only fills the copy on the SERVER, and the
    // optimistic row we push into state below is the one on screen until the
    // next refresh. Without it the activity feed drops your name from the item
    // you just added and grows it back minutes later, which reads as a glitch.
    const row = {
      id: rowId,
      list_id: listId,
      text,
      note,
      qty,
      category,
      assignee,
      on_date,
      created_by: userId,
    }
    setListItems((prev) => [
      ...prev,
      stamp({ ...row, is_heading: false, checked_at: null, sort_order: null, created_at: now() }),
    ])
    sync((db) => db.from('list_items').insert(stamp({ ...row, assignee: dbAssignee(assignee) })))
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
    sync((db) =>
      db.from('list_catalog').upsert(
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
    sync((db) => db.from('list_items').insert(stamp(row)))
    // Returned so the caller can open the new section for renaming straight
    // away — it lands at the bottom of the list (sort_order null sorts last),
    // which on a long list is off-screen and looked like nothing happened.
    return rowId
  }

  // Checking off records who did it (0041); unchecking clears the credit rather
  // than reassigning it — an item put back on the list hasn't been got by
  // anyone. This is why checked_by has no auth.uid() default in the schema: the
  // DB can't tell the two directions of a toggle apart, and only this function
  // can.
  const toggleListItem = (item) => {
    const checking = !item.checked_at
    const checked_at = checking ? new Date().toISOString() : null
    const checked_by = checking ? userId : null
    setListItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, checked_at, checked_by } : it)),
    )
    sync((db) => db.from('list_items').update({ checked_at, checked_by }).eq('id', item.id))
  }

  // Inline edits to an item (text, note, qty, aisle, assignee) — tap-to-edit in
  // ListDetail. assignee uses the 'anyone' sentinel locally; map it to null for
  // the DB, like updateTask does.
  const updateListItem = (id, fields) => {
    setListItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...fields } : it)))
    const dbFields =
      'assignee' in fields ? { ...fields, assignee: dbAssignee(fields.assignee) } : fields
    sync((db) => db.from('list_items').update(dbFields).eq('id', id))
  }

  const deleteListItem = (id) => {
    const gone = listItems.find((it) => it.id === id)
    setListItems((prev) => prev.filter((it) => it.id !== id))
    sync((db) => db.from('list_items').delete().eq('id', id))
    if (!gone) return
    showToast(`Deleted “${gone.text}”`, {
      actionLabel: 'Undo',
      onAction: () => {
        setListItems((prev) => [...prev, gone])
        sync((db) => db.from('list_items').upsert(gone))
      },
    })
  }

  // ---- Bulk actions (multi-select) --------------------------------------
  //
  // These exist because looping the single-row helper is not the same thing.
  // Ten calls to deleteListItem raise ten toasts, each offering to undo one
  // tenth of what you did — and the tenth toast is the only one still on screen
  // by the time you reach for it. One action the user took is one row of
  // feedback and one Undo that reverses all of it.
  //
  // They also each send ONE request instead of N, which is the difference
  // between a bulk delete on a phone working and timing out halfway.

  const deleteListItems = (ids) => {
    const gone = listItems.filter((it) => ids.includes(it.id))
    if (!gone.length) return
    const goneIds = gone.map((it) => it.id)
    setListItems((prev) => prev.filter((it) => !goneIds.includes(it.id)))
    sync((db) => db.from('list_items').delete().in('id', goneIds))
    showToast(`Deleted ${gone.length} ${gone.length === 1 ? 'item' : 'items'}`, {
      actionLabel: 'Undo',
      onAction: () => {
        setListItems((prev) => [...prev, ...gone])
        sync((db) => db.from('list_items').upsert(gone))
      },
    })
  }

  // Check off (or un-check) several at once. Only the rows that would actually
  // change are touched, so re-checking an already-checked row doesn't rewrite
  // its checked_at and move it to the top of the "Got it" pile.
  const setListItemsChecked = (ids, checked) => {
    const targets = listItems.filter((it) => ids.includes(it.id) && !!it.checked_at !== checked)
    if (!targets.length) return
    const targetIds = targets.map((it) => it.id)
    const checked_at = checked ? new Date().toISOString() : null
    const checked_by = checked ? userId : null
    setListItems((prev) =>
      prev.map((it) => (targetIds.includes(it.id) ? { ...it, checked_at, checked_by } : it)),
    )
    sync((db) => db.from('list_items').update({ checked_at, checked_by }).in('id', targetIds))
  }

  // Deleting tasks carries their subtasks, completions and links, exactly as
  // deleteTask does for one — a bulk delete that orphaned children would leave
  // rows nothing can reach.
  const deleteTasks = (ids) => {
    const goneTasks = tasks.filter((t) => ids.includes(t.id) || ids.includes(t.parent_id))
    if (!goneTasks.length) return
    const goneIds = new Set(goneTasks.map((t) => t.id))
    const goneCompletions = completions.filter((c) => goneIds.has(c.task_id))
    const goneLinks = taskLinks.filter((tl) => goneIds.has(tl.task_id))
    const topIds = goneTasks.filter((t) => ids.includes(t.id)).map((t) => t.id)
    setTasks((prev) => prev.filter((t) => !goneIds.has(t.id)))
    setCompletions((prev) => prev.filter((c) => !goneIds.has(c.task_id)))
    setTaskLinks((prev) => prev.filter((tl) => !goneIds.has(tl.task_id)))
    // Deleting the parents is enough — the DB cascades to the children.
    sync((db) => db.from('tasks').delete().in('id', topIds))
    showToast(`Deleted ${topIds.length} ${topIds.length === 1 ? 'task' : 'tasks'}`, {
      actionLabel: 'Undo',
      onAction: () => {
        setTasks((prev) => [...prev, ...goneTasks])
        setCompletions((prev) => [...goneCompletions, ...prev])
        setTaskLinks((prev) => [...prev, ...goneLinks])
        sync(async (db) => {
          // Parents before children, for the self-referencing FK.
          const parents = goneTasks.filter((t) => topIds.includes(t.id))
          const children = goneTasks.filter((t) => !topIds.includes(t.id))
          must(await db.from('tasks').upsert(parents))
          if (children.length) must(await db.from('tasks').upsert(children))
          if (goneCompletions.length)
            must(await db.from('task_completions').upsert(goneCompletions))
          if (goneLinks.length) must(await db.from('task_links').upsert(goneLinks))
        })
      },
    })
  }

  // Soft delete, like deleteNote — they go to Recently Deleted, not away.
  const deleteNotes = (ids) => {
    const gone = notes.filter((n) => ids.includes(n.id) && !n.deleted_at)
    if (!gone.length) return
    const goneIds = gone.map((n) => n.id)
    const at = now()
    setNotes((prev) => prev.map((n) => (goneIds.includes(n.id) ? { ...n, deleted_at: at } : n)))
    sync((db) =>
      db.from('notes').update({ deleted_at: new Date().toISOString() }).in('id', goneIds),
    )
    showToast(`Deleted ${gone.length} ${gone.length === 1 ? 'note' : 'notes'}`, {
      actionLabel: 'Undo',
      onAction: () => {
        setNotes((prev) =>
          prev.map((n) => (goneIds.includes(n.id) ? { ...n, deleted_at: null } : n)),
        )
        sync((db) => db.from('notes').update({ deleted_at: null }).in('id', goneIds))
      },
    })
  }

  // Clear all checked items from a list (e.g. after a grocery run).
  const clearCheckedItems = (listId) => {
    const gone = listItems.filter((it) => it.list_id === listId && it.checked_at)
    if (!gone.length) return
    const goneIds = gone.map((it) => it.id)
    setListItems((prev) => prev.filter((it) => !goneIds.includes(it.id)))
    // Delete exactly the rows we captured, not "everything checked on this
    // list". A housemate checking something off between this snapshot and the
    // request would otherwise have their item deleted too — and Undo, which
    // only knows about `gone`, could not bring it back.
    sync((db) => db.from('list_items').delete().in('id', goneIds))
    showToast(`Cleared ${gone.length} ${gone.length === 1 ? 'item' : 'items'}`, {
      actionLabel: 'Undo',
      onAction: () => {
        setListItems((prev) => [...prev, ...gone])
        sync((db) => db.from('list_items').upsert(gone))
      },
    })
  }

  // Notebook (Apple Notes-style). A note's body is sanitized HTML; `mentions`
  // is the denormalized [{type,id}] index of the entities it @-mentions inline,
  // recomputed by the editor on save and used for entity-page backlinks.
  // addNote returns the new row id so the caller can navigate straight into it.
  const addNote = (fields = {}) => {
    const rowId = uuid()
    setNotes((prev) => [
      stamp({
        title: '',
        body: '',
        tags: [],
        mentions: [],
        privacy_level: 'shared',
        pinned: false,
        created_by: userId,
        created_at: now(),
        updated_at: now(),
        ...fields,
        id: rowId,
      }),
      ...prev,
    ])
    sync((db) => db.from('notes').insert(stamp({ ...fields, id: rowId })))
    return rowId
  }

  // Every edit stamps the last editor (updated_by) so the note can show
  // "Edited by …" — the couple's-OS touch. updated_at is bumped locally and by
  // the DB trigger.
  const updateNote = (id, fields) => {
    const patch = { ...fields, updated_by: memberId }
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updated_at: now() } : n)))
    sync((db) => db.from('notes').update(patch).eq('id', id).guard(guardOf('notes', id)))
  }

  const togglePinNote = (id) => {
    const note = notes.find((n) => n.id === id)
    if (!note) return
    updateNote(id, { pinned: !note.pinned })
  }

  const restoreNote = (id) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, deleted_at: null } : n)))
    sync((db) => db.from('notes').update({ deleted_at: null }).eq('id', id))
  }

  // Soft delete: move the note to Recently Deleted (reversible), à la Apple
  // Notes — restore or delete-forever from the trash view.
  const deleteNote = (id) => {
    const gone = notes.find((n) => n.id === id)
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, deleted_at: now() } : n)))
    sync((db) => db.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id))
    if (!gone) return
    showToast(gone.title ? `Deleted “${gone.title}”` : 'Note deleted', {
      actionLabel: 'Undo',
      onAction: () => restoreNote(id),
    })
  }

  // Permanent delete from Recently Deleted.
  const purgeNote = (id) => {
    const gone = notes.find((n) => n.id === id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
    sync((db) => db.from('notes').delete().eq('id', id))
    if (!gone) return
    showToast('Note deleted for good', {
      actionLabel: 'Undo',
      onAction: () => {
        setNotes((prev) => [gone, ...prev])
        sync((db) => db.from('notes').upsert(gone))
      },
    })
  }

  // Silent hard-delete for auto-discard of an untouched, empty new note — no
  // trash, no toast (it never became real content).
  const discardNote = (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    sync((db) => db.from('notes').delete().eq('id', id))
  }

  // ---- Areas (the lens: Work / Home / …) --------------------------------
  // Reads and the filtering rules live in lib/areas.js; this is only the write
  // side. created_by is the AUTH user, not the member — visibleAreas tests
  // against auth.uid() because that's what the column defaults to.
  const addArea = (fields = {}) => {
    const rowId = uuid()
    setAreas((prev) => [
      ...prev,
      stamp({
        name: '',
        icon: null,
        color: null,
        sort_order: null,
        shared: false,
        default_private: false,
        show_on_today: true,
        archived_at: null,
        created_by: userId,
        created_at: now(),
        updated_at: now(),
        ...fields,
        id: rowId,
      }),
    ])
    sync((db) => db.from('areas').insert(stamp({ ...fields, id: rowId })))
    return rowId
  }

  // Sharing an area clears default_private in the same write. The rule is that
  // the setting only exists while an area is private — a shared area whose
  // contents default to private is close to a contradiction — and the database
  // deliberately carries no constraint saying so (0040 explains why), so this is
  // the one place that keeps the invariant true.
  const updateArea = (id, fields) => {
    const patch = fields.shared ? { ...fields, default_private: false } : fields
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch, updated_at: now() } : a)))
    sync((db) => db.from('areas').update(patch).eq('id', id).guard(guardOf('areas', id)))
  }

  // Move everything filed in one area into another, leaving both areas standing.
  //
  // The sibling of merge, and deliberately NOT merge: an archived area is a
  // lens you've put away, and its contents are visible only under All until
  // something re-files them (§3.6 calls that a trap and requires this way out).
  // Deleting the archived area as well would be a second, unasked decision —
  // you may well want it back next quarter with nothing in it.
  //
  // Unlike merge this needs no RPC, and the reason is worth stating because the
  // shapes look identical: merge has to be atomic because a delete follows the
  // repoints, and `on delete set null` turns a half-applied merge into silent
  // unfiling. Nothing follows these repoints. A partial failure leaves some
  // items behind in an area that still exists — visible, still filed, and
  // fixable by running it again. So it rides the ordinary write queue and works
  // offline, which merge cannot.
  const moveAreaItems = (fromId, intoId) => {
    if (!fromId || !intoId || fromId === intoId) return
    const move = (rows) => rows.map((r) => (r.area_id === fromId ? { ...r, area_id: intoId } : r))
    setTasks(move)
    setLists(move)
    setNotes(move)
    setHabits(move)
    sync(async (db) => {
      for (const table of ['tasks', 'lists', 'notes', 'habits']) {
        must(await db.from(table).update({ area_id: intoId }).eq('area_id', fromId))
      }
    })
  }

  const reorderAreas = reorderRows('areas', setAreas)

  // Archiving hides a lens, never an item: area_id stays put, so everything
  // filed here is still reachable under "All" and comes straight back if the
  // area is unarchived.
  const archiveArea = (id) => updateArea(id, { archived_at: now() })
  const unarchiveArea = (id) => updateArea(id, { archived_at: null })

  // Deleting an area unfiles its contents rather than deleting them — the FK is
  // `on delete set null`, which makes that atomic server-side. Locally we have
  // to do the same clearing by hand, because nothing tells the client the FK
  // fired. Undo re-inserts the area and re-files everything that pointed at it.
  const deleteArea = (id) => {
    const gone = areas.find((a) => a.id === id)
    if (!gone) return
    const filed = {
      tasks: tasks.filter((t) => t.area_id === id).map((t) => t.id),
      lists: lists.filter((l) => l.area_id === id).map((l) => l.id),
      notes: notes.filter((n) => n.area_id === id).map((n) => n.id),
      habits: habits.filter((h) => h.area_id === id).map((h) => h.id),
    }
    const clear = (rows, ids) => rows.map((r) => (ids.includes(r.id) ? { ...r, area_id: null } : r))

    setAreas((prev) => prev.filter((a) => a.id !== id))
    setTasks((prev) => clear(prev, filed.tasks))
    setLists((prev) => clear(prev, filed.lists))
    setNotes((prev) => clear(prev, filed.notes))
    setHabits((prev) => clear(prev, filed.habits))
    sync((db) => db.from('areas').delete().eq('id', id))

    const total = filed.tasks.length + filed.lists.length + filed.notes.length + filed.habits.length
    showToast(
      total ? `Deleted “${gone.name}” · ${total} moved to No area` : `Deleted “${gone.name}”`,
      {
        actionLabel: 'Undo',
        onAction: () => {
          const refile = (rows, ids) =>
            rows.map((r) => (ids.includes(r.id) ? { ...r, area_id: id } : r))
          setAreas((prev) => [...prev, gone])
          setTasks((prev) => refile(prev, filed.tasks))
          setLists((prev) => refile(prev, filed.lists))
          setNotes((prev) => refile(prev, filed.notes))
          setHabits((prev) => refile(prev, filed.habits))
          sync(async (db) => {
            must(await db.from('areas').upsert(gone))
            for (const [table, ids] of Object.entries(filed)) {
              if (ids.length) must(await db.from(table).update({ area_id: id }).in('id', ids))
            }
          })
        },
      },
    )
  }

  // Merge goes through an RPC, not the write queue. The queue can describe the
  // repoints and the delete but can't make them atomic — and a merge whose
  // repoints fail after its delete lands would silently unfile everything. That
  // makes this the one area operation requiring a connection; the caller shows
  // the failure rather than queueing it. See 0040_areas.sql.
  const mergeAreas = async (fromId, intoId) => {
    if (isDemo) {
      const move = (rows) => rows.map((r) => (r.area_id === fromId ? { ...r, area_id: intoId } : r))
      setTasks(move)
      setLists(move)
      setNotes(move)
      setHabits(move)
      setAreas((prev) => prev.filter((a) => a.id !== fromId))
      return true
    }
    const { error: rpcErr } = await supabase.rpc('merge_area', {
      p_from: fromId,
      p_into: intoId,
    })
    if (rpcErr) {
      showToast(friendlyError(rpcErr), { variant: 'error', duration: 6000 })
      return false
    }
    await refresh()
    return true
  }

  // Contact family units ("The Parks"). saveFamily returns the saved row so
  // callers (e.g. PersonForm's inline "new family") can link to it right away.
  const saveFamily = (fields, id) => {
    const row = id
      ? { ...(families.find((f) => f.id === id) || {}), ...fields, id, updated_at: now() }
      : stamp({ created_at: now(), updated_at: now(), ...fields, id: uuid() })
    setFamilies((prev) => (id ? prev.map((f) => (f.id === id ? row : f)) : [...prev, row]))
    sync((db) =>
      id
        ? db.from('families').update(fields).eq('id', id).guard(guardOf('families', id))
        : db.from('families').insert(stamp({ ...fields, id: row.id })),
    )
    return row
  }

  // Deleting a family never deletes its people — they just become familyless
  // (mirrors the FK's on-delete-set-null).
  const deleteFamily = (id) => {
    setFamilies((prev) => prev.filter((f) => f.id !== id))
    setPeople((prev) => prev.map((p) => (p.family_id === id ? { ...p, family_id: null } : p)))
    sync((db) => db.from('families').delete().eq('id', id))
  }

  const addKeyDate = (fields) => {
    const rowId = uuid()
    setKeyDates((prev) => [...prev, { annual: true, ...fields, id: rowId, created_at: now() }])
    sync((db) => db.from('key_dates').insert(stamp({ ...fields, id: rowId })))
  }

  const deleteKeyDate = (id) => {
    setKeyDates((prev) => prev.filter((kd) => kd.id !== id))
    sync((db) => db.from('key_dates').delete().eq('id', id))
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
    sync((db) =>
      db
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
    sync((db) =>
      id
        ? db.from('groups').update(fields).eq('id', id).guard(guardOf('groups', id))
        : db.from('groups').insert(stamp({ ...fields, id: rowId })),
    )
  }

  const deleteGroup = (id) => {
    setGroups((prev) => prev.filter((g) => g.id !== id))
    sync((db) => db.from('groups').delete().eq('id', id))
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
    sync((db) => db.from('habits').insert(stamp({ ...fields, id: rowId, member_id: memberId })))
    return rowId
  }

  const updateHabit = (id, fields) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...fields, updated_at: now() } : h)))
    sync((db) => db.from('habits').update(fields).eq('id', id).guard(guardOf('habits', id)))
  }

  const archiveHabit = (id, archived = true) =>
    updateHabit(id, { archived_at: archived ? now() : null })

  const deleteHabit = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id))
    setHabitEntries((prev) => prev.filter((e) => e.habit_id !== id))
    sync((db) => db.from('habits').delete().eq('id', id))
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
    sync((db) =>
      db
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
    showToast(`🔥 ${streak}-${unit} streak · ${habit.name}!`)
  }

  const reorderHabits = reorderRows('habits', setHabits)

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
    sync((db) =>
      db.from('habit_entries').upsert(
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
    sync((db) =>
      db
        .from('habit_entries')
        .delete()
        .in('id', [...ids]),
    )
  }

  // Bulk import stays awaited (not optimistic): ImportExport shows progress
  // and reports row-level errors inline.
  const importPeople = async (rows) => {
    // Imported records (CSV/vCard) carry an `organization` *name* and a `role`
    // string. Resolve each name to a single organizations row — creating any
    // missing one once per name so the same company in 50 rows yields one org —
    // then link the person to it with an affiliation (0033) that carries the
    // role, since a title only means something attached to an org.
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
    // Imported contacts honor the user's "new person" visibility default, same as
    // PersonForm — solo households force private; a row that already carries a
    // privacy_level (e.g. a JSON re-import) keeps its own.
    const defaultPersonPrivacy = isSolo() ? PRIVATE_LEVEL : getAppPrefs(memberId).personPrivacy
    // Person ids are minted here rather than left to the DB default, because
    // the affiliation rows need something to point at.
    const newAffiliations = []
    const peopleRows = rows.map(({ organization, organization_id, ...rest }) => {
      const id = rest.id || uuid()
      const orgId = organization_id ?? resolveOrg(organization)
      const row = { privacy_level: defaultPersonPrivacy, ...rest, id }
      if (orgId) {
        newAffiliations.push({
          id: uuid(),
          person_id: id,
          organization_id: orgId,
          role: (row.role || '').trim() || null,
          is_primary: true,
          show_in_summary: null,
          started_on: null,
          ended_on: null,
          created_by: userId,
          created_at: now(),
          updated_at: now(),
        })
        // The title moved onto the link; leaving a copy on the person would be
        // the two-homes-for-one-fact problem 0033 exists to remove.
        row.role = null
      }
      return row
    })

    if (isDemo) {
      if (newOrgs.length) setOrgs((prev) => [...prev, ...newOrgs])
      setPeople((prev) => [
        ...prev,
        ...peopleRows.map((r) => ({
          deleted_at: null,
          created_by: userId,
          created_at: now(),
          updated_at: now(),
          ...r,
        })),
      ])
      if (newAffiliations.length) setAffiliations((prev) => [...prev, ...newAffiliations])
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
    if (newAffiliations.length) {
      const { error: affErr } = await supabase
        .from('affiliations')
        .insert(newAffiliations.map(stamp))
      if (affErr) throw affErr
    }
    await refresh()
  }

  // Full-database restore from a JSON backup. Round-trips with the export in
  // ImportExport so data stays portable (e.g. moving off Supabase later).
  // Upserts by id so re-importing a backup is idempotent and merges cleanly.
  const restoreBackup = async (backup) => {
    // Every "backups v<=N stored it this way" rule lives in lib/backupMigrations
    // — pure data-in/data-out, so it can be tested without a database. It needs
    // the household's current orgs and areas to merge incoming rows against.
    const tables = migrateBackup(backup, { orgs, areas, userId, stamp })

    if (isDemo) {
      const merge = (prev, incoming) => {
        if (!Array.isArray(incoming)) return prev
        const map = new Map(prev.map((row) => [row.id, row]))
        for (const row of incoming) map.set(row.id, { ...map.get(row.id), ...row })
        return [...map.values()]
      }
      for (const spec of TABLES) {
        const rows = tables[spec.table]
        if (rows) setters[spec.key]((prev) => merge(prev, rows))
      }
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
        if (name === 'reminder_snoozes') return { ...r, member_id: memberId }
        // list_catalog dedupes on (household_id, norm); drop the source id so a
        // re-home merges into any existing entry instead of fighting the PK.
        if (name === 'list_catalog') {
          const { id: _id, ...rest } = r
          return stamp(rest)
        }
        const row = stamp({ ...r })
        if (name === 'tasks') row.assignee = isUuid(row.assignee) ? row.assignee : null
        if (name === 'task_completions')
          row.completed_by = isUuid(row.completed_by) ? row.completed_by : null
        return row
      })
    // TABLES is in dependency order — areas first, because tasks, lists, notes
    // and habits all carry an area_id FK, so the lens has to exist before
    // anything can be filed into it.
    for (const { table: name } of TABLES) {
      const rows = tables[name]
      if (!rows?.length) continue
      // list_catalog has no stable id across households; merge on its natural key.
      const opts = name === 'list_catalog' ? { onConflict: 'household_id,norm' } : undefined
      const { error } = await supabase.from(name).upsert(prep(name, rows), opts)
      if (error) throw error
    }
    await refresh()
  }

  // ---- Derived reads ----------------------------------------------------
  //
  // Every one of these is memoised, and the reason is not micro-optimisation.
  // `filterVisible` allocates, so an unmemoised derived array changes identity
  // on every render — and because these are what the app hands to the views as
  // `data.tasks`, `data.people` and the rest, every downstream `useMemo` keyed
  // on one of them would miss every time. That silently disabled ~100 memos
  // across the feature views: the whole attention engine and the entire
  // TasksView bucket/logbook chain re-ran on every sheet open, every useNow
  // tick and every tab focus (measured at 8ms per render on 5k tasks).
  //
  // The raw useState arrays below ARE identity-stable between renders, so
  // keying on them is what makes the memo hit. Anything derived here must stay
  // memoised for the same reason — an unmemoised addition re-breaks the chain
  // for everything downstream of it, and does so invisibly.

  // "Private — only me" enforcement (lib/privacy.js): filtered once here, so
  // every view, search, group, reminder, badge, and CSV/vCard export inherits
  // it. The all* arrays bypass the filter for the lossless JSON backup only.
  const visiblePeople = useMemo(() => filterVisible(people, userId), [people, userId])
  const visibleOrgs = useMemo(() => filterVisible(orgs, userId), [orgs, userId])
  // Reminders share the tasks table (migration 0039) and are split off HERE,
  // once, rather than filtered out by each of the eleven files that read
  // `data.tasks`. A reminder that leaks through one of those doesn't look like a
  // bug, it looks like a birthday you're failing to tick off — and the miss
  // would be in whichever view was written next, not in this one.
  const allVisibleTasks = useMemo(() => filterVisible(tasks, userId), [tasks, userId])
  const visibleTasks = useMemo(
    () => allVisibleTasks.filter((t) => !t.is_reminder),
    [allVisibleTasks],
  )
  const visibleReminders = useMemo(
    () => allVisibleTasks.filter((t) => t.is_reminder),
    [allVisibleTasks],
  )
  // Live notebook vs Recently Deleted, each privacy-filtered for the viewer.
  const visibleNotes = useMemo(
    () =>
      filterVisible(
        notes.filter((n) => !n.deleted_at),
        userId,
      ),
    [notes, userId],
  )
  const deletedNotes = useMemo(
    () =>
      filterVisible(
        notes.filter((n) => n.deleted_at),
        userId,
      ),
    [notes, userId],
  )
  const visibleLists = useMemo(() => filterVisible(lists, userId), [lists, userId])
  const visibleListItems = useMemo(() => {
    // Nothing filtered out of the lists means nothing to filter out of their
    // items — hand back the original array so its identity survives too.
    if (visibleLists.length === lists.length) return listItems
    const ids = new Set(visibleLists.map((l) => l.id))
    return listItems.filter((it) => ids.has(it.list_id))
  }, [visibleLists, lists, listItems])

  // Habits are personal by default — the main list is the current member's.
  // Anything a *different* member flagged `shared` shows up read-only in a
  // "Shared with you" section (the couple's-OS dimension). In demo, "me" is the
  // seed owner m-1 so the partner's shared habits demo correctly. Soft-deleted
  // always hidden.
  const meId = isDemo ? 'm-1' : memberId
  const liveHabits = useMemo(() => habits.filter((h) => !h.deleted_at), [habits])
  const myHabits = useMemo(() => liveHabits.filter((h) => h.member_id === meId), [liveHabits, meId])
  const sharedHabits = useMemo(
    () => liveHabits.filter((h) => h.member_id !== meId && h.shared),
    [liveHabits, meId],
  )

  // ---- The object the whole app reads ------------------------------------
  //
  // Everything a view can DO, collected once. These close over this render's
  // state, so a fresh set is built every render — which is precisely why they
  // are not returned directly: sixty-odd new function identities would change
  // `data`'s identity on every render and make the memo below worthless.
  const mutations = {
    refresh,
    // Unbounded read of one table, for the lossless JSON backup — see
    // RECENT_LOG_DAYS in lib/tables.js for why the app's own read is narrower.
    fetchFullTable,
    savePerson,
    deletePerson,
    restorePerson,
    purgePerson,
    saveOrg,
    findOrCreateOrg,
    deleteOrg,
    setPersonAffiliations,
    addRelationship,
    deleteRelationship,
    addInteraction,
    saveInteraction,
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
    deleteListItems,
    setListItemsChecked,
    deleteTasks,
    deleteNotes,
    addNote,
    updateNote,
    deleteNote,
    restoreNote,
    purgeNote,
    discardNote,
    addArea,
    updateArea,
    moveAreaItems,
    reorderAreas,
    archiveArea,
    unarchiveArea,
    deleteArea,
    mergeAreas,
    togglePinNote,
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

  // A stable façade over them. `api` is built once and every method dispatches
  // through the ref, so callers always run the freshest closure while the
  // object handed to the views never changes identity. The alternative was
  // useCallback on all sixty, each with its own dependency list to get wrong.
  //
  // Derived from `mutations` rather than a hand-written name list on purpose:
  // a new mutation is exposed by existing, not by being remembered twice.
  latestMutations.current = mutations
  const api = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(mutations).map((k) => [k, (...args) => latestMutations.current[k](...args)]),
      ),
    // Built from the first render's key set, which is static — the object is
    // one literal above, so the names cannot vary between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Memoised so that a render which changed no data — a sheet opening, the
  // useNow tick, a route change, a tab regaining focus — hands every view the
  // same object it had before, and React.memo can skip the subtree outright.
  return useMemo(
    () => ({
      people: visiblePeople,
      orgs: visibleOrgs,
      // Not privacy-filtered itself: a link is only reachable through a person
      // or an org, and both of those arrays are already filtered for the viewer.
      affiliations,
      relationships,
      interactions,
      groups,
      tasks: visibleTasks,
      reminders: visibleReminders,
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
      notes: visibleNotes,
      deletedNotes,
      // Every area in the household, unfiltered. Which ones YOU are offered as
      // a lens (`shared or mine`, minus archived) is lib/areas.visibleAreas —
      // kept there rather than here because the manager deliberately wants the
      // full list, archived rows included.
      areas,
      allNotes: notes,
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
      ...api,
    }),
    [
      visiblePeople,
      visibleOrgs,
      affiliations,
      relationships,
      interactions,
      groups,
      visibleTasks,
      visibleReminders,
      completions,
      taskLinks,
      visibleLists,
      visibleListItems,
      listCatalog,
      families,
      keyDates,
      reminderSnoozes,
      myHabits,
      sharedHabits,
      habitEntries,
      visibleNotes,
      deletedNotes,
      areas,
      notes,
      people,
      orgs,
      tasks,
      lists,
      listItems,
      habits,
      loading,
      error,
      userId,
      memberId,
      api,
    ],
  )
}
