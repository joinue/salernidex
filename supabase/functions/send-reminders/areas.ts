// Server port of the show_on_today rule in src/lib/areas.js — the switch that
// keeps a whole part of your life off the phone.
//
// Why this matters more than the rest of the areas feature: filtering pages is
// something you do while looking at the app. This is what happens when you
// AREN'T looking at it. An area with show_on_today off must not reach the
// digest, the individual pings, or the app-icon badge — otherwise "Work is off
// today" means the Tasks page is quiet while the phone still buzzes at 8am on a
// Saturday, which is worse than not having the switch.
//
// Why a port and not an import: this is a bundled Deno Edge Function and can't
// reach the browser app's module graph — same reason badge.ts, deadlines.ts and
// habitSchedule.ts exist. It gets the same treatment: its own file, its own
// parity test (areas.parity.test.ts) running both implementations side by side.
//
// The rule is deliberately a set membership test and nothing more. It is
// implemented three times (here, src/lib/areas.js, and eventually Swift), and
// docs/next-steps.md §3 records habitSchedule.ts as the hand port that silently
// drifted until a limit habit's weekly count came out wrong. Anything with a
// schedule in it would be that failure waiting to happen — which is why
// "show Work on weekdays only" was declined outright rather than deferred.

export type AreaRow = { id: string; show_on_today?: boolean | null }

// The areas switched off, as a set of ids. Computed once per sweep rather than
// per row — the sweep loops every member over every task.
export function mutedAreaIds(areas: AreaRow[] = []): Set<string> {
  const out = new Set<string>()
  // `=== false`, not falsy: a row written before 0040 has the column undefined
  // and must still reach Today. For a rule whose job is to HIDE things, the safe
  // direction when unsure is to do nothing.
  for (const a of areas) if (a && a.show_on_today === false) out.add(a.id)
  return out
}

// Does this row reach Today? Unfiled rows always do — a thing with no area
// can't be the thing you silenced.
export function reachesToday(row: { area_id?: string | null } | null, muted: Set<string>): boolean {
  if (!muted || muted.size === 0) return true
  const id = row?.area_id
  return !id || !muted.has(id)
}
