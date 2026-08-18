// Anti-drift guard: runs the server port and the client original side by side
// and asserts they arrive at the same number.
//
// badge.ts is a hand port of badgeCount(buildAttention(...)) in
// src/lib/attention.js, because the Edge Function can't import the browser app's
// modules. This is the port most worth pinning: the badge is a bare number on a
// home screen with no list under it to contradict it, so a silent drift doesn't
// look like a bug — it looks like the app lying about how much you have to do.
// Vitest only: Deno never loads test files, so the deployed bundle is unaffected.

import { describe, it, expect } from 'vitest'
import { buildAttention, badgeCount as clientBadge } from '../../../src/lib/attention.js'
import { isoDateIn } from '../../../src/lib/tasks.js'
import { badgeCount } from './badge.ts'

const PREFS = { tasks: true, lists: true, nudges: true, dates: true, dates_lead_days: 7 }
const base = {
  people: [],
  tasks: [],
  reminders: [],
  interactions: [],
  keyDates: [],
  lists: [],
  areas: [],
}

const area = (over: Record<string, unknown> = {}) => ({
  id: 'a-work',
  name: 'Work',
  show_on_today: true,
  ...over,
})

const reminder = (over: Record<string, unknown> = {}) => ({
  id: 'r',
  title: 'Bins go out',
  assignee: 'anyone',
  is_reminder: true,
  due_kind: 'on',
  parent_id: null,
  completed_at: null,
  ...over,
})

const task = (over: Record<string, unknown> = {}) => ({
  id: 't',
  title: 'A',
  assignee: 'anyone',
  priority: 0,
  due_kind: 'on',
  parent_id: null,
  completed_at: null,
  ...over,
})

// Both sides get the same day and the same rows; the client works off the real
// "today", so fixtures are built relative to it.
const both = (data: Record<string, any>, prefs = PREFS, snoozes: any[] = []) => {
  const full = { ...base, ...data }
  // The shape difference that matters: useData hands the client `tasks` and
  // `reminders` already separated, while the Edge Function selects one table and
  // gets both kinds of row in `tasks`. Feeding each side its real shape is the
  // whole point — pass reminders to the server inside tasks, as Postgres would.
  const serverTasks = [...(full.tasks || []), ...(full.reminders || [])]
  const today = isoDateIn(0)
  const hidden = new Set(snoozes.filter((s) => s.until === null).map((s) => s.target_key))
  return {
    client: clientBadge(buildAttention(full, prefs, snoozes, 'm1')),
    server: badgeCount(
      {
        tasks: serverTasks,
        lists: full.lists,
        people: full.people,
        keyDates: full.keyDates,
        areas: full.areas,
      },
      'm1',
      today,
      prefs,
      hidden,
    ),
  }
}

const agree = (data: Record<string, any>, expected: number, prefs = PREFS, snoozes: any[] = []) => {
  const { client, server } = both(data, prefs, snoozes)
  expect(server).toBe(client)
  expect(server).toBe(expected)
}

