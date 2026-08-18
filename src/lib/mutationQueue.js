// Durable write queue — the other half of Tier-1 offline.
//
// lib/offlineCache.js made READS survive a cold launch with no network. Writes
// did not: `sync()` in useData is fire-and-forget, so a failed write toasts,
// refetches, and is gone. Close the laptop mid-edit on a train and the edit
// never happened — announced by a toast you were not there to read.
//
// The blocker was never the storage, it was the shape. `sync()` takes a
// CLOSURE, and a closure cannot be written to IndexedDB and replayed after a
// reload. So a mutation has to be describable as data:
//
//   { table: 'tasks', op: 'update', values: {…}, where: [['eq','id','…']] }
//
// which is enough to rebuild the PostgREST call later, on a different page
// load, in a different session.
//
// Deliberately NOT a general sync engine. No CRDT, no rebasing, no operational
// transform. It is an ordered outbox with a staleness guard, which is the right
// size for a household app where two people occasionally edit the same list.
//
// The store is injected rather than imported so the queue's actual behavior —
// ordering, retry, what counts as fatal — is testable in plain node. IndexedDB
// is then a thin adapter with no logic in it.

// Give up after this many attempts. A write that has failed ten times across
// reconnects is not going to start working, and keeping it forever means the
// queue can never drain — every later write waits behind a corpse.
export const MAX_ATTEMPTS = 10

// Tables whose updated_at is maintained by the touch_updated_at trigger
// (schema.sql). ONLY these can carry a staleness guard: the guard compares
// against the server's own last-modified time, so it means nothing on a table
// where updated_at is whatever a client last wrote — or absent entirely, as on
// list_items, one of the busiest write paths there is.
//
// Everything else stays last-write-wins, exactly as it is today. That is a real
// limitation, and it is better stated than quietly assumed.
//
// This list IS the trigger list in schema.sql, and drifting from it fails in
// whichever direction the drift goes: a table here without the trigger guards
// against a timestamp clients write themselves (meaningless), and a table with
// the trigger left out silently gives up a protection it could have had.
export const GUARDED_TABLES = new Set([
  'affiliations',
  'areas',
  'families',
  'groups',
  'habit_entries',
  'habits',
  'interactions',
  'lists',
  'member_preferences',
  'notes',
  'notification_prefs',
  'organizations',
  'people',
  'tasks',
])

// Which single row a mutation targets, or null if it isn't addressing exactly
// one by id (a bulk `.in()`, a filter on some other column). Used by enqueue
// below to spot a second edit to a row already waiting in the outbox.
export function targetKey(m) {
  if (!m?.table) return null
  const where = m.where || []
  if (where.length !== 1) return null
  const [fn, column, value] = where[0]
  if (fn !== 'eq' || column !== 'id') return null
  return `${m.table}:${value}`
}

// ---- what we may guard against -----------------------------------------

// The guard's one hard rule: it may only ever compare against a timestamp the
// SERVER gave us.
//
// The obvious implementation — guard with the row's `updated_at` out of local
// state — is wrong, and quietly so. Every optimistic update in useData stamps
// `updated_at: now()` from the client clock so the row sorts and reads
// correctly on screen. That value never came from the database. Guarding with
// it compares a phone's clock against a Postgres trigger's, and a phone two
// seconds slow would have its own edits rejected as stale — turning a
// protection against lost work into a cause of it.
//
// So the book records only what a server read actually returned, and forgets a
// row the moment one of our writes to it settles: from then until the next read
// we have no server observation, and no observation means no guard. Degrading
// to today's last-write-wins is the correct answer to "I don't know" — a guard
// invented from a value nobody promised is not.
export function createGuardBook() {
  const seen = new Map()
  const key = (table, id) => `${table}:${id}`
  return {
    // A table's rows, straight off a server read.
    observe(table, rows) {
      if (!GUARDED_TABLES.has(table)) return
      for (const row of rows || []) {
        if (row?.id && row.updated_at) seen.set(key(table, row.id), row.updated_at)
      }
    },
    forget(table, id) {
      seen.delete(key(table, id))
    },
    // Whatever a mutation just settled as — the row may have moved, so our
    // observation of it is spent.
    forgetTarget(m) {
      const t = targetKey(m)
      if (t) seen.delete(t)
    },
    guardFor(table, id) {
      return seen.get(key(table, id)) || null
    },
    clear() {
      seen.clear()
    },
    get size() {
      return seen.size
    },
  }
}

