// SALERNIDEX — send-reminders Edge Function (Phase 6b — code-complete,
// deploys at Supabase go-live; untested against a live project until then).
//
// Invoked by pg_cron every 15 minutes (see the Phase 6 section of
// supabase/schema.sql). Server-side port of src/lib/attention.js: recomputes
// attention per member, applies prefs + snoozes, dedupes via
// notification_log, and web-pushes to each member's devices.
//
// Sending policy (docs/records/phase6-reminders.md):
//   - individual pushes only for DAY-OF dates and tasks due/overdue today
//   - a TIMED task (due_time set) fires its individual push at that time, not in
//     the morning — until then it only rides the digest as a heads-up
//   - one morning digest per member at their digest_time (±15 min window)
//   - a 'by' DEADLINE inside the week rides that digest and nothing else (see
//     deadlines.ts) — it's a heads-up while there's still room, not a due alert
//   - other lead-time heads-ups stay in-app only (no double-pinging)
//
// Deploy:
//   supabase functions deploy send-reminders
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:marc@joinue.com TZ_NAME=America/Phoenix

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { habitDueToday } from './habitSchedule.ts'
import { deadlinesAhead } from './deadlines.ts'
import { digestCopy } from './digest.ts'
import { isAuthorized } from './auth.ts'
import { badgeCount } from './badge.ts'
import { mutedAreaIds, reachesToday } from './areas.ts'
import { scopeFor } from './scope.ts'
import { localNow } from './localTime.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role: bypasses RLS, never ships to clients
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:marc@joinue.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

// Fallback zone only. The real one is per member (household_members.timezone,
// migration 0036); this covers a row written before that column existed, or one
// carrying a zone this runtime can't resolve. Keeping TZ_NAME as the fallback is
// what makes applying 0036 a no-op for delivery times.
const TZ = Deno.env.get('TZ_NAME') ?? 'America/Phoenix'

const DEFAULT_PREFS = {
  tasks: true,
  lists: true,
  nudges: true,
  dates: true,
  fyi: false,
  dates_lead_days: 7,
  digest_time: '08:00',
}

type Item = {
  kind: 'task' | 'list' | 'nudge' | 'date' | 'habit' | 'reminder'
  targetKey: string
  title: string
  body: string
  url: string
  ready?: boolean // false = in digest but not yet eligible for an individual ping (timed task)
  priority?: number // task flag (0..3); orders the digest lead
}

// ---- local-time helpers -----------------------------------------------
// localNow lives in localTime.ts now: it takes the member's zone rather than a
// process-wide one, and its DST behavior is tested there.

