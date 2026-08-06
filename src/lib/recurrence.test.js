import { describe, it, expect } from 'vitest'
import {
  nextOccurrence,
  describeRecurrence,
  advanceAfterCompletion,
  firstOccurrence,
  isAfterCompletion,
} from './recurrence'

// Reference weekdays used below (verified): 2026-06-12 Fri, 2026-06-15 Mon,
// 2026-01-31 Sat, 2026-02-28 Sat, 2026-03-01 Sun, 2026-11-30 Mon.

describe('nextOccurrence — daily', () => {
  it('every day, exclusive, returns the next day', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1, anchor: '2026-06-12' }, '2026-06-12')).toBe(
      '2026-06-13',
    )
  })
  it('every day, inclusive, returns the same day', () => {
    expect(
      nextOccurrence({ freq: 'daily', interval: 1, anchor: '2026-06-12' }, '2026-06-12', {
        inclusive: true,
      }),
    ).toBe('2026-06-12')
  })
  it('every 3 days is phased off the anchor', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 3, anchor: '2026-06-12' }, '2026-06-12')).toBe(
      '2026-06-15',
    )
    expect(nextOccurrence({ freq: 'daily', interval: 3, anchor: '2026-06-12' }, '2026-06-13')).toBe(
      '2026-06-15',
    )
  })
})

describe('nextOccurrence — weekly', () => {
  it('every Monday from a Friday', () => {
    expect(
      nextOccurrence(
        { freq: 'weekly', interval: 1, weekdays: [1], anchor: '2026-06-12' },
        '2026-06-12',
      ),
    ).toBe('2026-06-15')
  })
  it('multiple weekdays returns the nearest', () => {
    // Mon + Thu (1,4); from Fri 6-12 → Mon 6-15
    expect(
      nextOccurrence(
        { freq: 'weekly', interval: 1, weekdays: [1, 4], anchor: '2026-06-12' },
        '2026-06-12',
      ),
    ).toBe('2026-06-15')
  })
  it('every 2 weeks stays phased to the anchor week', () => {
    // anchor Mon 6-15; the following Monday (6-22) is an off week, 6-29 is on
    const rule = { freq: 'weekly', interval: 2, weekdays: [1], anchor: '2026-06-15' }
    expect(nextOccurrence(rule, '2026-06-15')).toBe('2026-06-29')
  })
})

describe('nextOccurrence — monthly', () => {
  it('by month-day', () => {
    expect(
      nextOccurrence(
        { freq: 'monthly', interval: 1, monthday: 1, anchor: '2026-06-12' },
        '2026-06-12',
      ),
    ).toBe('2026-07-01')
  })
  it('clamps the 31st to a short month', () => {
    // every month on the 31st; Sept has 30 days → falls on the 30th
    expect(
      nextOccurrence(
        { freq: 'monthly', interval: 1, monthday: 31, anchor: '2026-08-31' },
        '2026-09-01',
      ),
    ).toBe('2026-09-30')
  })
  it('by nth weekday (first Monday)', () => {
    expect(
      nextOccurrence(
        { freq: 'monthly', interval: 1, setpos: 1, weekday: 1, anchor: '2026-06-12' },
        '2026-06-12',
      ),
    ).toBe('2026-07-06')
  })
  it('by last weekday (last Monday of Nov 2026 = 11-30)', () => {
    expect(
      nextOccurrence(
        { freq: 'monthly', interval: 1, setpos: -1, weekday: 1, anchor: '2026-11-01' },
        '2026-11-02',
      ),
    ).toBe('2026-11-30')
  })
})

describe('nextOccurrence — yearly', () => {
  it('returns the same-year date when still ahead', () => {
    expect(
      nextOccurrence(
        { freq: 'yearly', interval: 1, month: 11, monthday: 25, anchor: '2026-01-01' },
        '2026-06-12',
      ),
    ).toBe('2026-12-25')
  })
  it('rolls to next year when passed', () => {
    expect(
      nextOccurrence(
        { freq: 'yearly', interval: 1, month: 0, monthday: 1, anchor: '2026-01-01' },
        '2026-06-12',
      ),
    ).toBe('2027-01-01')
  })
})