describe('badgeCount (server port)', () => {
  it('counts what is due today and overdue, and nothing further out', () => {
    agree(
      {
        tasks: [
          task({ id: 'late', due_date: isoDateIn(-3) }),
          task({ id: 'now', due_date: isoDateIn(0) }),
          task({ id: 'tomorrow', due_date: isoDateIn(1) }),
          task({ id: 'undated', due_date: null }),
        ],
      },
      2,
    )
  })

  it('leaves a deadline with slack out of the count', () => {
    // Both of these reach the in-app Today list ('anytime'), and neither belongs
    // in the number — that distinction is the whole point of the bucket.
    agree(
      {
        tasks: [
          task({ id: 'slack', due_date: isoDateIn(4), due_kind: 'by' }),
          task({ id: 'blown', due_date: isoDateIn(-1), due_kind: 'by' }),
          task({ id: 'due', due_date: isoDateIn(0), due_kind: 'by' }),
        ],
      },
      2, // 'blown' is overdue and 'due' is today; only 'slack' is excluded
    )
  })

  it('skips completed work, headings, projects, and deferred tasks', () => {
    agree(
      {
        tasks: [
          task({ id: 'done', due_date: isoDateIn(0), completed_at: '2026-01-01T00:00:00Z' }),
          task({ id: 'heading', due_date: isoDateIn(0), is_heading: true }),
          task({ id: 'project', due_date: isoDateIn(0), is_project: true }),
          task({ id: 'deferred', due_date: isoDateIn(0), start_date: isoDateIn(2) }),
          task({ id: 'real', due_date: isoDateIn(0) }),
        ],
      },
      1,
    )
  })

  it("counts a project's dated step but not a plain task's subtask", () => {
    agree(
      {
        tasks: [
          task({ id: 'proj', is_project: true, assignee: 'm1', due_date: null }),
          task({ id: 'step', parent_id: 'proj', due_date: isoDateIn(0), assignee: null }),
          task({ id: 'undated-step', parent_id: 'proj', due_date: null, assignee: null }),
          task({ id: 'plain', due_date: null }),
          task({ id: 'checklist', parent_id: 'plain', due_date: isoDateIn(0), assignee: null }),
        ],
      },
      1,
    )
  })

  it("skips another member's task and their project's steps", () => {
    agree(
      {
        tasks: [
          task({ id: 'mine', due_date: isoDateIn(0), assignee: 'm1' }),
          task({ id: 'hers', due_date: isoDateIn(0), assignee: 'm2' }),
          task({ id: 'open', due_date: isoDateIn(0), assignee: 'anyone' }),
          task({ id: 'unassigned', due_date: isoDateIn(0), assignee: null }),
          task({ id: 'herproj', is_project: true, assignee: 'm2', due_date: null }),
          task({ id: 'herstep', parent_id: 'herproj', due_date: isoDateIn(0), assignee: null }),
        ],
      },
      3,
    )
  })

  it('counts a list once its due date lands', () => {
    agree(
      {
        lists: [
          { id: 'l1', name: 'Groceries', due_date: isoDateIn(-1) },
          { id: 'l2', name: 'Hardware', due_date: isoDateIn(0) },
          { id: 'l3', name: 'Later', due_date: isoDateIn(3) },
          { id: 'l4', name: 'No date', due_date: null },
        ],
      },
      2,
    )
  })

  it('counts a birthday only on the day, not through its lead window', () => {
    const today = isoDateIn(0)
    const soon = isoDateIn(3)
    agree(
      {
        people: [
          { id: 'p1', name: 'Ana', birthday: `1990-${today.slice(5)}` },
          { id: 'p2', name: 'Ben', birthday: `1988-${soon.slice(5)}` },
          { id: 'p3', name: 'Gone', birthday: `1990-${today.slice(5)}`, deleted_at: today },
        ],
      },
      1,
    )
  })

  it('counts a key date on the day', () => {
    const today = isoDateIn(0)
    agree(
      {
        people: [{ id: 'p1', name: 'Ana', birthday: null }],
        keyDates: [
          {
            id: 'k1',
            person_id: 'p1',
            label: 'Anniversary',
            date: `2015-${today.slice(5)}`,
            annual: true,
          },
          { id: 'k2', person_id: 'p1', label: 'Closing', date: isoDateIn(2), annual: false },
        ],
      },
      1,
    )
  })

  it('drops what the member has dismissed', () => {
    agree(
      {
        tasks: [
          task({ id: 'a', due_date: isoDateIn(0) }),
          task({ id: 'b', due_date: isoDateIn(0) }),
        ],
      },
      1,
      PREFS,
      [{ member_id: 'm1', target_key: 'task:a', until: null }],
    )
  })

  it('honors the per-kind notification prefs', () => {
    const data = {
      tasks: [task({ id: 'a', due_date: isoDateIn(0) })],
      lists: [{ id: 'l1', name: 'Groceries', due_date: isoDateIn(0) }],
    }
    agree(data, 1, { ...PREFS, lists: false })
    agree(data, 1, { ...PREFS, tasks: false })
    agree(data, 0, { ...PREFS, tasks: false, lists: false })
  })

  it('never counts a relationship check-in — the soft tier stays out', () => {
    // The person is well past their cadence, so this DOES appear in Today; the
    // badge must still read zero, or it would never come back down.
    const data = {
      people: [{ id: 'p1', name: 'Ana', keep_in_touch_days: 30, birthday: null }],
      interactions: [{ person_id: 'p1', occurred_at: '2020-01-01T00:00:00Z' }],
    }
    const attention = buildAttention({ ...base, ...data }, PREFS, [], 'm1')
    expect(attention.some((i: any) => i.kind === 'nudge')).toBe(true) // fixture is doing its job
    agree(data, 0)
  })
})