// ---- stores ------------------------------------------------------------
// Interface: add(record) → seq, getAll() → records, put(record), remove(seq),
// clear(). Records carry a monotonic `seq`; ascending seq IS replay order.

export function memoryStore() {
  let seq = 0
  const rows = new Map()
  return {
    async add(record) {
      const withSeq = { ...record, seq: ++seq }
      rows.set(withSeq.seq, withSeq)
      return withSeq
    },
    async getAll() {
      return [...rows.values()].sort((a, b) => a.seq - b.seq)
    },
    async put(record) {
      if (rows.has(record.seq)) rows.set(record.seq, record)
    },
    async remove(s) {
      rows.delete(s)
    },
    async clear() {
      rows.clear()
    },
  }
}

const DB_NAME = 'doot-writes'
const STORE = 'outbox'
const VERSION = 1

export function indexedDBStore() {
  let dbPromise
  const openDB = () => {
    if (dbPromise) return dbPromise
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no indexedDB'))
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          // autoIncrement is what makes the outbox ordered.
          db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return dbPromise
  }

  const run = async (mode, fn) => {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      let out
      const req = fn(t.objectStore(STORE))
      if (req) req.onsuccess = () => (out = req.result)
      t.oncomplete = () => resolve(out)
      t.onerror = () => reject(t.error)
    })
  }

  // Every method swallows storage failures (private mode, quota, no IndexedDB).
  // A device that cannot persist the outbox still writes — it just isn't
  // durable, which is exactly today's behavior rather than a regression.
  return {
    async add(record) {
      try {
        const seq = await run('readwrite', (s) => s.add(record))
        return { ...record, seq }
      } catch {
        return null
      }
    },
    async getAll() {
      try {
        return (await run('readonly', (s) => s.getAll())) || []
      } catch {
        return []
      }
    },
    async put(record) {
      try {
        await run('readwrite', (s) => s.put(record))
      } catch {
        /* best effort */
      }
    },
    async remove(seq) {
      try {
        await run('readwrite', (s) => s.delete(seq))
      } catch {
        /* best effort */
      }
    },
    async clear() {
      try {
        await run('readwrite', (s) => s.clear())
      } catch {
        /* best effort */
      }
    },
  }
}

// ---- classification ----------------------------------------------------

// Why did this write fail, and is trying again ever going to help?
//
// Getting this wrong is the whole ballgame, in both directions. Treat a
// constraint violation as retryable and the queue jams forever behind a write
// that can never land. Treat a dropped connection as permanent and you have
// rebuilt the bug this module exists to fix — a silently discarded edit.
export function classifyError(err) {
  if (!err) return 'ok'

  // PostgREST reports Postgres SQLSTATEs. These are verdicts about the data
  // itself, and the same request will fail the same way tomorrow.
  const code = String(err.code ?? '')
  if (/^(22|23|42)/.test(code)) return 'drop' // data exception, constraint, syntax/RLS

  const status = err.status ?? err.statusCode
  if (typeof status === 'number') {
    if (status >= 400 && status < 500) return 'drop' // ours to fix, not to repeat
    return 'retry' // 5xx: the server's problem, and servers recover
  }

  // No status at all is the signature of never having reached a server: fetch
  // rejects with a TypeError when the network is gone.
  return 'retry'
}

// ---- execution ---------------------------------------------------------

