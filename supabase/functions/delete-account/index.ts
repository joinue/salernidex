// SALERNIDEX — delete-account Edge Function.
//
// In-app account deletion (App Store requirement). The client cannot delete its
// own auth user — that needs the service role — so it invokes this function,
// which:
//   1. Deletes every household the caller is the SOLE member of (a clean
//      cascade — members + all data — instead of orphaning it behind RLS).
//   2. Deletes the auth user. Their memberships in shared households cascade via
//      household_members.user_id → auth.users; the promote_owner_on_leave
//      trigger (migration 0020) reseats ownership where the caller was the last
//      owner, so co-members aren't stranded.
//
// The caller is identified from their JWT (forwarded by supabase.functions
// .invoke); the privileged deletes run through a separate service-role client.
//
// Deploy:
//   supabase functions deploy delete-account
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by
// the platform.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // bypasses RLS, never ships to clients

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    // Identify the caller from their JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // 1. Sole-member households → delete the household (cascades data + members).
    const { data: memberships, error: memErr } = await admin
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
    if (memErr) return json({ error: memErr.message }, 500)

    for (const { household_id } of memberships ?? []) {
      const { count } = await admin
        .from('household_members')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', household_id)
      if ((count ?? 0) <= 1) {
        await admin.from('households').delete().eq('id', household_id)
      }
    }

    // 2. Delete the auth user (cascades remaining memberships; trigger reseats
    //    ownership in any shared household that lost its last owner).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) return json({ error: delErr.message }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