describe('parity with the client attention engine', () => {
  it('agrees across a mixed household on an ordinary day', () => {
    const today = isoDateIn(0)
    const tasks: any[] = []
    for (let d = -2; d <= 3; d++) {
      tasks.push(task({ id: `on-${d}`, due_date: isoDateIn(d) }))
      tasks.push(task({ id: `by-${d}`, due_date: isoDateIn(d), due_kind: 'by' }))
      tasks.push(task({ id: `hers-${d}`, due_date: isoDateIn(d), assignee: 'm2' }))
    }
    tasks.push(task({ id: 'proj', is_project: true, assignee: 'm1', due_date: null }))
    tasks.push(task({ id: 'step', parent_id: 'proj', due_date: today, assignee: null }))

    const data = {
      tasks,
      lists: [
        { id: 'l1', name: 'Groceries', due_date: isoDateIn(-1) },
        { id: 'l2', name: 'Later', due_date: isoDateIn(5) },
      ],
      people: [
        { id: 'p1', name: 'Ana', birthday: `1990-${today.slice(5)}`, keep_in_touch_days: 30 },
        { id: 'p2', name: 'Ben', birthday: `1988-${isoDateIn(4).slice(5)}` },
      ],
      interactions: [{ person_id: 'p1', occurred_at: '2020-01-01T00:00:00Z' }],
      keyDates: [
        {
          id: 'k1',
          person_id: 'p2',
          label: 'Anniversary',
          date: `2015-${today.slice(5)}`,
          annual: true,
        },
      ],
    }

    const { client, server } = both(data)
    expect(server).toBe(client)
    expect(server).toBeGreaterThan(0) // guard against both sides being empty
  })

  // Habits ARE attention items on the client (they feed Today and carry
  // snoozes), but they ride the 'soft' tier and must never reach the number.
  // The server's badge port has no habit input at all, so this is the case
  // where the two could quietly diverge: if habits were ever promoted out of
  // 'soft', the client count would climb every morning and the server's would
  // not. Pinning it here means that change has to be deliberate.
  it('never lets a habit due today move the number', () => {
    const prefs = { ...PREFS, habits: true }
    const data = {
      tasks: [task({ id: 'now', due_date: isoDateIn(0), assignee: 'm1' })],
      habits: [
        { id: 'h1', name: 'Run', polarity: 'build', measure: 'binary', active_days: [] },
        {
          id: 'h2',
          name: 'Water',
          polarity: 'build',
          measure: 'count',
          target: 8,
          active_days: [],
        },
      ],
      habitEntries: [],
    }
    // One task due today, two habits outstanding: the badge is still 1.
    agree(data, 1, prefs)

    // And the habits really are in the engine — otherwise this test would pass
    // for the wrong reason (nothing generated, nothing counted).
    const items = buildAttention({ ...base, ...data }, prefs, [], 'm1')
    expect(items.filter((i) => i.kind === 'habit').map((i) => i.key)).toEqual([
      'habit:h1',
      'habit:h2',
    ])
    expect(items.filter((i) => i.kind === 'habit').every((i) => i.urgency === 'soft')).toBe(true)
  })
})

