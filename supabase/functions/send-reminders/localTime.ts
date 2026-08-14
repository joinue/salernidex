// What "now" means for one member.
//
// This was a single module-level constant (`TZ_NAME`) applied to everyone, which
// made the whole system Arizona-only: `localNow()` decides what *today* is —
// which tasks are due, which dates fire, how habits are scheduled, what
// `sent_for` gets stamped — and what *now* is, for the digest window and every
// per-habit and per-list reminder time. For a member in New York an 8:00 AM
// digest arrived at 11:00 AM and the day rolled over at 3:00 AM their time.
//
// It lives in its own file, pure and injectable, so the DST cases can be tested
// without a clock: Phoenix was chosen originally *because* Arizona has no DST,
// so the moment zones become per-member, spring-forward is untested territory.

export const DEFAULT_TZ = 'America/Phoenix'

export type LocalNow = { date: string; time: string }

// Is this a timezone this runtime actually knows? A member row could carry
// anything — a stale IANA name, a typo, an empty string from an old client.
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Local calendar date + wall-clock time in `timeZone`, as 'yyyy-mm-dd' and
// 'HH:mm'. An unusable zone falls back to DEFAULT_TZ rather than throwing: the
// sweep loops every member in one request, so one bad row must not be able to
// take down everyone else's reminders for the rest of the day.
//
// hourCycle 'h23' is deliberate. The obvious `hour12: false` renders midnight as
// "24:00" under en-GB in some ICU versions, which would put `minutesOf` at 1440
// and quietly misplace every window comparison for the one hour of the day when
// the date is also changing.
export function localNow(timeZone: unknown, at: Date = new Date()): LocalNow {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TZ
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at) // yyyy-mm-dd
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
  return { date, time }
}