const monthDay = (iso: string) => iso?.slice(5) // 'MM-DD'

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Compact local time for notification copy: '15:00' → '3 PM', '09:30' → '9:30 AM'.
function fmtTime(t: string) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`
}

// ---- attention rules (server port of src/lib/attention.js) -------------
function dueTasksToday(tasks: any[], memberId: string, today: string, time: string): Item[] {
  const nowMin = minutesOf(time)
  return (
    tasks
      .filter((t) => !t.parent_id && !t.completed_at && t.due_date && t.due_date <= today)
      // Reminders live in this table too (0039) and are NOT tasks. Left in, they
      // pushed as one: titled "Overdue" — for a thing that was never late and
      // had nothing to do — and deep-linked to /#/tasks, a page they don't
      // appear on. See reminderPings() below.
      .filter((t) => !t.is_reminder)
      // deferred tasks (start_date in the future) stay parked until their day
      .filter((t) => !t.start_date || t.start_date <= today)
      // Yours, or open to anyone. This matches assignedToMe() in
      // src/lib/attention.js, which the Today view and the badges now use too.
      //
      // Deliberately NOT wired to the client's `todayScope` preference: setting
      // Today to "Everyone's" widens a dashboard you chose to look at, whereas
      // a push is an interruption. Waking someone at 8am for a task that isn't
      // theirs is a different bargain, so pushes stay personal either way.
      .filter((t) => !t.assignee || t.assignee === 'anyone' || t.assignee === memberId)
      .map((t) => {
        const timed = t.due_date === today && t.due_time
        return {
          kind: 'task' as const,
          targetKey: `task:${t.id}`,
          title: t.due_date < today ? 'Overdue' : 'Due today',
          body: timed ? `${t.title} · ${fmtTime(t.due_time)}` : t.title,
          url: '/#/tasks',
          // A timed task due later today isn't ready for its own ping until its
          // time arrives; overdue and all-day tasks are ready right away.
          ready: !(timed && minutesOf(String(t.due_time).slice(0, 5)) > nowMin),
          priority: t.priority ?? 0,
        }
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  ) // highest-priority leads the digest
}

// Reminders (0039): a date you asked to be told about, with nothing to do.
//
// The copy carries no urgency verb — no "Overdue", no "Due today" — because
// nothing here can be late. What it says is the reminder, and when it was for.
// The link goes to the Reminders page, where the thing actually is.
//
// Gated on prefs.dates, matching buildAttention: a reminder is date-shaped, not
// work-shaped. (Arguably it deserves a toggle of its own — see the note in
// docs/next-steps.md — but the client and the server must agree above all, and
// today they agree on this one.)
function reminderPings(tasks: any[], memberId: string, today: string): Item[] {
  return tasks
    .filter((t) => t.is_reminder && !t.completed_at && t.due_date && t.due_date <= today)
    .filter((t) => !t.assignee || t.assignee === 'anyone' || t.assignee === memberId)
    .map((t) => ({
      kind: 'reminder' as const,
      // Matches the client's key exactly, or dismissing one in the app wouldn't
      // silence its push.
      targetKey: `reminder:${t.id}`,
      title: t.title,
      body:
        t.due_date < today
          ? 'A heads-up you have not marked as seen'
          : t.due_time
            ? `Today · ${fmtTime(t.due_time)}`
            : 'Today',
      url: '/#/reminders',
    }))
}

// A list with a due_date + reminder fires at its own reminder_time (±7 min of a
// 15-min tick; the notification_log claim caps it at once per day), as long as
// it's reached its due date. In-app Today shows due lists regardless; the push
// is opt-in per list, timed to the moment the user chose. Body carries how many
// items are still open so the ping is actionable on its own.
function listReminders(lists: any[], items: any[], today: string, time: string): Item[] {
  const out: Item[] = []
  for (const l of lists) {
    if (!l.reminder_enabled || !l.reminder_time || !l.due_date || l.due_date > today) continue
    if (Math.abs(minutesOf(time) - minutesOf(String(l.reminder_time).slice(0, 5))) > 7) continue
    const left = items.filter((it) => it.list_id === l.id && !it.checked_at).length
    out.push({
      kind: 'list',
      targetKey: `list:${l.id}`,
      title: `${l.icon ? `${l.icon} ` : ''}${l.name}${l.due_date < today ? ' — overdue' : ' — due today'}`,
      body: left ? `${left} item${left === 1 ? '' : 's'} still to go` : 'Time to wrap this up',
      url: `/#/list/${l.id}`,
    })
  }
  return out
}

// Check-ins, for people AND for organizations — orgs carry a cadence of their
// own since 0042, and the two produce the same kind of item, so one function
// builds both. The targetKeys match the client's exactly (`nudge:<id>` and
// `nudge:org:<id>`), which is what makes an in-app snooze silence the push.
function checkIns(people: any[], orgs: any[], interactions: any[], now = Date.now()): Item[] {
  const lastByPerson = new Map<string, string>()
  const lastByOrg = new Map<string, string>()
  for (const i of interactions) {
    const [map, id] = i.organization_id
      ? [lastByOrg, i.organization_id]
      : [lastByPerson, i.person_id]
    if (!id) continue
    const prev = map.get(id)
    if (!prev || prev < i.occurred_at) map.set(id, i.occurred_at)
  }

  // null = not due; { since } = due, with days elapsed (null if never logged).
  const due = (row: any, last?: string) => {
    if (!row.keep_in_touch_days) return null
    const since = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null
    if (since !== null && since < row.keep_in_touch_days) return null
    return { since }
  }

  const out: Item[] = []
  for (const p of people) {
    if (p.deleted_at) continue
    const state = due(p, lastByPerson.get(p.id))
    if (!state) continue
    out.push({
      kind: 'nudge',
      targetKey: `nudge:${p.id}`,
      title: 'Check in',
      // warm copy, mirroring the app — never "overdue"/"cadence"
      body:
        state.since === null
          ? `Say hi to ${p.name} — no catch-ups logged yet`
          : `It's been a while since you caught up with ${p.name}`,
      url: `/#/person/${p.id}`,
    })
  }

  // Plainer register for an account, matching checkInSub in TodayView: "say hi"
  // to a contracting firm is odd, and the warmth those words carry is for
  // people. Still not pipeline-speak — "nothing logged yet" is a fact about your
  // own record, not a stage in a funnel.
  for (const o of orgs) {
    const state = due(o, lastByOrg.get(o.id))
    if (!state) continue
    out.push({
      kind: 'nudge',
      targetKey: `nudge:org:${o.id}`,
      title: 'Check in',
      body:
        state.since === null
          ? `${o.name} — nothing logged yet`
          : `It's been a while since you were in touch with ${o.name}`,
      url: `/#/org/${o.id}`,
    })
  }
  return out
}

