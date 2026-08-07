# Notifications, reminders & push — review and roadmap

> **Record** — historical. Reviewed June 2026.
> **Two things here are out of date; do not act on them:**
> 1. **"App-wrapping strategy" is reversed.** It recommends TWA + PWA with
>    Capacitor later. The decision since taken ([next-steps.md](../next-steps.md)
>    §3) is **native SwiftUI for Apple platforms — explicitly not Capacitor and
>    not a WebView wrapper.**
> 2. **"Tighten cron auth" (P2) is done** — `auth.includes()` was replaced with
>    an exact, constant-time Bearer comparison in
>    [`send-reminders/auth.ts`](../../supabase/functions/send-reminders/auth.ts).
>
> Still live from the "Still open" list: the two attention engines are unified
> only by convention, badge-vs-push still disagree on habits, and the timezone
> item has been upgraded from per-household to **per-member** and is now a
> selling blocker (next-steps §2a). The test-push button and the
> `notificationclick` routing gap carry forward as next-steps §1d.
>
> Kept for "The stack at a glance" and the persistence model, which remain
> accurate descriptions of how the system is wired.

Review of the full attention/notification stack (June 2026), with what was fixed in
this pass and what remains, prioritized. The goal: make this the best it can be as a
PWA and prepare for wrapping into an installable app.

## The stack at a glance

One attention engine, computed in two places that must agree:

- **In-app (6a):** `src/lib/reminders.js` `buildAttention()` → feeds Today's sections,
  the Today nav count, and the OS app-icon badge (`navigator.setAppBadge`, wired in
  `src/App.jsx`). `badgeCount()` is the overdue/today subset.
- **Server (6b):** `supabase/functions/send-reminders/index.ts` — a Deno Edge Function
  invoked by `pg_cron` every 15 min. Re-derives the same rules server-side, applies
  prefs + snoozes, dedupes via `notification_log`, and web-pushes (VAPID) to each
  member's `push_subscriptions`.
- **Client push plumbing:** `src/lib/push.js` (permission + subscription), `public/sw.js`
  (display + click-through), `src/components/SettingsView.jsx` (`PushSection` + the
  per-category toggles).
- **Tables:** `notification_prefs`, `member_preferences`, `push_subscriptions`,
  `notification_log`, `reminder_snoozes` (all per-member, "own rows" RLS).

What's good and should be preserved: single-source attention rules, idempotent
send-log claim, self-healing subscription pruning (410 Gone), per-member RLS,
DST-safe UTC-noon date math on the server.

## Persistence model (answers the recurring "is it saved to my profile?" question)

- **Browser/OS notification permission** — local to each device/browser, by design.
  No web API lets a server grant it, so it can never live in Supabase. Every device
  grants once.
- **Push subscription** — stored in `push_subscriptions`, but one row *per device*
  (unique endpoint). Not a single profile flag.
- **Notification preference toggles + digest time** — `notification_prefs`, per member,
  hydrate on any device. These genuinely follow the account.

## Fixed in this pass

- **P0 — VAPID prod guard** (`src/lib/push.js`): a production build that falls back to
  the throwaway `DEV_VAPID_PUBLIC` key now logs a loud `console.error`, and exports
  `vapidConfigured`. Previously a missing `VITE_VAPID_PUBLIC_KEY` meant the client
  subscribed under a key whose private half was discarded → every server push rejected
  (403) while the UI said "Ready": a silent, total delivery failure.
  **Action still required at deploy:** set `VITE_VAPID_PUBLIC_KEY` to the public half of
  the *same* keypair whose private half is in the function's `VAPID_PRIVATE_KEY`.
- **P0 — claim-after-send** (`send-reminders/index.ts`): delivery now claims the
  `notification_log` row, sends, and **rolls the claim back if zero devices accepted**
  (`claimSend`). Before, the claim was inserted *before* sending, so any transient
  failure (429/5xx/network) permanently suppressed that reminder for the day. Re-sends
  are safe because every push carries `tag = targetKey` (the push service replaces, not
  stacks).
