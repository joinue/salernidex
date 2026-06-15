# Salernidex — roadmap & status

_Last updated: 2026-06-14 (live on Supabase; habits + deferred-tasks shipped)_

**Vision:** a joint **household operating system** — the shared layer next to Apple Calendar.
You share the *when* (Calendar); this owns the shared **who** (rolodex), **to-do**
(tasks/chores/projects), **to-get** (lists), and **habits**, unified by a **Today** spine.
Multitenant: any household type (couple, family, roommates), N members.

Legend: ✅ done · 🟡 partial · ⬜ not started

---

## Status in one line

**The app is live.** Supabase is wired and the full multitenant stack runs against a real
project: per-user auth, create/join household by code, household switching, `household_id` +
RLS scoping on every write, realtime sync, and deployed edge functions (`send-reminders`,
`delete-account`). The 0001→0026 migrations are applied. Demo mode (no `.env`) remains as the
zero-setup dev/preview fallback, not the primary target.

---

## Where we are

### ✅ Done
- **Design system** — iOS-native primitives (Avatar, grouped lists, Segmented, large titles, frosted bars), light/dark.
- **CRM heart** — interactions (touchpoints), keep-in-touch cadence, "last contacted" / overdue signals.
- **Today hub** — greeting, To-do (due/overdue + deferred), **Check in**, Dates (birthdays + key dates), recent activity.
- **Tasks** — one model for to-dos + recurring chores + projects with subtasks; **recurrence engine** (RRULE-lite: the 20th, first Monday, etc.); **completion history** (who/when); priority, tags, due-time, and member-based assignees.
- **Deferred / two-axis dates (the Things idea, now shipped)** — a task's `start_date` parks it under Upcoming until it's due to surface ("Starts …"), separate from the deadline. Wired through `isDeferred`/`taskBucket` in [`src/lib/tasks.js`](src/lib/tasks.js), the Overdue/Today/Upcoming/Someday grouping, and the form. Optional, so the plain one-tap to-do is unchanged.
- **Lists** — shared household lists (groceries/hardware/packing), rapid add, check-off, "Got it" section; list types + sections, per-item qty/assignee/note/due, and a learned **list catalog** for fast re-add.
- **Habits** — full habit tracker: flexible recurrence (weekday sets, "N times per week", and RRULE-lite for every-N-days / weekly / monthly-by-date-or-weekday / yearly), quick-log, streaks + insights ([`HabitInsightsView`](src/components/HabitInsightsView.jsx)), templates, per-habit sharing, entry notes.
- **Portability** — full round-trippable JSON backup + restore (**v9**); CSV people import/export with column mapping + duplicate review; **vCard 3.0 export** (person / group / everyone) with stable UIDs straight into the phone's address book.
- **People** — fuzzy search, **tiers** (inner circle / close / network) with filter + "closest first" sort, **family units** ("The Parks", bidirectional), **key dates** beyond birthday, contact channels, smart groups from tag rules (AND/OR/NOT), live duplicate detection, soft-delete with restore, a **self** person record.
- **Project ↔ contact bridge** — link people/orgs to a project (`task_links`, LinkEntityForm, ProjectDetail). The integration a generic to-do app can't do.
- **Activity feed** — unified household log (touchpoints + task completions + lists) at `#/activity` (`lib/activity.js`).
- **Reminders — in-app + push (live)** — the attention engine (`lib/reminders.js`, one pure function feeding every surface), Today's **Check in** (warm copy, never CRM-speak), per-member swipe-to-snooze (3d / 1w / never, `reminder_snoozes`), app-icon + tab badges (Badging API), and Settings → Notifications (per-member category toggles, FYIs off by default, date lead-time). **Web-push delivery is deployed:** service worker + real subscriptions on the client, `send-reminders` edge function (morning digest, day-of pings, dedupe, dead-sub pruning) on a cron.
- **Multitenancy (live)** — per-user signup/login/reset/recover ([`AuthScreen`](src/components/AuthScreen.jsx)), create-or-join-by-code onboarding via the `create_household` / `join_household` RPCs ([`Onboarding`](src/components/Onboarding.jsx)), household switcher across memberships ([`useHousehold`](src/hooks/useHousehold.js), Settings + People hub), `household_id` stamped on every insert with RLS rejecting unscoped rows, realtime re-hydration.
- **Account lifecycle** — `delete-account` edge function (full account + data removal); household leave/lifecycle.
- **iOS polish pass** — standalone PWA chrome, **edge-swipe back** (content tracks the finger), Add-to-Home-Screen hint, 16px touch inputs (no focus zoom), `enterkeyhint`/`inputMode` hints. Verified by `scripts/ios-smoke.mjs`.

### 🟡 Partial
- **Real-usage hardening** — the live stack runs end-to-end, but RLS policies and realtime sync want more day-to-day, multi-account mileage to shake out edge cases.
- **Branding / final polish** — ongoing, not a final pass.

### ⬜ Remaining
- **Phase 8b — CardDAV sync**: live two-way address-book sync (needs a CardDAV server — weigh whether the recurring vCard export already covers the value before building this).
- **Things polish still worth stealing** (lower priority than the date model, which is now done): the check-off animation, calendar events inline in Today, keyboard-driven Quick Find.
- **Final polish + branding pass.**

---

## Key decisions / constraints
- **Live, demo-as-fallback.** The app runs against a real Supabase project; `supabase/schema.sql` mirrors the applied `migrations/` (0001→0026). With no `.env`, it falls back to in-memory **demo mode** (`src/lib/demo.js`) for zero-setup dev/preview.
- **Multitenant + per-user accounts.** Each person signs in with their own login; invite via **shareable join code**; users can **leave and join another** household and belong to several. Members are a list of **N**.
- **Portability is a feature.** Every table rides in the backup/restore (now v9). Keep the model backend-agnostic.
- **Design law.** Consistent, space-efficient, elegant iOS, best-in-class mobile. Reuse existing primitives — no bespoke one-offs.
- **Assignee** is a stable member id (or `anyone`); legacy `me/partner/either` mapped on read (`normalizeAssignee`).
- **Warm, not salesy.** Relationship features read like staying close to people you care about, never working a pipeline.

## Run it
```sh
npm install
npm run dev        # http://localhost:5173
                   # no .env  → demo mode (any login, in-memory)
                   # with .env → live Supabase (real auth + sync)
node scripts/tasks-smoke.mjs   # + lists- / demo- / habit- / push- / ios- smoke (Playwright, Chrome channel)
```

To run live, set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`
(and `VITE_VAPID_PRIVATE_KEY` for the reminder function). Migrations live in
`supabase/migrations/`; the push runbook is in `docs/phase6-reminders.md`.

## Recommended next
The go-live backlog is done — the household can run the app from their phones today. The
highest-leverage remaining work is **real-usage hardening** (live RLS/realtime under daily,
multi-account use) plus the small Things-style UI polish above. CardDAV (8b) is the only
sizable unbuilt feature, and only if recurring vCard export proves insufficient.
