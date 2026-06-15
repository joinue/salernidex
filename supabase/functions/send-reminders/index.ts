// SALERNIDEX — send-reminders Edge Function (Phase 6b — code-complete,
// deploys at Supabase go-live; untested against a live project until then).
//
// Invoked by pg_cron every 15 minutes (see the Phase 6 section of
// supabase/schema.sql). Server-side port of src/lib/reminders.js: recomputes
// attention per member, applies prefs + snoozes, dedupes via
// notification_log, and web-pushes to each member's devices.
//
// Sending policy (docs/phase6-reminders.md):
//   - individual pushes only for DAY-OF dates and tasks due/overdue today
//   - a TIMED task (due_time set) fires its individual push at that time, not in
//     the morning — until then it only rides the digest as a heads-up
//   - one morning digest per member at their digest_time (±15 min window)
//   - lead-time heads-ups stay in-app only (no double-pinging)
//
// Deploy:
//   supabase functions deploy send-reminders
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:marc@joinue.com TZ_NAME=America/Phoenix

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role: bypasses RLS, never ships to clients
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:marc@joinue.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

// Household-local timezone (single-household assumption until go-live adds
// one per household; America/Phoenix has no DST, conveniently).
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
  kind: 'task' | 'list' | 'nudge' | 'date' | 'habit'
  targetKey: string
  title: string
  body: string
  url: string
  ready?: boolean // false = in digest but not yet eligible for an individual ping (timed task)
  priority?: number // task flag (0..3); orders the digest lead
}

// ---- local-time helpers -----------------------------------------------
function localNow() {
  // en-CA gives YYYY-MM-DD; HH:mm extracted separately
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  return { date, time } // { '2026-06-12', '08:07' }
}

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

