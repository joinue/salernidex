# Phase 6 — Reminders & notifications (agreed scope)

> **Record** — historical. Agreed 2026-06-12; 6a shipped 2026-06-12, 6b shipped
> 2026-08-06.
> **This is no longer the push runbook.** The §6b "Go-live runbook (the only
> remaining 6b work)" section ran on 2026-08-06 — a real push reached a real
> phone from the deployed Edge Function. For the *current* state of the reminder
> stack and what's left (the unscheduled `pg_cron` sweep, dead-subscription
> pruning, the `service_role` rotation), see
> [next-steps.md](../next-steps.md).
> Kept for the locked product decisions in "Decisions (locked)" — the snooze
> scope, the four categories and their defaults, and the "Check in" naming — all
> of which still govern the app.

_Agreed 2026-06-12 (Marc + Claude). Build 6a demo-first; 6b activates with Supabase._
_**6a shipped 2026-06-12.** One naming change from this spec: the section is
"Check in" with warm copy ("It's been a while", "say hi"), never "Needs a
nudge" — Marc cut that framing as too salesy. Internal kind stays 'nudge'._

## Decisions (locked)

- **Surface:** Today is the only reminder surface — no separate inbox. Count
  badges on the Today tab and (installed PWA) the app icon via the Badging API.
- **Snooze scope:** per member. Your snooze/dismiss never hides an item for
  your partner.
- **Categories (all four, each with a Settings toggle):**
  1. Tasks due/overdue — on by default
  2. Keep-in-touch nudges (cadence overdue / never contacted) — on by default
  3. Birthdays & key dates (lead-time heads-up + day-of) — on by default
  4. Partner activity FYIs — **off by default** (noise risk)
- **Push:** 6a ships fully in-app with a push-ready data model. Real web push
  (service worker, subscriptions, scheduler, morning digest) ships at Supabase
  go-live as 6b. No dormant push scaffolding before then.

## 6a — the in-app attention layer (build now)

### Engine: `src/lib/reminders.js`
One pure function every surface reads from:

```
buildAttention(data, prefs, snoozes, memberId) -> [{
  kind: 'task' | 'nudge' | 'date' | 'fyi',
  key,            // stable id for snooze tracking
  urgency,        // overdue | today | upcoming
  person?, task?, entry?,   // the underlying record(s)
  due,            // ISO date driving sort
}]
```

- Tasks: top-level, not completed, bucket overdue/today (reuses `taskBucket`).
- Nudges: `followUp()` state `overdue` or `never` (cadence set, nothing logged).
- Dates: `upcomingDates()` filtered to `daysUntil === 0 || daysUntil <= lead`.
- FYIs: head of `buildActivityFeed` by other members, last 24h, category off
  by default.
- Drops anything snoozed (`until > now`) or dismissed for this member.
- Badge count = items with urgency overdue/today, snoozes respected.

### Today changes
- **Needs a nudge** section returns (between To-do and Dates): avatar, "30d
  cadence · last contact 45d ago" (or "never contacted"), one-tap log button.
- All attention rows (To-do, Nudge, Dates) become SwipeRows:
  - right action **Done / Log it** (task complete / open InteractionForm)
  - left actions **Snooze** (3d / 1w via ActionSheet) and **Dismiss**
  - long-press action sheet mirrors the same actions (discoverability on touch)
- Dates rows honor the lead-time pref instead of the hard-coded 30 days; day-of
  rows pin to the top of the section.

### Badges
- Tab bar: count pill on Today (MobileNav) and sidebar item (desktop).
- `navigator.setAppBadge(count)` when installed (feature-detected, silent no-op
  otherwise — iOS 16.4+ supports it for installed web apps).
- Update on every data/snooze/pref change.

### Persistence (demo-first, in backup v4)
- `reminder_snoozes` table (schema design doc + in-memory demo):
  `{ id, member_id, kind, target_key, until (null = dismissed forever),
  created_at }`. Snooze rows are per member; cleanup: rows older than 90d with
  expired `until` can be pruned on load.
- Prefs in the household settings payload (localStorage now, per-member):
  `{ tasks: true, nudges: true, dates: true, fyi: false, dates_lead_days: 7 }`.
- Both go into the JSON backup (`reminder_snoozes`, `settings.notifications`)
  → **BACKUP_VERSION 4**.

### Settings → Notifications
New grouped section: four category toggles, date lead-time picker
(3 / 7 / 14 days), and a disabled "Push notifications — arrives with accounts"
row so the future is visible.