// Whole days from `today` (ISO) until an event's next occurrence. Annual events
// (birthdays, anniversaries) recur on their month/day each year; one-offs count
// to the literal date and go negative once past. UTC-noon avoids any zone shift,
// matching the rest of this file's date math.
function daysAhead(dateStr: string, today: string, annual: boolean): number {
  const t = new Date(`${today}T12:00:00Z`)
  const [y, m, d] = dateStr.split('-').map(Number)
  let target = new Date(Date.UTC(annual ? t.getUTCFullYear() : y, m - 1, d, 12))
  if (annual && target < t) target = new Date(Date.UTC(t.getUTCFullYear() + 1, m - 1, d, 12))
  return Math.round((target.getTime() - t.getTime()) / 86400000)
}

// Human lead label matching the Settings options (3 days / 1 week / 2 weeks).
const leadLabel = (n: number) => (n === 7 ? 'a week' : n === 14 ? '2 weeks' : `${n} days`)

// Birthday / key-date reminders. Fires day-of (the celebration ping) and a
// single heads-up exactly `leadDays` before — honoring the member's "heads-up
// before a date" setting. The two use distinct targetKeys so claimSend treats
// them as separate once-per-day notifications.
function dateReminders(people: any[], keyDates: any[], today: string, leadDays: number): Item[] {
  const out: Item[] = []
  const td = monthDay(today)
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const p of people) {
    if (p.deleted_at || !p.birthday) continue
    if (monthDay(p.birthday) === td) {
      const year = Number(p.birthday.slice(0, 4))
      const turning = year ? Number(today.slice(0, 4)) - year : null
      out.push({
        kind: 'date',
        targetKey: `date:b-${p.id}`,
        title: `🎂 ${p.name}'s birthday`,
        body: turning ? `${p.name} turns ${turning} today` : `It's ${p.name}'s birthday today`,
        url: `/#/person/${p.id}`,
      })
    } else if (daysAhead(p.birthday, today, true) === leadDays) {
      out.push({
        kind: 'date',
        targetKey: `date:b-${p.id}:soon`,
        title: `🎂 ${p.name}'s birthday soon`,
        body: `${p.name}'s birthday is in ${leadLabel(leadDays)}`,
        url: `/#/person/${p.id}`,
      })
    }
  }
  for (const kd of keyDates) {
    const p = byId.get(kd.person_id)
    if (!p || p.deleted_at) continue
    if (kd.annual ? monthDay(kd.date) === td : kd.date === today) {
      const year = Number(kd.date.slice(0, 4))
      const years = kd.annual && year ? Number(today.slice(0, 4)) - year : null
      out.push({
        kind: 'date',
        targetKey: `date:${kd.id}`,
        title: kd.label,
        body: years
          ? `${p.name} — ${kd.label}, ${years} years today`
          : `${p.name} — ${kd.label} today`,
        url: `/#/person/${p.id}`,
      })
    } else if (daysAhead(kd.date, today, !!kd.annual) === leadDays) {
      out.push({
        kind: 'date',
        targetKey: `date:${kd.id}:soon`,
        title: kd.label,
        body: `${p.name} — ${kd.label} in ${leadLabel(leadDays)}`,
        url: `/#/person/${p.id}`,
      })
    }
  }
  return out
}

// ---- habit reminders --------------------------------------------------
// Per-habit nudge at its reminder_time (±7 min of a 15-min cron tick; the
// notification_log claim guarantees once per day). Only fires when the habit is
// due today and not already satisfied — a gentle "time to log this". The
// schedule rules themselves live in habitSchedule.ts, which is a tested port of
// src/lib/habits.js; this half is just the notification shape and time window.

