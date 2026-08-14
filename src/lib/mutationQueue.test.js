import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  applyMutation,
  classifyError,
  createMutationQueue,
  memoryStore,
  GUARDED_TABLES,
  MAX_ATTEMPTS,
} from './mutationQueue'

// A stand-in for the PostgREST builder: records what was asked for, and resolves
// to whatever the test told it to. Every method returns `this`, which is what
// makes the real client chainable.
function fakeClient(responder = () => ({ data: [{ id: 'x' }], error: null })) {
  const calls = []
  const builder = {
    _current: null,
    from(table) {
      this._current = { table, filters: [] }
      calls.push(this._current)
      return this
    },
    insert(values) {
      this._current.op = 'insert'
      this._current.values = values
      return this
    },
    upsert(values, opts) {
      this._current.op = 'upsert'
      this._current.values = values
      this._current.opts = opts
      return this
    },
    update(values) {
      this._current.op = 'update'
      this._current.values = values
      return this
    },
    delete() {
      this._current.op = 'delete'
      return this
    },
    eq(c, v) {
      this._current.filters.push(['eq', c, v])
      return this
    },
    in(c, v) {
      this._current.filters.push(['in', c, v])
      return this
    },
    lte(c, v) {
      this._current.filters.push(['lte', c, v])
      return this
    },
    select(cols) {
      this._current.selected = cols
      return this
    },
    then(resolve, reject) {
      return Promise.resolve(responder(this._current)).then(resolve, reject)
    },
  }
  return { builder, calls }
}

describe('classifyError', () => {
  // The two ways to get this wrong are opposite and both bad: a jammed queue,
  // or the silently-discarded edit this module exists to prevent.
  it('retries anything that never reached a server', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('retry')
    expect(classifyError({})).toBe('retry')
  })

  it('retries a server that is having a bad day', () => {
    expect(classifyError({ status: 500 })).toBe('retry')
    expect(classifyError({ status: 503 })).toBe('retry')
  })

  it('drops a verdict about the data itself', () => {
    expect(classifyError({ code: '23505' })).toBe('drop') // unique violation
    expect(classifyError({ code: '23503' })).toBe('drop') // FK violation
    expect(classifyError({ code: '42501' })).toBe('drop') // RLS / insufficient privilege
    expect(classifyError({ code: '22P02' })).toBe('drop') // invalid text representation
  })

  it('drops what we are not allowed to write', () => {
    expect(classifyError({ status: 401 })).toBe('drop')
    expect(classifyError({ status: 403 })).toBe('drop')
    expect(classifyError({ status: 400 })).toBe('drop')
  })
})

describe('applyMutation', () => {
  it('rebuilds an insert', async () => {
    const { builder, calls } = fakeClient()
    await applyMutation(builder, { table: 'tasks', op: 'insert', values: { id: 't1' } })
    expect(calls[0]).toMatchObject({ table: 'tasks', op: 'insert', values: { id: 't1' } })
  })

  it('rebuilds filters in order', async () => {
    const { builder, calls } = fakeClient()
    await applyMutation(builder, {
      table: 'list_items',
      op: 'delete',
      where: [
        ['eq', 'list_id', 'l1'],
        ['in', 'id', ['a', 'b']],
      ],
    })
    expect(calls[0].filters).toEqual([
      ['eq', 'list_id', 'l1'],
      ['in', 'id', ['a', 'b']],
    ])
  })

  it('passes onConflict through on an upsert', async () => {
    const { builder, calls } = fakeClient()
    await applyMutation(builder, {
      table: 'push_subscriptions',
      op: 'upsert',
      values: { endpoint: 'e' },
      onConflict: 'endpoint',
    })
    expect(calls[0].opts).toEqual({ onConflict: 'endpoint' })
  })

  describe('the staleness guard', () => {
    it('adds lte(updated_at) on a guarded table', async () => {
      const { builder, calls } = fakeClient()
      await applyMutation(builder, {
        table: 'tasks',
        op: 'update',
        values: { title: 'mine' },
        where: [['eq', 'id', 't1']],
        guard: '2026-08-13T10:00:00Z',
      })
      expect(calls[0].filters).toContainEqual(['lte', 'updated_at', '2026-08-13T10:00:00Z'])
    })

    it('reports a guarded update that matched nothing as superseded, not failed', async () => {
      // Somebody edited the row at 11 while our write was composed at 10. Theirs
      // is newer, so ours is correctly thrown away — but the UI is still showing
      // the value that lost, which is why this is distinguishable from success.
      const { builder } = fakeClient(() => ({ data: [], error: null }))
      const res = await applyMutation(builder, {
        table: 'tasks',
        op: 'update',
        values: { title: 'stale' },
        where: [['eq', 'id', 't1']],
        guard: '2026-08-13T10:00:00Z',
      })
      expect(res.status).toBe('superseded')
    })

    it('does not guard a table whose updated_at nothing maintains', async () => {
      // list_items has no updated_at at all. A guard there would compare against
      // a column that does not exist, or worse, one a client last wrote.
      expect(GUARDED_TABLES.has('list_items')).toBe(false)
      const { builder, calls } = fakeClient()
      await applyMutation(builder, {
        table: 'list_items',
        op: 'update',
        values: { checked_at: null },
        where: [['eq', 'id', 'i1']],
        guard: '2026-08-13T10:00:00Z',
      })
      expect(calls[0].filters.some(([fn]) => fn === 'lte')).toBe(false)
    })

    it('never guards an insert or a delete', async () => {
      // A guarded delete would silently leave rows behind.
      const { builder, calls } = fakeClient()
      await applyMutation(builder, {
        table: 'tasks',
        op: 'delete',
        where: [['eq', 'id', 't1']],
        guard: '2026-08-13T10:00:00Z',
      })
      expect(calls[0].filters.some(([fn]) => fn === 'lte')).toBe(false)
    })
  })
})

