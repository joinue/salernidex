// SALERNIDEX — send-reminders Edge Function (Phase 6b SKELETON — not deployed)
//
// Invoked by pg_cron every 15 minutes (see the Phase 6 section of
// supabase/schema.sql). Recomputes the same attention rules as the client's
// src/lib/reminders.js, applies per-member prefs + snoozes, dedupes via
// notification_log, and web-pushes to each member's subscriptions.
//
// Deploy (at Supabase go-live):
//   supabase functions deploy send-reminders
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:marc@joinue.com
// The public key is also exposed client-side as VITE_VAPID_PUBLIC_KEY.

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

type Attention = {
  memberId: string
  kind: 'task' | 'nudge' | 'date' | 'digest'
  targetKey: string // '' for digest
  title: string
  body: string
  url: string // deep link, e.g. /#/person/<id>
}

Deno.serve(async (req) => {
  // pg_cron calls with the service-role bearer; reject anything else.
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)) {
    return new Response('Forbidden', { status: 403 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const pending: Attention[] = []

  // 1. Load members + prefs + snoozes + subscriptions in one pass.
  //    TODO(6b): const { data: members } = await supabase.from('household_members').select(...)
  //    Members without a notification_prefs row get the defaults (fyi off).

  // 2. Per member, recompute attention (port of src/lib/reminders.js):
  //    - tasks:  due today / overdue, not completed, assignee is them or 'anyone'
  //    - nudges: keep_in_touch_days set AND last interaction older than cadence
  //    - dates:  birthdays + key_dates where daysUntil === 0 (day-of push only;
  //              the lead-time heads-up stays in-app to avoid double-pinging)
  //    - digest: at the member's digest_time (±15 min window), one summary of
  //              everything above instead of individual pings
  //    Skip anything in reminder_snoozes (until > now, or until is null).

  // 3. Dedupe: insert into notification_log (member_id, kind, target_key,
  //    sent_for=today) ON CONFLICT DO NOTHING; only rows that inserted get sent.

  // 4. Send to every subscription of each member; prune dead endpoints.
  let sent = 0
  for (const item of pending) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('member_id', item.memberId)
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: item.title, body: item.body, url: item.url }),
        )
        sent++
      } catch (err) {
        // 404/410 = subscription expired or revoked — clean it up.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  }

  return Response.json({ ok: true, pending: pending.length, sent })
})