// Reminders (0039) share the tasks table, which is exactly why they need pinning
// here: before this, the server counted them in the tasks block while the client
// counted them under dates, so the two agreed on the number by luck and
// disagreed on everything else.
describe('badgeCount — reminders', () => {
  it('counts one dated today, once, on both sides', () => {
    agree({ reminders: [reminder({ due_date: isoDateIn(0) })] }, 1)
  })

  it('counts an unacknowledged one from the past — nothing is late, but it still wants saying', () => {
    agree({ reminders: [reminder({ due_date: isoDateIn(-2) })] }, 1)
  })

  it('drops it once acknowledged, and never counts one still ahead', () => {
    agree(
      {
        reminders: [
          reminder({ id: 'done', due_date: isoDateIn(0), completed_at: '2026-01-01T00:00:00Z' }),
          reminder({ id: 'later', due_date: isoDateIn(3) }),
        ],
      },
      0,
    )
  })

  // The bug this whole port exists to fix. The app writes `reminder:<id>` when
  // you dismiss one; the server used to look for `task:<id>`, so a dismissed
  // reminder kept badging the home screen and kept pushing.
  it('goes quiet on both sides when you dismiss it', () => {
    agree({ reminders: [reminder({ id: 'r1', due_date: isoDateIn(0) })] }, 0, PREFS, [
      { target_key: 'reminder:r1', until: null, member_id: 'm1' },
    ])
  })

  it('rides the dates toggle, not the tasks one', () => {
    const data = { reminders: [reminder({ due_date: isoDateIn(0) })] }
    agree(data, 1, { ...PREFS, tasks: false })
    agree(data, 0, { ...PREFS, dates: false })
  })

  it('stays out of the count when it belongs to someone else', () => {
    agree({ reminders: [reminder({ due_date: isoDateIn(0), assignee: 'm2' })] }, 0)
  })
})

// ── show_on_today (0040) ─────────────────────────────────────────────────────
// The badge is the surface this rule matters most on: it is the one thing you
// can see with the app closed, so an area you silenced that still badges the
// icon is the loudest possible version of the bug. Both sides must drop the
// same rows — and, just as important, must NOT drop the contact-derived ones.
describe('badgeCount — areas switched off Today', () => {
  it('drops a due task in a muted area, on both sides', () => {
    agree(
      {
        tasks: [task({ id: 'work', due_date: isoDateIn(0), area_id: 'a-work' })],
        areas: [area({ show_on_today: false })],
      },
      0,
    )
  })

  it('keeps the same task once the area is back on', () => {
    agree(
      {
        tasks: [task({ id: 'work', due_date: isoDateIn(0), area_id: 'a-work' })],
        areas: [area()],
      },
      1,
    )
  })

  it('counts unfiled work regardless — it has no area to be silenced by', () => {
    agree(
      {
        tasks: [
          task({ id: 'work', due_date: isoDateIn(0), area_id: 'a-work' }),
          task({ id: 'loose', due_date: isoDateIn(0) }),
        ],
        areas: [area({ show_on_today: false })],
      },
      1,
    )
  })

  it('drops a muted list and a muted reminder too', () => {
    agree(
      {
        lists: [{ id: 'l', name: 'Work errands', due_date: isoDateIn(0), area_id: 'a-work' }],
        reminders: [reminder({ id: 'r', due_date: isoDateIn(0), area_id: 'a-work' })],
        areas: [area({ show_on_today: false })],
      },
      0,
    )
  })

  // The rule reaching contacts would be a real bug: silencing Work must never
  // silence a birthday. Contacts have no area at all, which is what makes this
  // true by construction rather than by a special case.
  it('never silences a birthday — contacts have no area', () => {
    const today = isoDateIn(0)
    agree(
      {
        people: [{ id: 'p1', name: 'Nina', birthday: `1990-${today.slice(5)}` }],
        areas: [area({ show_on_today: false })],
      },
      1,
    )
  })

  // Compatibility: a pre-0040 row, or a project where the migration has not run
  // yet, must badge exactly as it did before.
  it('is a no-op when no areas exist at all', () => {
    agree({ tasks: [task({ id: 'a', due_date: isoDateIn(0), area_id: 'a-work' })] }, 1)
  })
})