// Rebuild the PostgREST call from the description and run it.
//
// `guard` is an ISO timestamp meaning "only if nobody has touched this row
// since". It becomes `.lte('updated_at', guard)`, so a write composed at 10am
// and replayed at noon cannot flatten an edit somebody made at 11 — the classic
// way an offline queue destroys work. The row simply doesn't match, zero rows
// come back, and that is reported as superseded rather than as a failure.
export async function applyMutation(client, m) {
  let q = client.from(m.table)

  if (m.op === 'insert') q = q.insert(m.values)
  else if (m.op === 'upsert')
    q = q.upsert(m.values, m.onConflict ? { onConflict: m.onConflict } : undefined)
  else if (m.op === 'update') q = q.update(m.values)
  else if (m.op === 'delete') q = q.delete()
  else throw new Error(`unknown op: ${m.op}`)

  for (const [fn, column, value] of m.where || []) q = q[fn](column, value)

  // The guard only goes on updates. An insert has nothing to be stale against,
  // and a guarded delete would silently leave rows behind.
  const guarded = m.op === 'update' && !!m.guard && GUARDED_TABLES.has(m.table)
  if (guarded) q = q.lte('updated_at', m.guard).select('id')

  const res = await q
  if (res?.error) return { status: classifyError(res.error), error: res.error }
  if (guarded && Array.isArray(res.data) && res.data.length === 0) {
    // Someone else got there first. Their value is newer, so ours is correctly
    // discarded — but the UI is still showing the value that lost, so the
    // caller needs to know to refetch.
    return { status: 'superseded' }
  }
  return { status: 'ok' }
}

// ---- recording ---------------------------------------------------------

// A stand-in for the Supabase client that writes nothing and remembers
// everything. Hand it to a write closure and you get back the mutations that
// closure WOULD have performed, as data.
//
// This is what keeps the call sites honest. The alternative was hand-writing
// sixty descriptors next to sixty optimistic updates, where the descriptor and
// the local update could drift apart silently — the update saying one thing and
// the queued write another, which is the worst possible bug in a sync layer
// because the screen and the server disagree and neither looks wrong on its own.
// Here the closure IS the description; there is nothing to keep in step.
//
// Every awaited chain resolves to { data: null, error: null }, so a closure that
// only writes runs to completion unchanged. A closure that READS mid-flight
// cannot work this way — and shouldn't, since a mutation that depends on a
// network read is one that can never be replayed from an outbox.
export function createRecorder() {
  const mutations = []
  let current = null

  const builder = {
    from(table) {
      current = { table, where: [] }
      return this
    },
    insert(values) {
      current.op = 'insert'
      current.values = values
      return this
    },
    upsert(values, opts) {
      current.op = 'upsert'
      current.values = values
      if (opts?.onConflict) current.onConflict = opts.onConflict
      return this
    },
    update(values) {
      current.op = 'update'
      current.values = values
      return this
    },
    delete() {
      current.op = 'delete'
      return this
    },
    eq(column, value) {
      current.where.push(['eq', column, value])
      return this
    },
    in(column, value) {
      current.where.push(['in', column, value])
      return this
    },
    // "Only if nobody has touched this row since I last saw it." Chained after
    // the filter, and a no-op given null/undefined so a call site can pass
    // whatever it knows without branching — an unknown timestamp must degrade
    // to today's last-write-wins, never to a guard against nothing.
    //
    // Exists only on the recorder. applyMutation rebuilds the real PostgREST
    // call from `guard` as data, so the live client never sees this method.
    guard(updatedAt) {
      if (updatedAt) current.guard = updatedAt
      return this
    },
    // Awaiting the chain is what commits it to the list — that ordering is why
    // a `for` loop of awaited updates records as N mutations in loop order.
    then(resolve, reject) {
      if (current) {
        mutations.push(current)
        current = null
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject)
    },
  }

  // Reading inside a write closure can't work here, and the bare "is not a
  // function" you'd otherwise get sends you looking in the wrong place. This is
  // not a gap to be filled in later: a mutation whose content depends on a
  // query cannot be replayed from an outbox, because at replay time the answer
  // may be different or the network may be gone. Compute the value from local
  // state before calling sync() — completeTask() is the worked example.
  for (const name of ['select', 'order', 'limit', 'single', 'maybeSingle', 'rpc']) {
    builder[name] = () => {
      throw new Error(
        `mutationQueue: .${name}() is not available inside a write closure — ` +
          'a queued mutation cannot depend on a read. Resolve the value from local state first.',
      )
    }
  }

  return { builder, mutations }
}

