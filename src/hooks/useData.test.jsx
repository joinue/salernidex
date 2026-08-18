import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Coverage for the wiring that sends every write through the durable outbox.
// mutationQueue's own behavior is tested next door; what is tested HERE is the
// part that had no coverage at all: that useData's write functions actually
// produce the mutations they claim to, and that a write which fails because the
// network is gone is still there afterwards.
//
// This is the condition none of the rest of the suite exercises, and the one
// the whole feature exists for.

// `mode` decides how the fake server answers a WRITE. Reads always succeed
// empty, so the hook mounts without needing a fixture for thirteen tables.
let mode = 'ok'

vi.mock('../lib/supabase', () => {
  const chain = () => {
    const state = { write: false }
    const c = {
      select: () => c,
      order: () => c,
      limit: () => c,
      eq: () => c,
      in: () => c,
      lte: () => c,
      // The append-only logs are read from a date floor — see RECENT_LOG_DAYS.
      gte: () => c,
      // Row-at-a-time reads resolve to a row, not a list — hydrateNotifyPrefs
      // branches on the difference.
      single: () => ((state.single = true), c),
      maybeSingle: () => ((state.single = true), c),
      insert: () => ((state.write = true), c),
      update: () => ((state.write = true), c),
      upsert: () => ((state.write = true), c),
      delete: () => ((state.write = true), c),
      then(resolve, reject) {
        if (state.write && mode === 'offline') {
          return Promise.reject(new TypeError('Failed to fetch')).then(resolve, reject)
        }
        if (state.write && mode === 'rejected') {
          return Promise.resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key value' },
          }).then(resolve, reject)
        }
        return Promise.resolve({ data: state.single ? null : [], error: null }).then(
          resolve,
          reject,
        )
      },
    }
    return c
  }
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    isConfigured: true,
    supabase: { from: () => chain(), channel: () => channel, removeChannel: () => {} },
  }
})

// The real queue is bound to IndexedDB, which jsdom does not implement — it
// would swallow every write and the tests would pass by doing nothing. Swap in
// the memory-backed store; everything else is the genuine article.
vi.mock('../lib/mutationQueue', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, mutationQueue: actual.createMutationQueue(actual.memoryStore()) }
})

import { useData } from './useData'
import { mutationQueue } from '../lib/mutationQueue'

const HOUSEHOLD = {
  id: 'h-1',
  name: 'Test',
  join_code: 'ABC-DEF',
  members: [{ id: 'm-1', name: 'Me' }],
  current_member_id: 'm-1',
}

// Stable identity, and it matters: the data effect depends on `session`, so a
// fresh object literal per render re-runs it, which refetches, which re-renders
// — a runaway loop that is a property of the test, not of the hook.
const SESSION = { user: { id: 'u-1' } }
const DEMO_SESSION = { demo: true }

const mount = async () => {
  const view = renderHook(() => useData(SESSION))
  // Let the mount effects (refresh, prefs hydrate, initial flush) settle, then
  // start from an empty outbox: hydrating preferences legitimately queues its
  // own writes, and counting those as the test's would be measuring the setup.
  await act(async () => {
    await Promise.resolve()
  })
  await mutationQueue.clear()
  return view
}

// What actually reached the outbox, in order.
const queued = async (table = 'tasks') =>
  (await mutationQueue.pending())
    .filter((m) => m.table === table)
    .map((m) => ({ table: m.table, op: m.op, where: m.where, values: m.values }))

