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

const DEFAULT_PREFS = { tasks: true, nudges: true, dates: true, fyi: false, dates_lead_days: 7, digest_time: '08:00' }

type Item = { kind: 'task' | 'nudge' | 'date'; targetKey: string; title: string; body: string; url: string }

// ---- local-time helpers -----------------------------------------------
function localNow() {
  // en-CA gives YYYY-MM-DD; HH:mm extracted separately
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  return { date, time } // { '2026-06-12', '08:07' }
}

const monthDay = (iso: string) => iso?.slice(5) // 'MM-DD'

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

// ---- attention rules (server port of src/lib/reminders.js) -------------
function dueTasksToday(tasks: any[], memberId: string, today: string): Item[] {
  return tasks
    .filter((t) => !t.parent_id && !t.completed_at && t.due_date && t.due_date <= today)
    .filter((t) => !t.assignee || t.assignee === 'anyone' || t.assignee === memberId)
    .map((t) => ({
      kind: 'task' as const,
      targetKey: `task:${t.id}`,
      title: t.due_date < today ? 'Overdue' : 'Due today',
      body: t.title,
      url: '/#/tasks',
    }))
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
      body: since === null ? `Say hi to ${p.name} — no catch-ups logged yet` : `It's been a while since you caught up with ${p.name}`,
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
      body: years ? `${p.name} — ${kd.label}, ${years} years today` : `${p.name} — ${kd.label} today`,
      url: `/#/person/${p.id}`,
    })
  }
  return out
}

// ---- delivery -----------------------------------------------------------
async function pushTo(memberId: string, payload: { title: string; body: string; url: string; tag?: string }) {
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('member_id', memberId)
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
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { date: today, time } = localNow()
  const nowIso = new Date().toISOString()

  const [members, prefsRows, snoozeRows, people, interactions, tasks, keyDates] = await Promise.all([
    supabase.from('household_members').select('*'),
    supabase.from('notification_prefs').select('*'),
    supabase.from('reminder_snoozes').select('*'),
    supabase.from('people').select('*'),
    supabase.from('interactions').select('person_id, occurred_at'),
    supabase.from('tasks').select('*'),
    supabase.from('key_dates').select('*'),
  ]).then((rs) => rs.map((r) => r.data ?? []))

  const prefsByMember = new Map(prefsRows.map((p: any) => [p.member_id, { ...DEFAULT_PREFS, ...p }]))
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
      ...(prefs.tasks ? dueTasksToday(tasks, member.id, today) : []),
      ...(prefs.nudges ? checkIns(people, interactions, member.id) : []),
      ...(prefs.dates ? dayOfDates(people, keyDates, today) : []),
    ].filter((i) => !hidden.has(i.targetKey))

    if (!items.length) continue

    // Morning digest: one summary at the member's digest_time (±15 min).
    const wantDigest = Math.abs(minutesOf(time) - minutesOf(prefs.digest_time ?? '08:00')) <= 15
    if (wantDigest && (await claim(member.id, 'digest', '', today))) {
      const lead = items.slice(0, 3).map((i) => i.body).join(' · ')
      sent += await pushTo(member.id, {
        title: items.length === 1 ? '1 thing today' : `${items.length} things today`,
        body: lead + (items.length > 3 ? ` · +${items.length - 3} more` : ''),
        url: '/',
        tag: 'digest',
      })
    }

    // Individual pings: day-of dates + tasks only (check-ins ride the digest —
    // a "say hi" item is never urgent enough to interrupt someone's day).
    for (const item of items.filter((i) => i.kind !== 'nudge')) {
      if (!(await claim(member.id, item.kind, item.targetKey, today))) continue
      sent += await pushTo(member.id, { title: item.title, body: item.body, url: item.url, tag: item.targetKey })
    }
  }

  return Response.json({ ok: true, members: members.length, sent })
})
