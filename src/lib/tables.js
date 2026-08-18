// Every table the client mirrors, described once.
//
// This used to be five separate lists that all had to agree: the read in
// refresh(), the error chain that decided which failures were fatal, nineteen
// setState calls, the snapshot-save object, the snapshot-load object, and the
// restore's upsert order. Adding a table meant six edits in four places, and
// forgetting one of them failed quietly — a table that loaded but never cached,
// or cached but never restored.
//
// It is now one row per table. Order is the restore's dependency order: a
// parent must be upserted before the children whose FKs point at it, which is
// why areas leads (tasks, lists, notes and habits all carry an area_id).
//
//   key       what the array is called in app state and in the offline snapshot
//   table     the Postgres table
//   scope     'household' filters on household_id; 'member' on member_id
//             (reminder_snoozes is mine, not the household's)
//   order     column to sort by server-side; desc: true for newest-first
//   since     bound the read to RECENT_LOG_DAYS on this column — see below
//   critical  a failure here blanks the app with an error. Everything else
//             degrades to empty: a table whose migration hasn't run yet must
//             cost you that feature, not the whole app.

// How far back the append-only logs are read for the app's own use.
//
// task_completions is the one table with no natural ceiling — every check-off
// of every recurring chore lands here forever, so a household a few years in
// has tens of thousands of rows that were being pulled in full on every
// refetch, held in memory, and serialised to IndexedDB. Nothing in the UI looks
// that far back: the Done logbook caps itself at two weeks, and a task's
// history panel is a recent-activity display.
//
// The JSON backup is the exception, and it matters — a backup is contractually
// lossless. It reads through fetchFullTable() instead, which ignores this.
export const RECENT_LOG_DAYS = 400

// interactions is deliberately NOT bounded. It looks like the same shape, but
// "last spoke three years ago" is a fact this app exists to keep — bounding it
// would quietly turn an old contact into one you have never spoken to.
export const TABLES = [
  { key: 'areas', table: 'areas', scope: 'household' },
  { key: 'families', table: 'families', scope: 'household', order: 'name', critical: true },
  { key: 'orgs', table: 'organizations', scope: 'household', order: 'name', critical: true },
  { key: 'people', table: 'people', scope: 'household', order: 'name', critical: true },
  { key: 'affiliations', table: 'affiliations', scope: 'household' },
  { key: 'relationships', table: 'relationships', scope: 'household', critical: true },
  {
    key: 'interactions',
    table: 'interactions',
    scope: 'household',
    order: 'occurred_at',
    desc: true,
    critical: true,
  },
  { key: 'keyDates', table: 'key_dates', scope: 'household', order: 'date', critical: true },
  { key: 'groups', table: 'groups', scope: 'household', order: 'name', critical: true },
  { key: 'tasks', table: 'tasks', scope: 'household', order: 'created_at', critical: true },
  {
    key: 'completions',
    table: 'task_completions',
    scope: 'household',
    order: 'completed_at',
    desc: true,
    since: 'completed_at',
    critical: true,
  },
  { key: 'taskLinks', table: 'task_links', scope: 'household', critical: true },
  { key: 'lists', table: 'lists', scope: 'household', order: 'created_at', critical: true },
  {
    key: 'listItems',
    table: 'list_items',
    scope: 'household',
    order: 'created_at',
    critical: true,
  },
  { key: 'reminderSnoozes', table: 'reminder_snoozes', scope: 'member' },
  { key: 'habits', table: 'habits', scope: 'household', order: 'created_at' },
  { key: 'habitEntries', table: 'habit_entries', scope: 'household' },
  { key: 'listCatalog', table: 'list_catalog', scope: 'household' },
  { key: 'notes', table: 'notes', scope: 'household', order: 'updated_at', desc: true },
]

// The restore's upsert order — the same dependency order as above.
export const BACKUP_TABLES = TABLES.map((t) => t.table)

// ISO timestamp of the read floor for `since` tables.
export const recentLogFloor = (days = RECENT_LOG_DAYS) =>
  new Date(Date.now() - days * 86400000).toISOString()