describe('nextOccurrence — until (end date)', () => {
  const rule = (until) => ({
    freq: 'weekly',
    interval: 1,
    weekdays: [1],
    anchor: '2026-06-15',
    until,
  })
  it('returns an occurrence on or before until', () => {
    expect(nextOccurrence(rule('2026-06-30'), '2026-06-15')).toBe('2026-06-22')
  })
  it('treats until as inclusive', () => {
    // next Monday after 6-15 is 6-22; until exactly 6-22 still allows it
    expect(nextOccurrence(rule('2026-06-22'), '2026-06-15')).toBe('2026-06-22')
  })
  it('returns null once the series has ended', () => {
    expect(nextOccurrence(rule('2026-06-20'), '2026-06-15')).toBeNull()
  })
})

describe('nextOccurrence — exdates (skips)', () => {
  it('skips an excluded occurrence and returns the next', () => {
    const rule = {
      freq: 'weekly',
      interval: 1,
      weekdays: [1],
      anchor: '2026-06-15',
      exdates: ['2026-06-22'],
    }
    // from 6-15 exclusive: 6-22 is skipped → 6-29
    expect(nextOccurrence(rule, '2026-06-15')).toBe('2026-06-29')
  })
  it('an inclusive match that is excluded rolls to the next', () => {
    const rule = { freq: 'daily', interval: 1, anchor: '2026-06-12', exdates: ['2026-06-12'] }
    expect(nextOccurrence(rule, '2026-06-12', { inclusive: true })).toBe('2026-06-13')
  })
})

describe('nextOccurrence — safety', () => {
  it('returns null (not a hang) for an empty rule', () => {
    expect(nextOccurrence(null, '2026-06-12')).toBeNull()
    expect(nextOccurrence({}, '2026-06-12')).toBeNull()
  })
  it('a pathological interval resolves fast and stays bounded', () => {
    const t0 = Date.now()
    // interval 99999: matches() never lines up daily within the capped horizon → null,
    // but it must return quickly rather than spinning ~37M iterations.
    const res = nextOccurrence(
      { freq: 'daily', interval: 99999, anchor: '2026-06-12' },
      '2027-01-01',
    )
    expect(Date.now() - t0).toBeLessThan(500)
    expect(res === null || typeof res === 'string').toBe(true)
  })
})

describe('monthly — multiple days of the month', () => {
  const rule = { freq: 'monthly', interval: 1, monthdays: [1, 15], anchor: '2026-06-01' }
  it('lands on each requested day', () => {
    expect(nextOccurrence(rule, '2026-06-01')).toBe('2026-06-15')
    expect(nextOccurrence(rule, '2026-06-15')).toBe('2026-07-01')
  })
  it('clamps each day into a short month independently', () => {
    const r = { freq: 'monthly', interval: 1, monthdays: [15, 31], anchor: '2026-01-15' }
    expect(nextOccurrence(r, '2026-02-15')).toBe('2026-02-28') // the 31st clamps
    expect(nextOccurrence(r, '2026-02-28')).toBe('2026-03-15') // and the 15th still lands
  })
  it('still reads the legacy scalar monthday', () => {
    const legacy = { freq: 'monthly', interval: 1, monthday: 20, anchor: '2026-06-01' }
    expect(nextOccurrence(legacy, '2026-06-01')).toBe('2026-06-20')
  })
})

describe('count — ending after N occurrences', () => {
  const rule = { freq: 'daily', interval: 1, anchor: '2026-06-01', count: 3 }
  it('stops once the Nth occurrence has passed', () => {
    expect(nextOccurrence(rule, '2026-06-01')).toBe('2026-06-02')
    expect(nextOccurrence(rule, '2026-06-02')).toBe('2026-06-03')
    expect(nextOccurrence(rule, '2026-06-03')).toBe(null) // 1st, 2nd, 3rd — done
  })
  it('a skipped occurrence still spends its slot (RFC 5545)', () => {
    const skipped = { ...rule, exdates: ['2026-06-02'] }
    expect(nextOccurrence(skipped, '2026-06-01')).toBe('2026-06-03')
    expect(nextOccurrence(skipped, '2026-06-03')).toBe(null)
  })
  it('whichever of count/until bites first wins', () => {
    const both = { ...rule, count: 10, until: '2026-06-02' }
    expect(nextOccurrence(both, '2026-06-02')).toBe(null)
  })
})

