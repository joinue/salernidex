import { describe, it, expect } from 'vitest'
import {
  isScheduled,
  isWeekly,
  isSuccess,
  toISODate,
  entryMap,
  currentStreak,
  bestStreak,
  windowStats,
  weekProgress,
  calendarMatrix,
  bestDayOfWeek,
  trend,
  totals,
} from './habits'

// Build entries spanning back from a fixed "today" so tests are deterministic.
const map = (habitId, values, today) => {
  // values: array where index 0 = today, 1 = yesterday, ...; value is the number
  const entries = values.map((value, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    return { habit_id: habitId, date: toISODate(d), value }
  })
  return entryMap(entries)
}

// Like map(), but each item is { v, skip } so rest days can be expressed.
const mapEx = (habitId, items, today) => {
  const entries = items.map((it, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    return { habit_id: habitId, date: toISODate(d), value: it.v ?? 0, skipped: !!it.skip }
  })
  return entryMap(entries)
}

describe('isScheduled', () => {
  it('empty active_days means every day', () => {
    expect(isScheduled({ active_days: [] }, new Date(2026, 0, 5))).toBe(true)
    expect(isScheduled({ active_days: undefined }, new Date(2026, 0, 4))).toBe(true)
  })
  it('respects specific weekdays (0=Sun..6=Sat)', () => {
    const h = { active_days: [1, 3, 5] } // Mon/Wed/Fri
    expect(new Date(2026, 0, 5).getDay()).toBe(1) // sanity: Jan 5 2026 is Monday
    expect(isScheduled(h, new Date(2026, 0, 5))).toBe(true) // Mon
    expect(isScheduled(h, new Date(2026, 0, 6))).toBe(false) // Tue
    expect(isScheduled(h, new Date(2026, 0, 3))).toBe(false) // Sat
  })
})

describe('isSuccess', () => {
  it('build: value >= target (default 1)', () => {
    expect(isSuccess({ polarity: 'build', target: 3 }, 3)).toBe(true)
    expect(isSuccess({ polarity: 'build', target: 3 }, 2)).toBe(false)
    expect(isSuccess({ polarity: 'build' }, 1)).toBe(true)
    expect(isSuccess({ polarity: 'build' }, 0)).toBe(false)
  })
  it('limit: value <= target (default 0 = abstinence)', () => {
    expect(isSuccess({ polarity: 'limit', target: 2 }, 2)).toBe(true)
    expect(isSuccess({ polarity: 'limit', target: 2 }, 3)).toBe(false)
    expect(isSuccess({ polarity: 'limit' }, 0)).toBe(true)
    expect(isSuccess({ polarity: 'limit' }, 1)).toBe(false)
  })
  it('track has no success', () => {
    expect(isSuccess({ polarity: 'track' }, 5)).toBe(null)
  })
})

describe('currentStreak', () => {
  const today = new Date(2026, 0, 5) // Monday

  it('counts consecutive build successes, today-grace lets an unmet today ride', () => {
    const h = { id: 'h', polarity: 'build', target: 1, track_streak: true, active_days: [] }
    // today unmet (0), prior 3 days met
    expect(currentStreak(h, map('h', [0, 1, 1, 1, 0], today), today)).toBe(3)
    // today met too
    expect(currentStreak(h, map('h', [1, 1, 1, 1, 0], today), today)).toBe(4)
  })

  it('limit habit: unlogged days are successes, a violation breaks it', () => {
    // created 3 days ago → streak is bounded to the habit's lifetime, not ∞
    const h = {
      id: 'h',
      polarity: 'limit',
      target: 2,
      track_streak: true,
      active_days: [],
      created_at: toISODate(new Date(2026, 0, 2)),
    }
    // all unlogged (0) → every day under the limit, capped at the 4 days lived
    expect(currentStreak(h, map('h', [0, 0, 0, 0], today), today)).toBe(4)
    // 3 drinks two days ago breaks it; today + yesterday still count
    expect(currentStreak(h, map('h', [0, 0, 3, 0], today), today)).toBe(2)
  })

  it('skips off-days so a Mon/Wed/Fri streak survives the weekend', () => {
    const h = { id: 'h', polarity: 'build', target: 1, track_streak: true, active_days: [1, 3, 5] }
    // today Mon=success, Sat/Sun off, Fri (3 days ago)=success, Wed(prior) unmet
    expect(currentStreak(h, map('h', [1, 0, 0, 1, 0, 0], today), today)).toBe(2)
  })

  it('is 0 for track habits or when streaks are disabled', () => {
    const track = { id: 'h', polarity: 'track', track_streak: true, active_days: [] }
    const off = { id: 'h', polarity: 'build', target: 1, track_streak: false, active_days: [] }
    expect(currentStreak(track, map('h', [5, 5, 5], today), today)).toBe(0)
    expect(currentStreak(off, map('h', [1, 1, 1], today), today)).toBe(0)
  })
})

