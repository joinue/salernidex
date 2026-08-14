import { describe, it, expect } from 'vitest'
import { localNow, isValidTimeZone, DEFAULT_TZ } from './localTime.ts'

// Every case here is stated as an absolute instant (a UTC timestamp) rendered
// into a zone, so none of it depends on where the test runs.
const at = (iso: string) => new Date(iso)

describe('localNow', () => {
  it('renders the local date and wall clock for a zone', () => {
    // 15:30 UTC → 08:30 in Phoenix (UTC-7, no DST)
    expect(localNow('America/Phoenix', at('2026-06-12T15:30:00Z'))).toEqual({
      date: '2026-06-12',
      time: '08:30',
    })
  })

  it('puts two members on different days at the same instant', () => {
    // 03:00 UTC: still the 11th in Phoenix, already the 12th in Berlin. This is
    // the case that made a single TZ_NAME wrong — "today" is not one thing.
    const instant = at('2026-06-12T03:00:00Z')
    expect(localNow('America/Phoenix', instant).date).toBe('2026-06-11')
    expect(localNow('Europe/Berlin', instant).date).toBe('2026-06-12')
  })

  it('renders midnight as 00:00, not 24:00', () => {
    // The hour the date also changes: a 24:00 here would read as minute 1440 and
    // misplace every digest and reminder window comparison.
    const midnight = localNow('America/Phoenix', at('2026-06-12T07:00:00Z'))
    expect(midnight).toEqual({ date: '2026-06-12', time: '00:00' })
  })

  describe('DST — untested territory while everything was Phoenix', () => {
    it('follows spring-forward in a zone that observes it', () => {
      // 2026-03-08, US DST begins at 02:00 local. 11:00 UTC is 06:00 EST the day
      // before the change and 07:00 EDT after it.
      expect(localNow('America/New_York', at('2026-03-07T11:00:00Z')).time).toBe('06:00')
      expect(localNow('America/New_York', at('2026-03-09T11:00:00Z')).time).toBe('07:00')
    })

    it('leaves Phoenix alone across the same boundary', () => {
      expect(localNow('America/Phoenix', at('2026-03-07T11:00:00Z')).time).toBe('04:00')
      expect(localNow('America/Phoenix', at('2026-03-09T11:00:00Z')).time).toBe('04:00')
    })

    it('follows fall-back too', () => {
      // 2026-11-01, US DST ends at 02:00 local.
      expect(localNow('America/New_York', at('2026-10-31T11:00:00Z')).time).toBe('07:00')
      expect(localNow('America/New_York', at('2026-11-02T11:00:00Z')).time).toBe('06:00')
    })

    it('handles a southern-hemisphere zone, where the shift runs the other way', () => {
      expect(localNow('Australia/Sydney', at('2026-06-12T03:00:00Z')).time).toBe('13:00') // AEST
      expect(localNow('Australia/Sydney', at('2026-12-12T03:00:00Z')).time).toBe('14:00') // AEDT
    })
  })

  describe('bad input falls back instead of throwing', () => {
    // One malformed member row must not abort the sweep for everyone else —
    // the function loops all members inside a single request.
    it.each([null, undefined, '', 'Mars/Olympus_Mons', 42, {}])('%p → the default zone', (bad) => {
      const instant = at('2026-06-12T15:30:00Z')
      expect(localNow(bad, instant)).toEqual(localNow(DEFAULT_TZ, instant))
    })
  })
})

describe('isValidTimeZone', () => {
  it('accepts real IANA names', () => {
    for (const tz of ['America/Phoenix', 'Europe/Berlin', 'Asia/Tokyo', 'UTC']) {
      expect(isValidTimeZone(tz)).toBe(true)
    }
  })

  it('rejects anything this runtime cannot resolve', () => {
    for (const bad of ['', 'Not/AZone', 'Mars/Olympus_Mons', null, undefined, 7]) {
      expect(isValidTimeZone(bad)).toBe(false)
    }
  })

  // Legacy aliases resolve, so they pass — the check is "can this be rendered",
  // which is the only thing localNow needs to guarantee.
  //
  // Worth knowing rather than blocking: the bare abbreviations are FIXED-offset
  // zones in the tz database, so a member stored as 'EST' never springs forward.
  // Nothing writes them — the client sends
  // Intl.DateTimeFormat().resolvedOptions().timeZone, which is always a proper
  // Area/Location name — so this documents the hazard rather than guarding it.
  it('also accepts legacy aliases, which do not all observe DST', () => {
    for (const tz of ['EST', 'US/Pacific', 'GMT']) expect(isValidTimeZone(tz)).toBe(true)
    const summer = at('2026-07-01T16:00:00Z')
    expect(localNow('EST', summer).time).toBe('11:00') // fixed UTC-5 all year
    expect(localNow('America/New_York', summer).time).toBe('12:00') // EDT in July
  })
})
