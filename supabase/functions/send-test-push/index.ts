// DOOT — send-test-push Edge Function.
//
// Sends a REAL web push to the caller's own devices, through the same VAPID
// keypair and the same transport the nightly sweep uses.
//
// Why this exists: Settings already had a "test notification" button, but it
// called showNotification() in the page — a local call that never leaves the
// browser. It proves the OS will display a notification and nothing else. Every
// failure that actually takes push down lives past that point:
//
//   • the VAPID public key in the web build not matching the function's private
//     half — subscriptions succeed, the UI says "Ready", every send is rejected
//   • a subscription the push service has since retired
//   • the function not being reachable at all (see the gateway 401 that killed
//     the sweep for a week in August 2026)
//
// None of those are visible from the client, which is the whole problem: the
// failure is silent on both ends. This button makes the entire chain report.
//
// Auth: the caller's own JWT (supabase.functions.invoke forwards it), so the
// gateway check stays ON for this one — unlike send-reminders, which is called
// by pg_cron with a shared secret. See supabase/config.toml.
//
// Deploy:
//   supabase functions deploy send-test-push --use-api
// (VAPID_* secrets are already set for send-reminders; this reuses them.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // bypasses RLS, never ships to clients

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:marc@joinue.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

// A key mismatch is reported as 400 by Apple and 403 by the others, and it is
// the one failure worth naming in the UI, because the fix is a deploy rather
// than anything the user can do. web-push puts the service's explanation in
// `body`; Apple's says VapidPkHashMismatch outright.
function classify(err: any): { reason: string; dead: boolean } {
  const status = err?.statusCode
  const body = String(err?.body ?? '')
  if (/VapidPkHashMismatch/i.test(body) || status === 403) {
    return { reason: 'key-mismatch', dead: true }
  }
  if (status === 404 || status === 410) return { reason: 'expired', dead: true }
  if (status === 429) return { reason: 'rate-limited', dead: false }
  return { reason: `error-${status ?? 'network'}`, dead: false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    // Identify the caller from their JWT — same pattern as delete-account.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Their own memberships only. A test push must never be able to reach
    // another member's devices, so the subscription lookup is keyed on member
    // ids derived from the JWT rather than anything the caller sent.
    const { data: memberships, error: memErr } = await admin
      .from('household_members')
      .select('id')
      .eq('user_id', user.id)
    if (memErr) return json({ error: memErr.message }, 500)

    const memberIds = (memberships ?? []).map((m: any) => m.id)
    if (!memberIds.length) return json({ sent: 0, total: 0, results: [] })

    const { data: subs, error: subErr } = await admin
      .from('push_subscriptions')
      .select('*')
      .in('member_id', memberIds)
    if (subErr) return json({ error: subErr.message }, 500)
    if (!subs?.length) return json({ sent: 0, total: 0, results: [] })

    const payload = JSON.stringify({
      title: 'DOOT',
      body: 'Test push delivered — the whole chain works, server included.',
      url: '/',
      tag: 'test-push', // replaces rather than stacks if pressed twice
      // Deliberately absent: `badge`. A test must not overwrite the real
      // app-icon count with a number it didn't compute.
    })

    const results = await Promise.all(
      subs.map(async (sub: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
          return { ok: true, reason: 'delivered' }
        } catch (err) {
          const { reason, dead } = classify(err)
          // Prune what can never work again, so pressing the button twice gives
          // an honest count the second time. This is also the 400-mismatch
          // pruning that send-reminders still lacks (next-steps §1b).
          if (dead) await admin.from('push_subscriptions').delete().eq('id', sub.id)
          console.error('[send-test-push] failed', { status: err?.statusCode, reason })
          return { ok: false, reason }
        }
      }),
    )

    return json({
      sent: results.filter((r) => r.ok).length,
      total: results.length,
      results,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