describe('bestStreak', () => {
  it('finds the longest past run, independent of the current one', () => {
    const today = new Date(2026, 0, 10)
    const h = { id: 'h', polarity: 'build', target: 1, track_streak: true, active_days: [] }
    // today..back: 1,1,0,1,1,1,1,0 → best run of 4, current of 2
    const m = map('h', [1, 1, 0, 1, 1, 1, 1, 0], today)
    expect(bestStreak(h, m, today)).toBe(4)
    expect(currentStreak(h, m, today)).toBe(2)
  })
})

describe('skip / rest days', () => {
  const today = new Date(2026, 0, 5)
  const h = { id: 'h', polarity: 'build', target: 1, track_streak: true, active_days: [] }

  it('a skipped day is transparent — it neither counts nor breaks the streak', () => {
    // today, yesterday done; 2 days ago SKIPPED (value 0); 3 days ago done
    const m = mapEx('h', [{ v: 1 }, { v: 1 }, { v: 0, skip: true }, { v: 1 }], today)
    expect(currentStreak(h, m, today)).toBe(3)
    // without the skip flag the 0 two days ago would break it at 2
    const m2 = mapEx('h', [{ v: 1 }, { v: 1 }, { v: 0 }, { v: 1 }], today)
    expect(currentStreak(h, m2, today)).toBe(2)
  })

  it('skipped days drop out of the 30-day scheduled count', () => {
    const m = mapEx('h', [{ v: 1 }, { v: 0, skip: true }, { v: 1 }], today)
    expect(windowStats(h, m, today, 3).scheduledDays).toBe(2)
  })
})