describe('after-completion rules — the other clock', () => {
  const rule = { freq: 'daily', interval: 5, mode: 'after_completion', anchor: '2026-06-01' }
  it('is flagged as after-completion', () => {
    expect(isAfterCompletion(rule)).toBe(true)
    expect(isAfterCompletion({ freq: 'daily' })).toBe(false)
  })
  it('has no calendar grid, so nextOccurrence declines it', () => {
    expect(nextOccurrence(rule, '2026-06-01')).toBe(null)
  })
  it('measures the interval from the day it was done, however late that is', () => {
    expect(advanceAfterCompletion(rule, '2026-06-01')).toBe('2026-06-06')
    // Ten days late: the next one moves with you rather than arriving instantly.
    expect(advanceAfterCompletion(rule, '2026-06-11')).toBe('2026-06-16')
  })
  it('counts weeks, months and years in their own units', () => {
    const wk = { freq: 'weekly', interval: 2, mode: 'after_completion' }
    expect(advanceAfterCompletion(wk, '2026-06-01')).toBe('2026-06-15')
    const mo = { freq: 'monthly', interval: 3, mode: 'after_completion' }
    expect(advanceAfterCompletion(mo, '2026-06-01')).toBe('2026-09-01')
    const yr = { freq: 'yearly', interval: 1, mode: 'after_completion' }
    expect(advanceAfterCompletion(yr, '2026-06-01')).toBe('2027-06-01')
  })
  it('clamps a month roll-forward onto a short month', () => {
    const mo = { freq: 'monthly', interval: 1, mode: 'after_completion' }
    expect(advanceAfterCompletion(mo, '2026-01-31')).toBe('2026-02-28')
  })
  it('ends when the roll-forward would pass `until`', () => {
    expect(advanceAfterCompletion({ ...rule, until: '2026-06-04' }, '2026-06-01')).toBe(null)
  })
  it('starts today rather than waiting for a grid date', () => {
    expect(firstOccurrence(rule, '2026-06-01')).toBe('2026-06-01')
    // A calendar rule still takes its next matching date.
    const cal = { freq: 'weekly', interval: 1, weekdays: [1], anchor: '2026-06-01' }
    expect(firstOccurrence(cal, '2026-06-12')).toBe('2026-06-15')
  })
})

describe('describeRecurrence', () => {
  it('labels common rules', () => {
    expect(describeRecurrence(null)).toBe('One-off')
    expect(describeRecurrence({ freq: 'daily', interval: 1 })).toBe('Every day')
    expect(describeRecurrence({ freq: 'weekly', interval: 1, weekdays: [1] })).toBe('Every Mon')
    expect(describeRecurrence({ freq: 'weekly', interval: 2, weekdays: [2] })).toBe(
      'Every 2 weeks on Tue',
    )
    expect(describeRecurrence({ freq: 'monthly', interval: 1, monthday: 20 })).toBe(
      'Monthly on the 20th',
    )
  })
  it('pluralizes a multi-year interval', () => {
    expect(describeRecurrence({ freq: 'yearly', interval: 1, month: 4, monthday: 12 })).toBe(
      'Every year on May 12',
    )
    expect(describeRecurrence({ freq: 'yearly', interval: 2, month: 4, monthday: 12 })).toBe(
      'Every 2 years on May 12',
    )
  })
  it('appends an end date when until is set', () => {
    expect(
      describeRecurrence({ freq: 'weekly', interval: 1, weekdays: [1], until: '2026-08-31' }),
    ).toBe('Every Mon, until Aug 31, 2026')
  })
  it('names Mon–Fri as "Every weekday"', () => {
    expect(describeRecurrence({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] })).toBe(
      'Every weekday',
    )
    // Not a weekday set, and not every week — spell it out.
    expect(describeRecurrence({ freq: 'weekly', interval: 2, weekdays: [1, 2, 3, 4, 5] })).toBe(
      'Every 2 weeks on Mon, Tue, Wed, Thu, Fri',
    )
  })
  it('lists multiple days of the month', () => {
    expect(describeRecurrence({ freq: 'monthly', interval: 1, monthdays: [1, 15] })).toBe(
      'Monthly on the 1st and 15th',
    )
    expect(describeRecurrence({ freq: 'monthly', interval: 1, monthdays: [1, 10, 20] })).toBe(
      'Monthly on the 1st, 10th and 20th',
    )
  })
  it('names the clock an after-completion rule runs on', () => {
    expect(describeRecurrence({ freq: 'daily', interval: 5, mode: 'after_completion' })).toBe(
      'Every 5 days after it’s done',
    )
    expect(describeRecurrence({ freq: 'monthly', interval: 1, mode: 'after_completion' })).toBe(
      'Every month after it’s done',
    )
  })
  it('reports a count bound instead of an end date', () => {
    expect(describeRecurrence({ freq: 'daily', interval: 1, count: 10 })).toBe(
      'Every day, 10 times',
    )
  })
})