### Out of scope for 6a
Quiet hours, per-date custom lead times, email, web-push delivery, notification
history/inbox.

### Test plan
`scripts/phase6-smoke.mjs`: nudge section shows David (30d cadence, 45d ago)
and Tom (never contacted); snooze hides an item and survives the engine
rebuild; badge count matches visible overdue/today items; toggling a category
off empties its section; lead-time change moves a date in/out of view;
backup round-trips snoozes. Plus the four existing suites.

## 6b — push delivery (at Supabase go-live)

**Scaffolded 2026-06-12** — the live design is written down, nothing deployed:

- `supabase/schema.sql` (Phase 6 section): `reminder_snoozes`,
  `notification_prefs`, `push_subscriptions`, `notification_log` (send-dedupe),
  all per-member via `household_members(id)` with own-rows RLS
  (`is_own_member()`), realtime on snoozes/prefs, and the pg_cron schedule.
- `supabase/functions/send-reminders/index.ts`: Edge Function skeleton —
  service-role auth, the 4-step pipeline (load members/prefs/snoozes →
  recompute attention server-side → dedupe via notification_log → VAPID send
  with dead-endpoint pruning). The attention recompute is the port of
  `src/lib/reminders.js` and is the main 6b work item.

**Update 2026-06-12 — 6b is now code-complete.** Everything below is built and
in the repo; only deployment against a live project remains:

- `public/sw.js` — push display + notification click-through (deep links into
  the app, reuses an open window). Deliberately no offline caching. Registered
  on app load from `main.jsx`.
- `src/lib/push.js` — support detection (including the iOS install-first
  case), permission flow, real push-subscription creation against the
  browser's push service, demo/live storage, test notifications.
- Settings → Notifications → **This device**: Enable notifications → "Ready —
  delivery starts at launch", with **Send a test notification** (works today,
  fully local) and turn-off. iPhones not yet installed to the Home Screen get
  the Add-to-Home-Screen hint instead.
- `supabase/functions/send-reminders/index.ts` — full implementation: loads
  members/prefs/snoozes/data, recomputes attention server-side (same rules and
  the same warm copy as `lib/reminders.js`), claims items in
  `notification_log` (idempotent across runs), morning digest at each member's
  digest_time ±15 min, individual pings for day-of dates and due/overdue
  tasks only (check-ins ride the digest — "say hi" never interrupts a day),
  dead-subscription pruning.
- Dev VAPID public key committed for local subscribe-flow testing; its
  private half was discarded. Go-live uses a fresh pair.

**Update 2026-06-14 — time-of-day + priority (migrations 0013 / 0014).** Tasks
gained an optional `due_time` (all-day vs timed, like Apple Reminders) and a
`priority` flag (None/Low/Med/High). What this changes for reminders:

- A **timed** task fires its individual push at `due_time` (the first cron tick
  at/after it; `notification_log` still guarantees once per day). Until its time
  arrives it only rides the morning digest as a heads-up — no early ping. All-day
  and overdue tasks are unchanged (eligible right away).
- The **digest lead** is ordered highest-priority first, so the 3 names shown in
  the summary favor what's flagged.
- `due_time` survives recurrence roll-forward; no schema work beyond 0013/0014,
  which are reflected in `schema.sql` for fresh installs.

### Go-live runbook (the only remaining 6b work)

1. Apply `supabase/schema.sql` top-to-bottom as one migration. Restoring demo
   data afterwards? Map the localStorage member ids (`m-1`, `m-2`) in
   `tasks.assignee`, `task_completions.completed_by`, and
   `reminder_snoozes.member_id` to the real `household_members` uuids
   **before** running the commented assignee/completed_by column conversions.
2. `npx web-push generate-vapid-keys` → set `VITE_VAPID_PUBLIC_KEY` in the
   deploy env; private key to function secrets.
3. `supabase functions deploy send-reminders`
4. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:marc@joinue.com TZ_NAME=America/Phoenix`
5. Run the `cron.schedule('send-reminders', '*/15 * * * *', …)` block from
   schema.sql (enable the pg_cron + pg_net extensions first).
6. On each phone: install the PWA (iOS: Share → Add to Home Screen), then
   Settings → Notifications → Enable → Send a test notification.
7. Wait for the next morning's digest; check `notification_log` rows appeared.

- iOS: requires installed PWA (16.4+); manifest + icons already shipped.
