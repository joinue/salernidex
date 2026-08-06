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
  weekCount,
  weekProgress,
  calendarMatrix,
  bestDayOfWeek,
  trend,
  totals,
  hasRule,
  cadenceLabel,
  goalLabel,
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

describe('rrule scheduling', () => {
  it('hasRule / isWeekly respect an rrule', () => {
    const h = { rrule: { freq: 'daily', interval: 2, anchor: '2026-01-01' }, weekly_target: 3 }
    expect(hasRule(h)).toBe(true)
    // rrule is a per-occurrence (daily-style) schedule, never weekly — even if a
    // stale weekly_target lingers, the rule wins.
    expect(isWeekly(h)).toBe(false)
    expect(hasRule({ active_days: [] })).toBe(false)
  })

  it('every-2-days rule schedules only matching dates', () => {
    const h = { rrule: { freq: 'daily', interval: 2, anchor: '2026-01-01' } }
    expect(isScheduled(h, new Date(2026, 0, 1))).toBe(true)
    expect(isScheduled(h, new Date(2026, 0, 2))).toBe(false)
    expect(isScheduled(h, new Date(2026, 0, 3))).toBe(true)
    expect(isScheduled(h, new Date(2026, 0, 5))).toBe(true)
  })

  it('monthly-by-date rule schedules only that day', () => {
    const h = { rrule: { freq: 'monthly', monthday: 20, anchor: '2026-01-20' } }
    expect(isScheduled(h, new Date(2026, 0, 20))).toBe(true)
    expect(isScheduled(h, new Date(2026, 0, 21))).toBe(false)
    expect(isScheduled(h, new Date(2026, 1, 20))).toBe(true) // next month
  })

  it('streak counts consecutive occurrences; off-days are transparent', () => {
    const today = new Date(2026, 0, 5) // occurrence day (Jan 1/3/5)
    const h = {
      id: 'h',
      polarity: 'build',
      target: 1,
      track_streak: true,
      created_at: '2026-01-01',
      rrule: { freq: 'daily', interval: 2, anchor: '2026-01-01' },
    }
    // idx 0=Jan5, 2=Jan3, 4=Jan1 are the occurrences (1,3 are off-days)
    expect(currentStreak(h, map('h', [1, 0, 1, 0, 1], today), today)).toBe(3)
    // today (Jan5) unmet rides on grace → Jan3 + Jan1 still count
    expect(currentStreak(h, map('h', [0, 0, 1, 0, 1], today), today)).toBe(2)
    // a missed past occurrence (Jan3) breaks it back to Jan5 only
    expect(currentStreak(h, map('h', [1, 0, 0, 0, 1], today), today)).toBe(1)
  })

  it('cadenceLabel describes the rule', () => {
    expect(cadenceLabel({ rrule: { freq: 'daily', interval: 3, anchor: '2026-01-01' } })).toBe(
      'Every 3 days',
    )
    expect(cadenceLabel({ rrule: { freq: 'monthly', monthday: 20, anchor: '2026-01-20' } })).toBe(
      'Monthly on the 20th',
    )
  })

  it('goalLabel drops the per-day wording for rule-based habits', () => {
    const rule = { freq: 'monthly', monthday: 20, anchor: '2026-01-20' }
    // daily habits keep the "/day"/"a day" phrasing...
    expect(goalLabel({ polarity: 'build', measure: 'count', target: 8, unit: 'glasses' })).toBe(
      'Goal ≥ 8 glasses/day',
    )
    expect(goalLabel({ polarity: 'build', measure: 'binary' })).toBe('Once a day')
    // ...rule-based ones let cadenceLabel carry the frequency instead.
    expect(
      goalLabel({ polarity: 'build', measure: 'count', target: 8, unit: 'glasses', rrule: rule }),
    ).toBe('Goal ≥ 8 glasses')
    expect(goalLabel({ polarity: 'limit', measure: 'count', target: 2, rrule: rule })).toBe(
      'Limit ≤ 2',
    )
    expect(goalLabel({ polarity: 'build', measure: 'binary', rrule: rule })).toBe('Each time')
    expect(goalLabel({ polarity: 'limit', measure: 'binary', rrule: rule })).toBe('Avoid')
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

describe('long streaks', () => {
  const today = new Date(2026, 0, 5)
  const created = new Date(2024, 0, 5) // ~2 years back
  const h = {
    id: 'h',
    polarity: 'build',
    target: 1,
    track_streak: true,
    active_days: [],
    created_at: toISODate(created),
  }

  it('is not truncated by a fixed scan window', () => {
    // 500 straight days — longer than the year the walk used to scan, so this
    // used to report 366.
    const m = map('h', Array(500).fill(1), today)
    expect(currentStreak(h, m, today)).toBe(500)
    expect(bestStreak(h, m, today)).toBe(500)
  })

  it('weekly streaks past two years survive too', () => {
    // 110 weeks — past the 104-week cap the weekly walk used to stop at.
    const weekly = { ...h, weekly_target: 1, created_at: toISODate(new Date(2023, 0, 5)) }
    const values = Array(770)
      .fill(0)
      .map((_, i) => (i % 7 === 0 ? 1 : 0)) // one success every Monday
    expect(currentStreak(weekly, map('h', values, today), today)).toBe(110)
  })

  it('but never runs past the habit’s own lifetime', () => {
    const weekly = { ...h, weekly_target: 1 } // created_at is 2 years back
    const values = Array(770)
      .fill(0)
      .map((_, i) => (i % 7 === 0 ? 1 : 0))
    expect(currentStreak(weekly, map('h', values, today), today)).toBe(105)
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

describe('weekCount', () => {
  const sunday = new Date(2026, 0, 11) // Sun; the detail page counts Sun-start weeks
  const monday = new Date(2026, 0, 5)

  it('ignores off-days, so every surface counts the same week the same way', () => {
    // A Mon/Wed/Fri habit logged on Tuesday: not a scheduled day, not a success.
    const h = {
      id: 'h',
      polarity: 'build',
      target: 1,
      active_days: [1, 3, 5],
      created_at: '2025-01-01',
    }
    const m = map('h', [0, 0, 0, 0, 0, 1, 1], sunday) // Tue (offset 5) + Mon (6)
    expect(weekCount(h, m, monday, sunday)).toBe(1) // Mon counts, Tue doesn't
  })

  it('a limit habit’s unlogged days are clean days, here as everywhere else', () => {
    // The by-week chart used to count only *logged* clean days for limits,
    // disagreeing with the heatmap and the all-time % on the same screen.
    const h = { id: 'h', polarity: 'limit', target: 0, active_days: [], created_at: '2025-01-01' }
    const m = map('h', [0, 0, 0, 0, 0, 0, 0], sunday) // nothing logged all week
    expect(weekCount(h, m, monday, sunday)).toBe(7)
    expect(windowStats(h, m, sunday, 7).successDays).toBe(7)
  })

  it('does not count days past today', () => {
    const h = { id: 'h', polarity: 'build', target: 1, active_days: [], created_at: '2025-01-01' }
    const wed = new Date(2026, 0, 7)
    const m = map('h', [1, 1, 1], wed) // Mon/Tue/Wed
    expect(weekCount(h, m, monday, wed)).toBe(3)
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

  it('trend keeps one shape across every branch', () => {
    const vals = Array.from({ length: 28 }, (_, i) => (i < 14 ? 1 : 0))
    const shape = (t) => {
      // recent/prior are always the compared metric; the raw windows sit beside
      // them — so a caller never has to know which branch produced the result.
      expect(typeof t.recent).toBe('number')
      expect(typeof t.prior).toBe('number')
      expect(typeof t.young).toBe('boolean')
      expect(t.recentStats).toHaveProperty('scheduledDays')
      expect(t.priorStats).toHaveProperty('scheduledDays')
    }
    shape(trend(h, map('h', vals, today), today, 14)) // build
    shape(trend({ ...h, polarity: 'track' }, map('h', vals, today), today, 14)) // track
    const young = trend({ ...h, created_at: '2026-01-29' }, map('h', vals, today), today, 14)
    expect(young.young).toBe(true) // too little prior history
    shape(young)
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

describe('goalLabel pluralization', () => {
  const h = (over) => ({ measure: 'count', polarity: 'goal', ...over })

  it('singularizes a unit when the target is 1', () => {
    expect(goalLabel(h({ target: 1, unit: 'sessions' }))).toBe('Goal ≥ 1 session/day')
    expect(goalLabel(h({ target: 1, unit: 'glasses' }))).toBe('Goal ≥ 1 glass/day')
    expect(goalLabel(h({ target: 1, unit: 'entries' }))).toBe('Goal ≥ 1 entry/day')
  })

  it('leaves the plural alone for any other target', () => {
    expect(goalLabel(h({ target: 8, unit: 'glasses' }))).toBe('Goal ≥ 8 glasses/day')
    expect(goalLabel(h({ target: 0, unit: 'sessions' }))).toBe('Goal ≥ 0 sessions/day')
  })

  it('applies to limits too', () => {
    expect(goalLabel(h({ polarity: 'limit', target: 1, unit: 'drinks' }))).toBe(
      'Limit ≤ 1 drink/day',
    )
  })

  it('handles units with no plural form', () => {
    expect(goalLabel(h({ target: 1, unit: 'min' }))).toBe('Goal ≥ 1 min/day')
  })
})