// ---- attention rules (server port of src/lib/reminders.js) -------------
function dueTasksToday(tasks: any[], memberId: string, today: string, time: string): Item[] {
  const nowMin = minutesOf(time)
  return (
    tasks
      .filter((t) => !t.parent_id && !t.completed_at && t.due_date && t.due_date <= today)
      // deferred tasks (start_date in the future) stay parked until their day
      .filter((t) => !t.start_date || t.start_date <= today)
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

function checkIns(people: any[], interactions: any[], memberId: string): Item[] {
  const lastByPerson = new Map<string, string>()
  for (const i of interactions) {
    const prev = lastByPerson.get(i.person_id)
    if (!prev || prev < i.occurred_at) lastByPerson.set(i.person_id, i.occurred_at)
  }
  const out: Item[] = []
  for (const p of people) {
    if (p.deleted_at || !p.keep_in_touch_days) continue
    const last = lastByPerson.get(p.id)
    const since = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null
    if (since !== null && since < p.keep_in_touch_days) continue
    out.push({
      kind: 'nudge',
      targetKey: `nudge:${p.id}`,
      title: 'Check in',
      // warm copy, mirroring the app — never "overdue"/"cadence"
      body:
        since === null
          ? `Say hi to ${p.name} — no catch-ups logged yet`
          : `It's been a while since you caught up with ${p.name}`,
      url: `/#/person/${p.id}`,
    })
  }
  return out
}

function dayOfDates(people: any[], keyDates: any[], today: string): Item[] {
  const out: Item[] = []
  const td = monthDay(today)
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const p of people) {
    if (p.deleted_at || !p.birthday) continue
    if (monthDay(p.birthday) !== td) continue
    const year = Number(p.birthday.slice(0, 4))
    const turning = year ? Number(today.slice(0, 4)) - year : null
    out.push({
      kind: 'date',
      targetKey: `date:b-${p.id}`,
      title: `🎂 ${p.name}'s birthday`,
      body: turning ? `${p.name} turns ${turning} today` : `It's ${p.name}'s birthday today`,
      url: `/#/person/${p.id}`,
    })
  }
  for (const kd of keyDates) {
    const p = byId.get(kd.person_id)
    if (!p || p.deleted_at) continue
    const hit = kd.annual ? monthDay(kd.date) === td : kd.date === today
    if (!hit) continue
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
  }
  return out
}

// ---- habit reminders (server port of the schedule logic in lib/habits.js) ---
// Per-habit nudge at its reminder_time (±7 min of a 15-min cron tick; the
// notification_log claim guarantees once per day). Only fires when the habit is
// due today and not already satisfied — a gentle "time to log this".
const dowOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() // 0=Sun..6=Sat

// Server port of lib/recurrence.js occursOn: does `rule` land on this ISO date?
// Anchored phase for "every N" intervals; honors until/exdates. UTC-noon dates
// avoid any DST/zone day-shift (matches the rest of this file's date math).
function ruleOccursOn(rule: any, iso: string): boolean {
  if (!rule || !rule.freq) return false
  if (rule.until && iso > rule.until) return false
  if (rule.exdates?.includes(iso)) return false
  const DAY = 86400000
  const d = new Date(`${iso}T12:00:00Z`)
  const a = new Date(`${rule.anchor || iso}T12:00:00Z`)
  const interval = rule.interval || 1
  const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  switch (rule.freq) {
    case 'daily': {
      const diff = Math.round((d.getTime() - a.getTime()) / DAY)
      return diff >= 0 && diff % interval === 0
    }
    case 'weekly': {
      if (!rule.weekdays?.includes(d.getUTCDay())) return false
      const wsNum = (x: Date) => Math.floor(x.getTime() / DAY) - x.getUTCDay()
      const weeks = Math.round((wsNum(d) - wsNum(a)) / 7)
      return weeks >= 0 && weeks % interval === 0
    }
    case 'monthly': {
      const months =
        (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + (d.getUTCMonth() - a.getUTCMonth())
      if (months < 0 || months % interval !== 0) return false
      if (rule.setpos) {
        const y = d.getUTCFullYear()
        const m = d.getUTCMonth()
        let day: number
        if (rule.setpos === -1) {
          const last = dim(y, m)
          const lastDow = new Date(Date.UTC(y, m, last)).getUTCDay()
          day = last - ((lastDow - rule.weekday + 7) % 7)
        } else {
          const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay()
          day = 1 + ((rule.weekday - firstDow + 7) % 7) + (rule.setpos - 1) * 7
          if (day > dim(y, m)) return false
        }
        return d.getUTCDate() === day
      }
      return d.getUTCDate() === Math.min(rule.monthday, dim(d.getUTCFullYear(), d.getUTCMonth()))
    }
    case 'yearly': {
      const years = d.getUTCFullYear() - a.getUTCFullYear()
      if (years < 0 || years % interval !== 0) return false
      return (
        d.getUTCMonth() === rule.month &&
        d.getUTCDate() === Math.min(rule.monthday, dim(d.getUTCFullYear(), rule.month))
      )
    }
  }
  return false
}

function habitDueToday(h: any, entries: any[], today: string): boolean {
  const todayEntry = entries.find((e) => e.habit_id === h.id && e.date === today)
  if (todayEntry?.skipped) return false // rest day

  if (h.rrule) {
    // rrule overrides the weekday/weekly modes; only nudge on a matching day.
    if (!ruleOccursOn(h.rrule, today)) return false
    if (h.polarity === 'build') return Number(todayEntry?.value ?? 0) < (h.target ?? 1)
    return true
  }

  if (h.weekly_target) {
    // Monday-start week; already hit the weekly target → nothing to nudge.
    const d = new Date(`${today}T12:00:00Z`)
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000)
    const mondayIso = monday.toISOString().slice(0, 10)
    let count = 0
    for (const e of entries) {
      if (e.habit_id !== h.id || e.skipped) continue
      if (e.date < mondayIso || e.date > today) continue
      if (Number(e.value) >= (h.target ?? 1)) count++
    }
    return count < h.weekly_target
  }

  // weekday mode: must be an active day
  const days: number[] = h.active_days ?? []
  if (days.length && !days.includes(dowOf(today))) return false
  // build: skip if today's goal already met (limit/track always worth a log nudge)
  if (h.polarity === 'build') return Number(todayEntry?.value ?? 0) < (h.target ?? 1)
  return true
}

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
async function pushTo(
  memberId: string,
  payload: { title: string; body: string; url: string; tag?: string },
) {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('member_id', memberId)
  let sent = 0
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
      sent++
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id) // expired/revoked
      }
    }
  }
  return sent
}

// Claim an item in notification_log; only the caller that inserts gets to
// send (idempotent across 15-min runs).
async function claim(memberId: string, kind: string, targetKey: string, sentFor: string) {
  const { error } = await supabase
    .from('notification_log')
    .insert({ member_id: memberId, kind, target_key: targetKey, sent_for: sentFor })
  return !error // unique violation = already sent today
}

