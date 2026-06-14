// Cross-habit insights: associations between habits the eye can't see —
// "Workout 38% more often on Meditate days", "Mood +0.8 on gym days".
//
// Read-only over the same habit_entries the app already loads; no schema, no
// persistence. Built on the per-day primitives in habits.js. Everything is
// phrased as association ("tends to", "on days you") — never cause.
//
// The trust comes from gating, not from coefficients: a pair surfaces only with
// enough overlapping days and a strong enough relationship. Below the bar we
// stay silent rather than invent a horoscope.

import { isScheduled, isSkipped, valueOn, isSuccess, toISODate } from './habits'

export const MIN_OVERLAP = 14 // shared days both habits were active & logged
export const MIN_COEFF = 0.3 // |r| below this is noise
const STRONG = 0.5 // band threshold

const key = (habit, iso) => `${habit.id}|${iso}`
const startOf = (habit) => (habit.created_at ? String(habit.created_at).slice(0, 10) : null)

// One habit reduced to a daily numeric series over the window, keyed by iso.
// build/limit → 1 (success) / 0 (miss). track → the raw logged value.
// Off-days, rest days, and pre-creation days are omitted (not zero) so they
// never get paired; trackers only contribute on days actually logged.
function seriesMap(habit, map, today, days) {
  const startISO = startOf(habit)
  const isTrack = habit.polarity === 'track'
  const out = new Map()
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  for (let i = 0; i < days; i++) {
    const iso = toISODate(d)
    if (startISO && iso < startISO) break
    if (isScheduled(habit, d) && !isSkipped(habit, iso, map)) {
      if (isTrack) {
        if (map.has(key(habit, iso))) out.set(iso, valueOn(habit, iso, map))
      } else {
        out.set(iso, isSuccess(habit, valueOn(habit, iso, map)) ? 1 : 0)
      }
    }
    d.setDate(d.getDate() - 1)
  }
  return out
}

// Pearson correlation; null if either side has no variance (e.g. an all-success
// habit can't correlate with anything).
export function pearson(xs, ys) {
  const n = xs.length
  if (n < 2) return null
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
    sxx += xs[i] * xs[i]
    syy += ys[i] * ys[i]
    sxy += xs[i] * ys[i]
  }
  const cov = sxy - (sx * sy) / n
  const vx = sxx - (sx * sx) / n
  const vy = syy - (sy * sy) / n
  if (vx <= 0 || vy <= 0) return null
  return cov / Math.sqrt(vx * vy)
}

// P(outcome=1 | cond=1) − P(outcome=1 | cond=0), both 0/1 arrays. null if a
// condition arm is empty.
function lift(outcome, cond) {
  let c1 = 0,
    o1 = 0,
    c0 = 0,
    o0 = 0
  for (let i = 0; i < cond.length; i++) {
    if (cond[i] === 1) {
      c1++
      if (outcome[i] === 1) o1++
    } else {
      c0++
      if (outcome[i] === 1) o0++
    }
  }
  if (!c1 || !c0) return null
  return o1 / c1 - o0 / c0
}

const round1 = (x) => Math.round(x * 10) / 10
const signed = (x) => (x >= 0 ? `+${round1(x)}` : `−${round1(Math.abs(x))}`)

// "on days you stick to X" reads correctly whether X is a build habit (a
// success means you did it) or a limit habit (a success means you stayed under)
// — avoiding the ambiguity of "on X days" for limits like "Drink Less".
const condClause = (habit) => `on days you stick to ${habit.name}`

// Correlate two habits over `days`. Returns a display-ready insight or null if
// it doesn't clear the overlap/strength bars.
export function correlate(a, b, map, today = new Date(), days = 60) {
  const sa = seriesMap(a, map, today, days)
  const sb = seriesMap(b, map, today, days)
  const xs = []
  const ys = []
  for (const [iso, va] of sa) {
    if (sb.has(iso)) {
      xs.push(va)
      ys.push(sb.get(iso))
    }
  }
  const n = xs.length
  if (n < MIN_OVERLAP) return null
  const coeff = pearson(xs, ys)
  if (coeff == null || Math.abs(coeff) < MIN_COEFF) return null

  const aBin = a.polarity !== 'track'
  const bBin = b.polarity !== 'track'
  const band = Math.abs(coeff) >= STRONG ? 'strong' : 'moderate'
  let phrase
  let primaryId

  if (aBin && bBin) {
    // Both binary: present whichever direction reads stronger.
    const lab = lift(xs, ys) // a | b
    const lba = lift(ys, xs) // b | a
    const aFirst = Math.abs(lab ?? 0) >= Math.abs(lba ?? 0)
    const outcome = aFirst ? a : b
    const cond = aFirst ? b : a
    const l = aFirst ? lab : lba
    if (l == null) return null
    const pct = Math.abs(Math.round(l * 100))
    if (pct < 1) return null
    primaryId = outcome.id
    phrase = `${outcome.name} ${pct}% ${l >= 0 ? 'more' : 'less'} often ${condClause(cond)}`
  } else if (aBin || bBin) {
    // One binary (the day-type), one tracker (the outcome).
    const tracker = aBin ? b : a
    const binary = aBin ? a : b
    const tv = aBin ? ys : xs
    const bv = aBin ? xs : ys
    let sum1 = 0,
      n1 = 0,
      sum0 = 0,
      n0 = 0
    for (let i = 0; i < bv.length; i++) {
      if (bv[i] === 1) {
        sum1 += tv[i]
        n1++
      } else {
        sum0 += tv[i]
        n0++
      }
    }
    if (!n1 || !n0) return null
    const delta = sum1 / n1 - sum0 / n0
    if (Math.abs(delta) < 0.05) return null
    const unit = tracker.unit ? ` ${tracker.unit}` : ''
    primaryId = tracker.id
    phrase = `${tracker.name} ${signed(delta)}${unit} ${condClause(binary)}`
  } else {
    // Two trackers: just the direction of the relationship.
    primaryId = a.id
    phrase =
      coeff >= 0
        ? `${a.name} and ${b.name} rise and fall together`
        : `${a.name} runs higher when ${b.name} runs lower`
  }

  return { aId: a.id, bId: b.id, primaryId, coeff, n, band, phrase }
}

// All qualifying pairwise insights among active habits, strongest first.
// `max` caps the list (the carousel passes a small number; the page passes
// Infinity for the full set).
export function topInsights(habits, map, today = new Date(), { days = 60, max = 3 } = {}) {
  const active = (habits || []).filter((h) => !h.archived_at)
  const out = []
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const r = correlate(active[i], active[j], map, today, days)
      if (r) out.push(r)
    }
  }
  out.sort((x, y) => Math.abs(y.coeff) - Math.abs(x.coeff))
  return Number.isFinite(max) ? out.slice(0, max) : out
}
