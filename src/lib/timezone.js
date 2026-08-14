// The member's timezone, read from the browser and stored on their membership
// row (migration 0036). The reminder sweep uses it to decide what "today" means
// for them and when their morning digest fires.
//
// No picker, deliberately. The browser already knows the answer, and a settings
// question whose only correct response is "wherever I am" is a worse experience
// than getting it right silently.
import { supabase } from './supabase'
import { demoMode } from './demo'

// This browser's IANA zone ('America/Phoenix'), or null when the runtime won't
// say. Always a proper Area/Location name — never one of the fixed-offset
// abbreviations like 'EST', which don't observe DST.
export function browserTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isPlausibleZone(tz) ? tz : null
  } catch {
    return null
  }
}

// Shape check matching the column's constraint in 0036. It can't know the IANA
// set, but it rejects the empty string and anything that would fail the check
// constraint — which would otherwise turn a harmless preference write into a
// failed signup.
export function isPlausibleZone(tz) {
  return typeof tz === 'string' && /^[A-Za-z][A-Za-z0-9+_/-]*$/.test(tz)
}

// Write this browser's zone onto a membership row. Best-effort by design: a
// member whose zone doesn't stick still gets reminders, just on the default
// clock, so this must never be the thing that fails a signup.
//
// Called once, at signup. A member who later moves keeps the zone they joined
// with — the alternative, re-stamping on every load, makes two devices in
// different places fight over one row, which is worse than being one zone
// stale. Changing it belongs in Settings, as an explicit choice.
export async function stampMemberTimezone(memberId) {
  if (!memberId || demoMode || !supabase) return null
  const tz = browserTimeZone()
  if (!tz) return null
  const { error } = await supabase
    .from('household_members')
    .update({ timezone: tz })
    .eq('id', memberId)
  // Swallowed on purpose — an older project without the 0036 column returns a
  // "column does not exist" error here, and that must not block anyone's setup.
  return error ? null : tz
}