function habitReminders(
  habits: any[],
  entries: any[],
  memberId: string,
  today: string,
  time: string,
): Item[] {
  const out: Item[] = []
  for (const h of habits) {
    if (h.archived_at || h.deleted_at) continue // paused/removed habits never nudge
    if (h.member_id !== memberId || !h.reminder_enabled || !h.reminder_time) continue
    if (Math.abs(minutesOf(time) - minutesOf(String(h.reminder_time).slice(0, 5))) > 7) continue
    if (!habitDueToday(h, entries, today)) continue
    out.push({
      kind: 'habit',
      targetKey: `habit:${h.id}`,
      title: `Log ${h.name}`,
      body: h.polarity === 'limit' ? `How much ${h.unit ?? 'today'}?` : `Time to log ${h.name}`,
      url: '/#/habits',
    })
  }
  return out
}

// ---- delivery -----------------------------------------------------------
// Fan a payload out to a member's already-fetched subscriptions in parallel.
// Returns the count that actually accepted it. Expired endpoints (404/410) are
// pruned; any OTHER failure is logged (visibility) and counts as not-sent, so
// the caller can roll its claim back and retry on the next tick.
async function pushToSubs(
  subs: any[],
  payload: { title: string; body: string; url: string; tag?: string; badge?: number },
) {
  let ok = 0
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        )
        ok++
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id) // expired/revoked
        } else {
          // 403 (VAPID mismatch), 429 (rate limit), 5xx, network — keep the
          // endpoint, surface it in the function logs, let the claim roll back.
          console.error('[send-reminders] push failed', {
            status: err?.statusCode,
            subId: sub.id,
            tag: payload.tag,
          })
        }
      }
    }),
  )
  return ok
}

// Claim an item in notification_log; only the caller that inserts gets to
// send (idempotent across 15-min runs). Paired with unclaim() so a send that
// delivered to zero devices (transient failure) is retried next tick instead of
// being silently swallowed for the day.
async function claim(memberId: string, kind: string, targetKey: string, sentFor: string) {
  const { error } = await supabase
    .from('notification_log')
    .insert({ member_id: memberId, kind, target_key: targetKey, sent_for: sentFor })
  return !error // unique violation = already sent today
}

async function unclaim(memberId: string, kind: string, targetKey: string, sentFor: string) {
  await supabase
    .from('notification_log')
    .delete()
    .match({ member_id: memberId, kind, target_key: targetKey, sent_for: sentFor })
}

// Claim → send → keep-or-roll-back. The atomic insert still guarantees a single
// sender across concurrent runs; rolling back on a zero-delivery result is what
// makes a transient push failure retryable. Re-sends are harmless: every push
// carries tag = targetKey, so the push service REPLACES rather than stacks.
async function claimSend(
  subs: any[],
  memberId: string,
  kind: string,
  targetKey: string,
  sentFor: string,
  payload: { title: string; body: string; url: string; badge?: number },
) {
  if (!(await claim(memberId, kind, targetKey, sentFor))) return 0
  const n = await pushToSubs(subs, { ...payload, tag: targetKey || kind })
  if (n === 0) await unclaim(memberId, kind, targetKey, sentFor)
  return n
}