Deno.serve(async (req) => {
  // Caller auth: a shared CRON_SECRET we control (set as a function secret and
  // sent by the pg_cron job / curl), OR the injected service-role key. The
  // CRON_SECRET path is what works under Supabase's new API-key system, where
  // the dashboard service_role value no longer matches SUPABASE_SERVICE_ROLE_KEY.
  const auth = req.headers.get('Authorization') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET')
  const ok =
    (cronSecret && auth.includes(cronSecret)) ||
    auth.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!ok) {
    return new Response('Forbidden', { status: 403 })
  }

  const { date: today, time } = localNow()
  const nowIso = new Date().toISOString()

  const [
    members,
    prefsRows,
    snoozeRows,
    people,
    interactions,
    tasks,
    keyDates,
    habits,
    habitEntries,
    lists,
    listItems,
  ] = await Promise.all([
    supabase.from('household_members').select('*'),
    supabase.from('notification_prefs').select('*'),
    supabase.from('reminder_snoozes').select('*'),
    supabase.from('people').select('*'),
    supabase.from('interactions').select('person_id, occurred_at'),
    supabase.from('tasks').select('*'),
    supabase.from('key_dates').select('*'),
    supabase.from('habits').select('*'),
    supabase.from('habit_entries').select('habit_id, date, value, skipped'),
    supabase.from('lists').select('*'),
    supabase.from('list_items').select('list_id, checked_at'),
  ]).then((rs) => rs.map((r) => r.data ?? []))

  const prefsByMember = new Map(
    prefsRows.map((p: any) => [p.member_id, { ...DEFAULT_PREFS, ...p }]),
  )
  let sent = 0

  for (const member of members) {
    const prefs = prefsByMember.get(member.id) ?? DEFAULT_PREFS
    const hidden = new Set(
      snoozeRows
        .filter((s: any) => s.member_id === member.id)
        .filter((s: any) => s.until === null || s.until > nowIso)
        .map((s: any) => s.target_key),
    )

    const items: Item[] = [
      ...(prefs.tasks ? dueTasksToday(tasks, member.id, today, time) : []),
      ...(prefs.nudges ? checkIns(people, interactions, member.id) : []),
      ...(prefs.dates ? dayOfDates(people, keyDates, today) : []),
    ].filter((i) => !hidden.has(i.targetKey))

    if (!items.length) continue

    // Morning digest: one summary at the member's digest_time (±15 min).
    const wantDigest = Math.abs(minutesOf(time) - minutesOf(prefs.digest_time ?? '08:00')) <= 15
    if (wantDigest && (await claim(member.id, 'digest', '', today))) {
      const lead = items
        .slice(0, 3)
        .map((i) => i.body)
        .join(' · ')
      sent += await pushTo(member.id, {
        title: items.length === 1 ? '1 thing today' : `${items.length} things today`,
        body: lead + (items.length > 3 ? ` · +${items.length - 3} more` : ''),
        url: '/',
        tag: 'digest',
      })
    }

    // Individual pings: day-of dates + tasks + habits (check-ins ride the digest
    // — a "say hi" item is never urgent enough to interrupt someone's day). A
    // timed task that isn't due yet (ready === false) waits for a later tick.
    for (const item of items.filter((i) => i.kind !== 'nudge' && i.ready !== false)) {
      if (!(await claim(member.id, item.kind, item.targetKey, today))) continue
      sent += await pushTo(member.id, {
        title: item.title,
        body: item.body,
        url: item.url,
        tag: item.targetKey,
      })
    }

    // Habit reminders fire at each habit's own reminder_time, independent of the
    // digest, and are gated per-habit (reminder_enabled) + by snoozes.
    const habitItems = habitReminders(habits, habitEntries, member.id, today, time).filter(
      (i) => !hidden.has(i.targetKey),
    )
    for (const item of habitItems) {
      if (!(await claim(member.id, item.kind, item.targetKey, today))) continue
      sent += await pushTo(member.id, {
        title: item.title,
        body: item.body,
        url: item.url,
        tag: item.targetKey,
      })
    }

    // List reminders fire at each list's own reminder_time (like habits), gated
    // per-list (reminder_enabled) + by the lists pref + snoozes. Lists are
    // household-shared, so every member with the pref on gets the nudge.
    if (prefs.lists) {
      const listItemsToSend = listReminders(lists, listItems, today, time).filter(
        (i) => !hidden.has(i.targetKey),
      )
      for (const item of listItemsToSend) {
        if (!(await claim(member.id, item.kind, item.targetKey, today))) continue
        sent += await pushTo(member.id, {
          title: item.title,
          body: item.body,
          url: item.url,
          tag: item.targetKey,
        })
      }
    }
  }

  return Response.json({ ok: true, members: members.length, sent })
})
