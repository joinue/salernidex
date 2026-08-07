// Caller auth for the send-reminders endpoint.
//
// Two accepted credentials, both sent as `Authorization: Bearer <token>`:
//   CRON_SECRET               — ours, set as a function secret and sent by pg_cron
//   SUPABASE_SERVICE_ROLE_KEY — the injected service-role key
// The CRON_SECRET path is what works under Supabase's newer API-key system, where
// the dashboard service_role value no longer matches SUPABASE_SERVICE_ROLE_KEY.
//
// This used to be `auth.includes(secret)`, which accepted the secret appearing
// ANYWHERE in the header — a lock that opens if the right key is somewhere on
// your keyring rather than the one you turned. It also compared with `includes`,
// which short-circuits on the first mismatched byte and so leaks how much of a
// guess was correct. Both are fixed here: parse the Bearer token, then compare
// in constant time.
//
// Pure and dependency-free so it can be unit tested (auth.test.ts) — the whole
// point of a security check is that you can prove it rejects.

// Constant-time string compare. Length is allowed to leak (unavoidable, and not
// interesting for a fixed-length token); content is not.
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// The token from an `Authorization: Bearer <token>` header, or '' if the header
// is missing or isn't a well-formed Bearer credential. Scheme is case-insensitive
// per RFC 7235; surrounding whitespace is tolerated.
export function bearerToken(header: string | null | undefined): string {
  if (!header) return ''
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(header)
  return m ? m[1] : ''
}

// Is this request allowed to run the reminder sweep? An empty/unset secret never
// authorizes anything — otherwise a misconfigured deploy (no CRON_SECRET) would
// silently accept a request with an empty token.
export function isAuthorized(
  header: string | null | undefined,
  cronSecret?: string | null,
  serviceRoleKey?: string | null,
): boolean {
  const token = bearerToken(header)
  if (!token) return false
  const candidates = [cronSecret, serviceRoleKey].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  )
  // Check every candidate (no early exit) so timing doesn't reveal which one matched.
  let ok = false
  for (const secret of candidates) if (timingSafeEqual(token, secret)) ok = true
  return ok
}