Deno.serve(async (req) => {
  // Caller auth: a shared CRON_SECRET we control (set as a function secret and
  // sent by the pg_cron job / curl), OR the injected service-role key. Exact
  // Bearer-token match, constant time — see auth.ts for why, and auth.test.ts
  // for the rejections it's required to make.
  if (
    !isAuthorized(
      req.headers.get('Authorization'),
      Deno.env.get('CRON_SECRET'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    )
  ) {
    return new Response('Forbidden', { status: 403 })
  }

  // Absolute instant — the one time value that is genuinely shared, since a
  // snooze expiry is a moment rather than a wall clock. Everything calendar- or
  // clock-shaped is computed per member inside the loop (0036).
  const nowIso = new Date().toISOString()

  const [
    members,
    prefsRows,
    snoozeRows,
    subscriptions,
    people,
    orgs,
    interactions,
    tasks,
    keyDates,
    habits,
    habitEntries,
    lists,
    listItems,
    areas,
  ] = await Promise.all([
    supabase.from('household_members').select('*'),
    supabase.from('notification_prefs').select('*'),
    supabase.from('reminder_snoozes').select('*'),
    supabase.from('push_subscriptions').select('*'),
    supabase.from('people').select('*'),
    // Orgs carry a cadence of their own since 0042 — the client company is the
    // thing you manage, and its contact person may change twice a year.
    supabase.from('organizations').select('*'),
    // household_id rides along so this can be scoped like everything else. It
    // would be *nearly* safe without it (a foreign person_id simply never gets
    // looked up), and "nearly safe by accident" is how the leak below happened.
    supabase.from('interactions').select('household_id, person_id, occurred_at'),
    supabase.from('tasks').select('*'),
    supabase.from('key_dates').select('*'),
    supabase.from('habits').select('*'),
    supabase.from('habit_entries').select('habit_id, date, value, skipped'),
    supabase.from('lists').select('*'),
    supabase.from('list_items').select('list_id, checked_at'),
    supabase.from('areas').select('id, show_on_today'),
  ]).then((rs) => rs.map((r) => r.data ?? []))

  const prefsByMember = new Map(
    prefsRows.map((p: any) => [p.member_id, { ...DEFAULT_PREFS, ...p }]),
  )
  // Group subscriptions by member up front — one query, no per-item refetch.
  const subsByMember = new Map<string, any[]>()
  for (const sub of subscriptions) {
    const list = subsByMember.get(sub.member_id) ?? []
    list.push(sub)
    subsByMember.set(sub.member_id, list)
  }
  // show_on_today (0040): an area switched off is off everywhere Today reaches,
  // including this sweep. Built once — area ids are uuids, so one set across
  // households can't collide — and applied to the rows the PING paths read.
  // badgeCount does its own filtering from `areas` (see badge.ts), which its
  // parity test pins against the client.
  //
  // A contact reached through a business area is mutable with it (0042). Personal
  // contacts still aren't: they have no context area, so silencing Work can never
  // silence a friend's birthday. That is the rule working, not a gap in it.
  const muted = mutedAreaIds(areas)
  const liveTasks = tasks.filter((t: any) => reachesToday(t, muted))
  const liveLists = lists.filter((l: any) => reachesToday(l, muted))
  const liveHabits = habits.filter((h: any) => reachesToday(h, muted))
  // A contact's check-in and dates follow its context area's show_on_today. The
  // row keeps `context_area_id` (never `area_id`) precisely so this is the only
  // thing that ever reads it — see 0042 and lib/areas.js.
  const livePeople = people.filter((p: any) => reachesToday({ area_id: p.context_area_id }, muted))
  const liveOrgs = orgs.filter((o: any) => reachesToday({ area_id: o.context_area_id }, muted))

  let sent = 0

  for (const member of members) {
    // No device = nothing deliverable; skip before doing any per-member work.
    const subs = subsByMember.get(member.id) ?? []
    if (!subs.length) continue

    // "Today" and "now" are per member, not per system (0036). Two members in
    // different zones are legitimately on different days at this instant, and
    // each one's digest_time and reminder windows are wall-clock times where
    // THEY are. An unset or unusable zone falls back to TZ_NAME, so a row that
    // predates the column behaves exactly as it did before.
    const { date: today, time } = localNow(member.timezone ?? TZ)

    const prefs = prefsByMember.get(member.id) ?? DEFAULT_PREFS
    const hidden = new Set(
      snoozeRows
        .filter((s: any) => s.member_id === member.id)
        .filter((s: any) => s.until === null || s.until > nowIso)
        .map((s: any) => s.target_key),
    )

    // Everything this member may be told about, decided ONCE and then used by
    // every builder below — the badge, the digest, and each individual ping.
    //
    // It used to be decided here for the badge alone, and the builders that
    // write the notification text were handed the raw service-role arrays. That
    // is a disclosure bug in both directions: across households (a check-in push
    // naming a stranger's contact, deep-linked to a profile the recipient can't
    // open) and within one (a contact marked "Private, only me" pushed to the
    // other member by name, since nothing here applied privacy_level at all).
    //
    // Two rules, one place, no per-builder opt-in: a builder added later is
    // scoped by construction rather than by remembering. See scope.ts.
    const hh = member.household_id
    const uid = member.user_id
    const myTasks = scopeFor(liveTasks, hh, uid)
    const myLists = scopeFor(liveLists, hh, uid)
    const myHabits = scopeFor(liveHabits, hh, uid)
    const myPeople = scopeFor(livePeople, hh, uid)
    const myOrgs = scopeFor(liveOrgs, hh, uid)
    const myKeyDates = scopeFor(keyDates, hh, uid)
    const myInteractions = scopeFor(interactions, hh, uid)

    // The app-icon number, recomputed fresh and attached to every push this
    // member gets — public/sw.js applies it, which is the only way the badge can
    // move while the app is closed (src/App.jsx can only set it from an open
    // page).
    //
    // Deliberately NOT wired to the client's `todayScope` preference, which
    // lives in localStorage and never reaches the server (member_preferences has
    // no column for it). 'mine' is the default and matches the rule the pushes
    // below already use; a member who switched Today to "Everyone's" sees the
    // in-app badge correct itself the moment they open the app.
    const badge = badgeCount(
      { tasks: myTasks, lists: myLists, people: myPeople, keyDates: myKeyDates, areas },
      member.id,
      today,
      prefs,
      hidden,
    )

    // Every send in this iteration carries the same subs, member, day and badge.
    const send = (
      kind: string,
      targetKey: string,
      p: { title: string; body: string; url: string },
    ) => claimSend(subs, member.id, kind, targetKey, today, { ...p, badge })

    const items: Item[] = [
      ...(prefs.tasks ? dueTasksToday(myTasks, member.id, today, time) : []),
      ...(prefs.nudges ? checkIns(myPeople, myOrgs, myInteractions) : []),
      ...(prefs.dates
        ? dateReminders(myPeople, myKeyDates, today, prefs.dates_lead_days ?? 7)
        : []),
      ...(prefs.dates ? reminderPings(myTasks, member.id, today) : []),
    ].filter((i) => !hidden.has(i.targetKey))

    // Deadlines with days still on the clock. Kept out of `items` on purpose:
    // they must not join today's count ("3 things today" that includes
    // something due Friday is a lie) and must never become individual pings.
    // See deadlines.ts.
    const ahead = (prefs.tasks ? deadlinesAhead(myTasks, member.id, today) : []).filter(
      (t) => !hidden.has(`task:${t.id}`),
    )

    if (items.length || ahead.length) {
      // Morning digest: one summary at the member's digest_time (±15 min).
      const wantDigest = Math.abs(minutesOf(time) - minutesOf(prefs.digest_time ?? '08:00')) <= 15
      const copy = digestCopy(items, ahead)
      if (wantDigest && copy) {
        sent += await send('digest', '', { ...copy, url: '/' })
      }

      // Individual pings: day-of dates + tasks (check-ins ride the digest — a
      // "say hi" item is never urgent enough to interrupt someone's day). A
      // timed task that isn't due yet (ready === false) waits for a later tick.
      for (const item of items.filter((i) => i.kind !== 'nudge' && i.ready !== false)) {
        sent += await send(item.kind, item.targetKey, {
          title: item.title,
          body: item.body,
          url: item.url,
        })
      }
    }

    // Habit reminders fire at each habit's own reminder_time, independent of the
    // digest, and are gated per-habit (reminder_enabled) + by snoozes.
    const habitItems = habitReminders(myHabits, habitEntries, member.id, today, time).filter(
      (i) => !hidden.has(i.targetKey),
    )
    for (const item of habitItems) {
      sent += await send(item.kind, item.targetKey, {
        title: item.title,
        body: item.body,
        url: item.url,
      })
    }

    // List reminders fire at each list's own reminder_time (like habits), gated
    // per-list (reminder_enabled) + by the lists pref + snoozes. Lists are
    // household-shared, so every member with the pref on gets the nudge.
    if (prefs.lists) {
      const listItemsToSend = listReminders(myLists, listItems, today, time).filter(
        (i) => !hidden.has(i.targetKey),
      )
      for (const item of listItemsToSend) {
        sent += await send(item.kind, item.targetKey, {
          title: item.title,
          body: item.body,
          url: item.url,
        })
      }
    }
  }

  // No single date/time to report any more — that was the bug. Log the distinct
  // local days the run saw instead, which is also the quickest way to spot a
  // member sitting on a zone nobody expected.
  console.log('[send-reminders]', {
    at: nowIso,
    days: [...new Set(members.map((m: any) => localNow(m.timezone ?? TZ).date))].sort(),
    members: members.length,
    sent,
  })
  return Response.json({ ok: true, members: members.length, sent })
})