beforeEach(async () => {
  mode = 'ok'
  localStorage.clear()
  localStorage.setItem('salernidex-household', JSON.stringify(HOUSEHOLD))
  await mutationQueue.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useData writes → outbox', () => {
  it('sends what it was holding once the network comes back', async () => {
    // The whole point of the feature: a write made offline lands later, without
    // the user doing anything.
    mode = 'offline'
    const { result } = await mount()
    await act(async () => {
      result.current.addTask({ title: 'Buy milk' })
    })
    await waitFor(async () => expect(await queued()).toHaveLength(1))

    mode = 'ok'
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(async () => expect(await queued()).toHaveLength(0))
  })

  describe('when the network is gone', () => {
    beforeEach(() => {
      mode = 'offline'
    })

    it('keeps a created task instead of losing it', async () => {
      const { result } = await mount()
      await act(async () => {
        result.current.addTask({ title: 'Buy milk' })
      })

      await waitFor(async () => expect(await queued()).toHaveLength(1))
      const [m] = await queued()
      expect(m.table).toBe('tasks')
      expect(m.op).toBe('insert')
      expect(m.values).toMatchObject({ title: 'Buy milk', household_id: 'h-1' })
    })

    it('leaves the optimistic row on screen — the write is waiting, not lost', async () => {
      // The old behavior refetched on failure, which snapped the row away. That
      // is right when the write is gone forever and wrong when it is queued.
      const { result } = await mount()
      await act(async () => {
        result.current.addTask({ title: 'Still here' })
      })
      await waitFor(() =>
        expect(result.current.tasks.some((t) => t.title === 'Still here')).toBe(true),
      )
    })

    it('records an update with its filter', async () => {
      const { result } = await mount()
      await act(async () => {
        result.current.updateTask('t-9', { title: 'Renamed' })
      })

      await waitFor(async () => expect(await queued()).toHaveLength(1))
      expect((await queued())[0]).toMatchObject({
        table: 'tasks',
        op: 'update',
        where: [['eq', 'id', 't-9']],
        values: { title: 'Renamed' },
      })
    })

    it('records a reorder as one mutation per moved row, in order', async () => {
      // A multi-step closure: the loop shape that the recorder has to preserve.
      const { result } = await mount()
      await act(async () => {
        result.current.reorderTasks([
          { id: 'a', sort_order: 0 },
          { id: 'b', sort_order: 1 },
        ])
      })

      await waitFor(async () => expect(await queued()).toHaveLength(2))
      const ops = await queued()
      expect(ops.map((m) => m.where[0][2])).toEqual(['a', 'b'])
      expect(ops.every((m) => m.table === 'tasks' && m.op === 'update')).toBe(true)
    })

    it('preserves the order of writes across separate calls', async () => {
      // Create then rename: invert these on replay and the update lands on
      // nothing, leaving the task at its created title forever.
      const { result } = await mount()
      let id
      await act(async () => {
        id = result.current.addTask({ title: 'first' })
      })
      await act(async () => {
        result.current.updateTask(id, { title: 'second' })
      })

      await waitFor(async () => expect(await queued()).toHaveLength(2))
      expect((await queued()).map((m) => m.op)).toEqual(['insert', 'update'])
    })

    it('queues a delete with its filter rather than dropping it', async () => {
      const { result } = await mount()
      await act(async () => {
        result.current.deleteTask('t-4')
      })

      await waitFor(async () => expect((await queued()).length).toBeGreaterThan(0))
      expect((await queued())[0]).toMatchObject({
        table: 'tasks',
        op: 'delete',
        where: [['eq', 'id', 't-4']],
      })
    })
  })

  it('does not keep a write the server will never accept', async () => {
    // A constraint violation is a verdict about the data. Retrying it forever
    // would jam every later write on the device behind it.
    mode = 'rejected'
    const { result } = await mount()
    await act(async () => {
      result.current.addTask({ title: 'dupe' })
    })
    await waitFor(async () => expect(await queued()).toHaveLength(0))
  })

  it('writes nothing at all in demo mode', async () => {
    const view = renderHook(() => useData(DEMO_SESSION))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      view.result.current.addTask({ title: 'demo task' })
    })
    expect(await mutationQueue.pending()).toHaveLength(0)
  })
})

// Moving an archived area's leftovers is four repoints and nothing else, which
// is exactly why it can ride the outbox when merge — same shape, plus a delete
// — cannot. A half-applied merge unfiles rows via `on delete set null`; a
// half-applied move just leaves some of them where they already were.
describe('useData — moveAreaItems', () => {
  // This one spans four tables, so it can't use the tasks-only `queued`.
  const everything = async () => await mutationQueue.pending()

  it('repoints every filed table, and deletes nothing', async () => {
    mode = 'offline'
    const { result } = await mount()
    await act(async () => {
      result.current.moveAreaItems('a-old', 'a-work')
    })

    await waitFor(async () => expect(await everything()).toHaveLength(4))
    const ms = await everything()
    expect(ms.map((m) => m.table)).toEqual(['tasks', 'lists', 'notes', 'habits'])
    for (const m of ms) {
      expect(m.op).toBe('update')
      expect(m.where).toEqual([['eq', 'area_id', 'a-old']])
      expect(m.values).toEqual({ area_id: 'a-work' })
    }
  })

  it('refuses a move that would go nowhere', async () => {
    mode = 'offline'
    const { result } = await mount()
    await act(async () => {
      result.current.moveAreaItems('a-old', 'a-old')
      result.current.moveAreaItems(null, 'a-work')
    })
    expect(await everything()).toHaveLength(0)
  })
})