// Run a write closure against a recorder and return what it would have done.
// The closure may be sync or async, and may branch or loop — all of that is
// ordinary JavaScript evaluated here, so only the writes it actually reaches
// get recorded.
export async function record(op) {
  const { builder, mutations } = createRecorder()
  await op(builder)
  return mutations
}

// ---- the queue ---------------------------------------------------------

export function createMutationQueue(store = indexedDBStore()) {
  // Queueing a second edit to a row that already has one waiting DROPS the new
  // guard, and this is the case that makes the whole feature safe to turn on.
  //
  // Offline, editing the same task twice queues A then B, both composed against
  // the same server timestamp. A lands and the trigger moves updated_at past
  // it — so B, guarded against a value its own predecessor just invalidated,
  // would be discarded as "somebody else got there first". The somebody was us.
  //
  // The guard exists to lose races against OTHER members, never against our own
  // earlier writes, and ordering already settles those: the outbox is replayed
  // in sequence, so B is the later intent by construction.
  const enqueue = async (mutation) => {
    let m = mutation
    if (m.guard) {
      const key = targetKey(m)
      const queued = await store.getAll()
      if (key && queued.some((q) => q.op === 'update' && targetKey(q) === key)) {
        const { guard: _dropped, ...rest } = m
        m = rest
      }
    }
    return store.add({
      ...m,
      queuedAt: m.queuedAt || new Date().toISOString(),
      attempts: 0,
    })
  }

  const pending = async (householdId = null) => {
    const all = await store.getAll()
    return householdId ? all.filter((m) => m.householdId === householdId) : all
  }

  // Drain the outbox in order.
  //
  // A permanently-failed mutation is dropped and the drain CONTINUES; a
  // retryable one STOPS the drain where it stands. The asymmetry is the point:
  // a write that might still land must not be overtaken by later writes to the
  // same row, whereas one that can never land would otherwise freeze the device
  // forever — a worse failure than a gap a refetch repairs.
  const drain = async (client, { householdId = null, onDrop, onSettled } = {}) => {
    const queued = await pending(householdId)
    let sent = 0
    let dropped = 0
    let superseded = 0

    for (const m of queued) {
      let outcome
      try {
        outcome = await applyMutation(client, m)
      } catch (err) {
        outcome = { status: classifyError(err), error: err }
      }

      // Any settled outcome means the row on the server may no longer match
      // what we last read, so whatever timestamp we were guarding it with is
      // spent. Told to the caller rather than tracked here: the queue doesn't
      // read, so it has no business holding read state.
      if (outcome.status !== 'retry') onSettled?.(m)

      if (outcome.status === 'ok') {
        await store.remove(m.seq)
        sent++
      } else if (outcome.status === 'superseded') {
        await store.remove(m.seq)
        superseded++
      } else if (outcome.status === 'drop') {
        await store.remove(m.seq)
        dropped++
        onDrop?.(m, outcome.error)
      } else if ((m.attempts || 0) + 1 >= MAX_ATTEMPTS) {
        await store.remove(m.seq)
        dropped++
        onDrop?.(m, outcome.error)
      } else {
        await store.put({ ...m, attempts: (m.attempts || 0) + 1 })
        break
      }
    }

    return { sent, dropped, superseded, remaining: (await pending(householdId)).length }
  }

  return {
    enqueue,
    pending,
    drain,
    remove: (seq) => store.remove(seq),
    clear: () => store.clear(),
  }
}

// The app's singleton, backed by IndexedDB.
export const mutationQueue = createMutationQueue()
