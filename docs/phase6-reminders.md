# Phase 6 — Reminders & notifications (agreed scope)

_Agreed 2026-06-12 (Marc + Claude). Build 6a demo-first; 6b activates with Supabase._

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

Still to build at go-live:

- Service worker + permission flow (asked from Settings, never on launch);
  subscribe with `VITE_VAPID_PUBLIC_KEY` and store in `push_subscriptions`.
- The attention recompute inside the Edge Function + pg_cron schedule.
- **Morning digest** (default 8:00, per member): one notification summarizing
  the day ("3 things today: trash, Nina's birthday in 2d, call David") instead
  of a stream of pings. Individual day-of pushes only for day-of dates and
  overdue-today tasks; lead-time heads-ups stay in-app only.
- iOS: requires installed PWA (16.4+); manifest + icons already shipped.