describe('drain', () => {
  let q
  beforeEach(() => {
    q = createMutationQueue(memoryStore())
  })

  it('replays in the order the writes were made', async () => {
    // Not cosmetic: invert these and the update lands on a row that does not
    // exist yet, leaving the task at its created state forever.
    await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 't1', title: 'first' } })
    await q.enqueue({
      table: 'tasks',
      op: 'update',
      values: { title: 'second' },
      where: [['eq', 'id', 't1']],
    })

    const { builder, calls } = fakeClient()
    const res = await q.drain(builder)

    expect(calls.map((c) => c.op)).toEqual(['insert', 'update'])
    expect(res).toMatchObject({ sent: 2, dropped: 0, remaining: 0 })
  })

  it('keeps a write that failed on the network, and stops rather than reordering', async () => {
    await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 't1' } })
    await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 't2' } })

    const { builder, calls } = fakeClient(() => {
      throw new TypeError('Failed to fetch')
    })
    const res = await q.drain(builder)

    expect(calls).toHaveLength(1) // stopped after the first failure
    expect(res).toMatchObject({ sent: 0, dropped: 0, remaining: 2 })
    expect((await q.pending())[0].attempts).toBe(1)
  })

  it('drops a write the server will never accept, and carries on', async () => {
    await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 'dupe' } })
    await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 'fine' } })

    const onDrop = vi.fn()
    let first = true
    const { builder } = fakeClient(() => {
      if (first) {
        first = false
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      return { data: [{ id: 'fine' }], error: null }
    })

    const res = await q.drain(builder, { onDrop })
    expect(res).toMatchObject({ sent: 1, dropped: 1, remaining: 0 })
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop.mock.calls[0][1].code).toBe('23505')
  })

  it('gives up on a write that has failed too many times', async () => {
    // A queue that can never drain is a queue where nothing after this ever
    // sends, so the corpse has to be buried eventually.
    const rec = await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 't1' } })
    expect(rec).toBeTruthy()

    const { builder } = fakeClient(() => {
      throw new TypeError('Failed to fetch')
    })
    for (let i = 0; i < MAX_ATTEMPTS; i++) await q.drain(builder)

    expect(await q.pending()).toHaveLength(0)
  })

  it('only drains the household it was asked about', async () => {
    await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 'a' }, householdId: 'h1' })
    await q.enqueue({ table: 'tasks', op: 'insert', values: { id: 'b' }, householdId: 'h2' })

    const { builder, calls } = fakeClient()
    await q.drain(builder, { householdId: 'h1' })

    expect(calls).toHaveLength(1)
    expect(calls[0].values).toEqual({ id: 'a' })
    expect(await q.pending('h2')).toHaveLength(1)
  })

  it('survives an empty queue', async () => {
    const { builder, calls } = fakeClient()
    expect(await q.drain(builder)).toMatchObject({ sent: 0, dropped: 0, remaining: 0 })
    expect(calls).toHaveLength(0)
  })
})
