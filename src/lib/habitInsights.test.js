import { describe, it, expect } from 'vitest'
import { entryMap, toISODate } from './habits'
import { correlate, topInsights, pearson, MIN_OVERLAP } from './habitInsights'

const today = new Date(2026, 5, 14) // fixed Sunday-agnostic anchor
const isoAgo = (i) =>
  toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i))

// Build an entry map from per-habit value functions. `val(i)` returns the value
// logged i days ago, or null/undefined for no entry that day.
const buildMap = (specs, days) => {
  const entries = []
  for (const { id, val } of specs) {
    for (let i = 0; i < days; i++) {
      const v = val(i)
      if (v != null) entries.push({ habit_id: id, date: isoAgo(i), value: v })
    }
  }
  return entryMap(entries)
}

// A habit whose window is bounded to exactly `days` via created_at.
const binary = (id, name, days) => ({
  id,
  name,
  polarity: 'build',
  measure: 'binary',
  target: 1,
  active_days: [],
  created_at: isoAgo(days - 1),
})
const tracker = (id, name, days, unit) => ({
  id,
  name,
  polarity: 'track',
  measure: 'count',
  active_days: [],
  unit,
  created_at: isoAgo(days - 1),
})

describe('pearson', () => {
  it('is null without variance', () => {
    expect(pearson([1, 1, 1], [1, 0, 1])).toBeNull()
  })
  it('detects perfect correlation', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1)
  })
})

describe('correlate — binary × binary', () => {
  it('perfect positive: both hit the same days', () => {
    const a = binary('a', 'Workout', 30)
    const b = binary('b', 'Meditate', 30)
    // hit on even days, nothing (= miss) on odd days
    const map = buildMap(
      [
        { id: 'a', val: (i) => (i % 2 === 0 ? 1 : null) },
        { id: 'b', val: (i) => (i % 2 === 0 ? 1 : null) },
      ],
      30,
    )
    const r = correlate(a, b, map, today, 60)
    expect(r.coeff).toBeCloseTo(1)
    expect(r.band).toBe('strong')
    expect(r.phrase).toContain('more often')
  })

  it('perfect negative: opposite days', () => {
    const a = binary('a', 'Workout', 30)
    const b = binary('b', 'Junk food', 30)
    const map = buildMap(
      [
        { id: 'a', val: (i) => (i % 2 === 0 ? 1 : null) },
        { id: 'b', val: (i) => (i % 2 === 1 ? 1 : null) },
      ],
      30,
    )
    const r = correlate(a, b, map, today, 60)
    expect(r.coeff).toBeCloseTo(-1)
    expect(r.phrase).toContain('less often')
  })

  it('returns null below the overlap threshold', () => {
    const days = MIN_OVERLAP - 3
    const a = binary('a', 'Workout', days)
    const b = binary('b', 'Meditate', days)
    const map = buildMap(
      [
        { id: 'a', val: (i) => (i % 2 === 0 ? 1 : null) },
        { id: 'b', val: (i) => (i % 2 === 0 ? 1 : null) },
      ],
      days,
    )
    expect(correlate(a, b, map, today, 60)).toBeNull()
  })

  it('returns null when one habit never varies', () => {
    const a = binary('a', 'Workout', 30)
    const b = binary('b', 'Meditate', 30)
    const map = buildMap(
      [
        { id: 'a', val: () => 1 }, // always hit → no variance
        { id: 'b', val: (i) => (i % 2 === 0 ? 1 : null) },
      ],
      30,
    )
    expect(correlate(a, b, map, today, 60)).toBeNull()
  })
})

describe('correlate — binary × tracker', () => {
  it('reports the mean difference on condition days', () => {
    const gym = binary('gym', 'Gym', 30)
    const mood = tracker('mood', 'Mood', 30)
    const map = buildMap(
      [
        { id: 'gym', val: (i) => (i % 2 === 0 ? 1 : null) },
        { id: 'mood', val: (i) => (i % 2 === 0 ? 5 : 3) }, // logged every day
      ],
      30,
    )
    const r = correlate(gym, mood, map, today, 60)
    expect(r.primaryId).toBe('mood') // the tracker is the outcome
    expect(r.phrase).toContain('Mood +2')
    expect(r.phrase).toContain('stick to Gym')
  })
})

describe('correlate — tracker × tracker', () => {
  it('describes the direction of the relationship', () => {
    const a = tracker('a', 'Sleep', 30)
    const b = tracker('b', 'Energy', 30)
    const map = buildMap(
      [
        { id: 'a', val: (i) => i },
        { id: 'b', val: (i) => i }, // move together
      ],
      30,
    )
    const r = correlate(a, b, map, today, 60)
    expect(r.coeff).toBeCloseTo(1)
    expect(r.phrase).toContain('rise and fall together')
  })
})

describe('topInsights', () => {
  const days = 30
  const habits = [
    binary('a', 'Workout', days),
    binary('b', 'Meditate', days),
    binary('c', 'Read', days),
    { ...binary('z', 'Old habit', days), archived_at: '2026-01-01' },
  ]
  // a≡b (perfect), c partially aligned with a (moderate), z archived.
  const map = buildMap(
    [
      { id: 'a', val: (i) => (i % 2 === 0 ? 1 : null) },
      { id: 'b', val: (i) => (i % 2 === 0 ? 1 : null) },
      { id: 'c', val: (i) => (i % 4 === 0 ? 1 : null) },
      { id: 'z', val: (i) => (i % 2 === 0 ? 1 : null) },
    ],
    days,
  )

  it('sorts strongest first and respects max', () => {
    const top = topInsights(habits, map, today, { max: 1 })
    expect(top).toHaveLength(1)
    expect(Math.abs(top[0].coeff)).toBeCloseTo(1) // the a≡b pair
  })

  it('excludes archived habits and returns the full set when max is Infinity', () => {
    const all = topInsights(habits, map, today, { max: Infinity })
    const ids = all.flatMap((r) => [r.aId, r.bId])
    expect(ids).not.toContain('z')
    // sorted descending by |coeff|
    for (let i = 1; i < all.length; i++) {
      expect(Math.abs(all[i - 1].coeff)).toBeGreaterThanOrEqual(Math.abs(all[i].coeff))
    }
  })
})