- **P1 — batched sends + observability** (`send-reminders/index.ts`): subscriptions are
  fetched once and grouped by member (was re-queried per item); members with no devices
  are skipped early; fan-out uses `Promise.allSettled`; non-expiry send failures are now
  logged with status/tag, and a per-run summary line is emitted.
- **P1 — `digest_time` is now a real setting**: added to client `DEFAULT_PREFS`
  (`notifyPrefs.js`) and to `NOTIFY_KEYS` (`useData.js`) so it round-trips to
  `notification_prefs`, plus a time picker in Settings → Notifications. It was a live DB
  column the server already honored, with no UI and explicitly dropped on read/write —
  everyone was locked to 08:00.
- **PWA — manifest hardening** (`public/site.webmanifest`): added `id`, `scope`,
  `categories`, and app-icon `shortcuts` (Today / Tasks / Lists / People).

## Still open — recommended next, by priority

### P1 — correctness before launch
- **Unify the two attention engines.** The server reimplements check-ins from raw
  `keep_in_touch_days` + `Date.now()` day math, while the client uses
  `followUp(lastInteraction(...))`. They will drift. Worse, "today" is device-local on
  the client but `TZ_NAME` on the server, so they disagree at day boundaries. Extract a
  shared rule module or add a contract test that runs one fixture through both and
  asserts identical output (`reminders.test.js` already covers the client half).
- **Badge vs push disagree on habits.** `badgeCount()` counts task/list/nudge/date but
  not habits; the server *does* push habit reminders. Decide whether habits count toward
  the OS badge and align both.

### P2 — scale & polish
- **Per-household timezone.** `TZ_NAME` is one global env (`America/Phoenix`, no DST,
  which conveniently masks DST bugs). Move timezone onto the household row and resolve
  per member before multi-tenant. Hard blocker for multi-household.
- **Household-scope the sender's reads.** The function `select('*')`s every table each
  tick — O(all data). Fine for one household; must be scoped before multi-tenant.
- **`notificationclick` routing** (`sw.js`): uses `WindowClient.navigate`, Chromium-only
  and may not re-route an already-open hash-router client. Consider `postMessage` to the
  client to navigate.
- **Tighten cron auth**: `auth.includes(cronSecret)` is a substring check — use exact
  `Bearer ${secret}` match.
- **"Send a real test push"** button that hits the function for just this member, to
  validate the actual VAPID→subscription→server path (today's test only calls local
  `showNotification`, which can't catch a VAPID mismatch — the exact failure class that's
  hardest to debug).

## App-wrapping strategy (decide before the big push-backend work)

This choice determines whether the existing Web Push backend survives.

| Path | iOS | Android | Push backend |
|------|-----|---------|--------------|
| **PWA only** | Works (16.4+, standalone) | Works | Keep Web Push/VAPID as-is |
| **TWA (Bubblewrap)** | n/a | Play Store; web push works through Chrome | Keep Web Push/VAPID; add `/.well-known/assetlinks.json` |
| **Capacitor** | App Store, native APNs | Play Store, native FCM | **Rewrite**: send-reminders must target FCM/APNs tokens instead of web-push endpoints |

Key constraint: a plain WKWebView iOS wrapper does **not** receive Web Push. Native iOS
distribution means Capacitor + APNs.

**Recommended near-term:** **TWA for Android + PWA on iOS.** Zero push rewrite; fix
P0/P1 once and ship. Move to Capacitor only if/when native iOS distribution is required —
and budget for the FCM/APNs migration of `send-reminders` when that day comes.

Manifest follow-ups for richer install/store UI: add `screenshots` (required by some
stores and for the richer install prompt) and consider `display_override`
(`window-controls-overlay`) for the desktop PWA.
