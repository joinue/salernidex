// The morning digest's copy, as a pure function so it can be tested without a
// Deno runtime, a push subscription, or a database.
//
// It has to hold two different kinds of thing apart:
//   • what's due today (or overdue) — the count the digest has always reported
//   • deadlines with days still on the clock — a heads-up, never part of that
//     count. "3 things today" must not quietly include something due Friday.
//
// On a day with nothing actually due, the deadlines carry the digest on their
// own, and the title changes to say so rather than claiming a busy day.

export type DigestItem = { body: string }
export type DigestAhead = { title: string }
export type DigestCopy = { title: string; body: string }

const LEAD = 3 // how many items the body names before collapsing to "+N more"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function digestCopy(items: DigestItem[], ahead: DigestAhead[]): DigestCopy | null {
  if (!items.length && !ahead.length) return null

  // Nothing due — the deadlines are the whole digest, so they get the headline
  // and the body reads as a plain list. Prefixing "Coming up:" here would just
  // repeat the title back.
  if (!items.length) {
    const lead = ahead
      .slice(0, LEAD)
      .map((t) => t.title)
      .join(' · ')
    return {
      title: `${plural(ahead.length, 'thing')} coming up`,
      body: lead + (ahead.length > LEAD ? ` · +${ahead.length - LEAD} more` : ''),
    }
  }

  const lead = items
    .slice(0, LEAD)
    .map((i) => i.body)
    .join(' · ')
  const more = items.length > LEAD ? ` · +${items.length - LEAD} more` : ''
  // Deadlines ride along as a trailing clause, soonest named. They're context
  // for the day, not part of it.
  const soon = ahead.length
    ? ` · Coming up: ${ahead[0].title}` + (ahead.length > 1 ? ` +${ahead.length - 1}` : '')
    : ''

  return { title: `${plural(items.length, 'thing')} today`, body: lead + more + soon }
}