describe('weekly frequency', () => {
  const friday = new Date(2026, 0, 9) // Fri; week starts Mon Jan 5
  const h = {
    id: 'h',
    polarity: 'build',
    target: 1,
    track_streak: true,
    weekly_target: 3,
    active_days: [],
    created_at: '2025-01-01',
  }

  it('is scheduled every day (any day is fair game)', () => {
    expect(isWeekly(h)).toBe(true)
    expect(isScheduled(h, new Date(2026, 0, 6))).toBe(true) // Tue
    expect(isScheduled(h, new Date(2026, 0, 4))).toBe(true) // Sun
  })

  it('weekProgress counts this week toward the target', () => {
    // success Mon/Tue/Wed of this week (offsets 4/3/2 from Fri)
    const m = mapEx('h', [{ v: 0 }, { v: 0 }, { v: 1 }, { v: 1 }, { v: 1 }], friday)
    expect(weekProgress(h, m, friday)).toEqual({ count: 3, target: 3 })
  })

  it('streak counts consecutive weeks that hit target', () => {
    // this week: 3 hits (offsets 2,3,4) · last week: 3 hits (offsets 7,8,9)
    const m = mapEx(
      'h',
      [
        { v: 0 }, // Fri (today)
        { v: 0 }, // Thu
        { v: 1 }, // Wed
        { v: 1 }, // Tue
        { v: 1 }, // Mon — this week = 3
        { v: 0 }, // Sun
        { v: 0 }, // Sat
        { v: 1 }, // Fri
        { v: 1 }, // Thu
        { v: 1 }, // Wed — last week = 3
        { v: 0 },
        { v: 0 },
      ],
      friday,
    )
    expect(currentStreak(h, m, friday)).toBe(2)
  })

  it('a fully-rested week (vacation) is transparent to the weekly streak', () => {
    // this week met (offsets 2,3,4) · last week ALL rest days (5–11) · week
    // before met (12,13,14). The rest week shouldn't break the streak → 2.
    const items = Array.from({ length: 19 }, () => ({ v: 0 }))
    items[2] = items[3] = items[4] = { v: 1 } // this week: 3 hits
    for (let i = 5; i <= 11; i++) items[i] = { v: 0, skip: true } // last week: paused
    items[12] = items[13] = items[14] = { v: 1 } // week before: 3 hits
    const m = mapEx('h', items, friday)
    expect(currentStreak(h, m, friday)).toBe(2)
  })

  it('an unmet current week does not break a prior streak', () => {
    // this week only 1 hit so far (not met), last week met → streak = 1, not 0
    const m = mapEx(
      'h',
      [
        { v: 1 }, // Fri today (1 hit this week)
        { v: 0 },
        { v: 0 },
        { v: 0 },
        { v: 0 },
        { v: 0 },
        { v: 0 },
        { v: 1 }, // last week 3 hits
        { v: 1 },
        { v: 1 },
        { v: 0 },
        { v: 0 },
      ],
      friday,
    )
    expect(currentStreak(h, m, friday)).toBe(1)
  })
})

describe('calendarMatrix', () => {
  const today = new Date(2026, 0, 5) // Monday
  const h = { id: 'h', polarity: 'build', target: 1, track_streak: true, active_days: [] }

  it('is weeks×7, current week rightmost, future days flagged', () => {
    const { columns, monthLabels } = calendarMatrix(h, map('h', [1], today), today, 13)
    expect(columns).toHaveLength(13)
    expect(columns.every((c) => c.length === 7)).toBe(true)
    expect(monthLabels).toHaveLength(13)
    const lastWeek = columns[12]
    // today is Monday → Tue–Sat of this week are in the future
    expect(lastWeek[1].status).toBe('hit') // Mon (today), logged 1
    expect(lastWeek[2].status).toBe('future') // Tue
  })
})

describe('bestDayOfWeek / trend / totals', () => {
  const today = new Date(2026, 0, 31) // plenty of history room
  const h = { id: 'h', polarity: 'build', target: 1, track_streak: true, active_days: [] }

  it('bestDayOfWeek finds the strongest weekday', () => {
    // succeed only on Mondays (offsets that land on Mondays from Sat Jan 31)
    const vals = Array.from({ length: 28 }, (_, i) => {
      const d = new Date(2026, 0, 31 - i)
      return d.getDay() === 1 ? 1 : 0
    })
    const best = bestDayOfWeek(h, map('h', vals, today), today, 28)
    expect(best.dow).toBe(1) // Monday
    expect(best.rate).toBe(1)
  })

  it('trend reports improvement when the recent window beats the prior one', () => {
    // last 14 days all done, the 14 before all missed
    const vals = Array.from({ length: 28 }, (_, i) => (i < 14 ? 1 : 0))
    expect(trend(h, map('h', vals, today), today, 14).dir).toBe('up')
  })

  it('totals counts successes since creation', () => {
    const hc = { ...h, created_at: '2025-12-01' }
    const t = totals(hc, map('h', [1, 1, 0, 1], today), today, 400)
    expect(t.successes).toBe(3)
  })
})

describe('windowStats', () => {
  it('summarizes scheduled days, successes and average', () => {
    const today = new Date(2026, 0, 5)
    const h = { id: 'h', polarity: 'build', target: 2, track_streak: true, active_days: [] }
    const s = windowStats(h, map('h', [2, 4, 0], today), today, 3)
    expect(s).toEqual({ scheduledDays: 3, successDays: 2, total: 6, average: 2 })
  })
})
