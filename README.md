# Salernidex

A **household operating system** for two (or more) people — the shared layer
next to the calendar. The calendar owns the *when*; Salernidex owns the shared
**who** (a warm rolodex), **to-do** (tasks, chores, projects), **to-get**
(lists), and **habits**, unified by a **Today** screen that shows exactly what
needs attention.

**Stack:** React (Vite) · Supabase (PostgreSQL + Auth + Realtime, **live**) ·
installable PWA tuned for iPhone.

**Status:** live on Supabase — per-user auth, create/join household by code,
multitenant RLS, realtime sync, and web-push are all deployed. Demo mode (no
`.env`) remains the zero-setup dev fallback. Full phase history in
[ROADMAP.md](ROADMAP.md).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

No `.env` = **demo mode**: any login works, rich sample data, everything runs
in memory — handy for dev and preview. With `.env` set, the app runs **live**
against Supabase (real accounts, household sync, push).

```sh
node scripts/tasks-smoke.mjs    # Playwright smoke suites (Chrome channel):
                                # demo-, tasks-, lists-, habit-, phase6-,
                                # phase7-, phase8-, push-, ios-, mobile-ux-…
```

## What's inside

- **Today** — greeting, due/overdue **and deferred** tasks, **Check in** (people you
  meant to stay close to — deliberately warm, never CRM-speak), birthdays & key
  dates, household activity feed. Swipe any row to snooze (per member);
  attention badges on the tab bar and app icon.
- **People** — fuzzy search, tiers (inner circle / close / network), family
  units ("The Parks"), key dates beyond birthdays, contact channels, touchpoint
  logging with keep-in-touch cadence, smart groups from tag rules (AND/OR/NOT),
  duplicate detection, soft-delete with restore, a **self** record.
- **Tasks** — one model for to-dos, recurring chores (RRULE-lite: "the 20th",
  "first Monday"), and projects with subtasks; priority, tags, due-time;
  **deferred start dates** (a task parks under Upcoming until it's due to
  surface, separate from its deadline); member-based assignees; completion
  history; people/orgs linkable to projects (the plumber on the faucet project).
- **Lists** — shared groceries/hardware/packing with rapid add, sections,
  per-item qty/assignee/note/due, and a learned catalog for fast re-add.
- **Habits** — flexible recurrence (weekday sets, "N times per week", or
  RRULE-lite for every-N-days / weekly / monthly / yearly), quick-log, streaks
  & insights, templates, per-habit sharing.
- **Reminders** — in-app attention engine (`src/lib/reminders.js`) plus
  **deployed web-push**: service worker, real subscriptions, and a
  `send-reminders` edge function (morning digest, day-of pings, dedupe) on a
  cron ([docs/phase6-reminders.md](docs/phase6-reminders.md) has the runbook).
- **Portability** — lossless JSON backup/restore (**v9**), CSV import/export
  with column mapping + duplicate review, vCard 3.0 export (person / group /
  everyone) straight into the phone's address book.
- **iOS-native feel** — bottom tab bar, sheets, swipe rows, long-press menus,
  pull-to-refresh, edge-swipe back, haptics, large titles, light/dark,
  standalone PWA chrome with safe-area handling.

## Key decisions

- **Live, demo-as-fallback.** The app runs against a real Supabase project;
  `supabase/schema.sql` mirrors the applied `supabase/migrations/`. With no
  `.env`, it falls back to in-memory demo mode for zero-setup dev/preview.
- **Multitenant by design.** Households with N members, per-user accounts, join
  codes, household switching, member-based assignment, RLS isolation by
  `household_id`.
- **Portability is a feature.** Every table rides in the backup; no lock-in.
- **Warm, not salesy.** The relationship features read like staying close to
  people you care about, never like working a pipeline.

## Deploy (Vercel / Netlify)

Build `npm run build`, output `dist/`. Without env vars the deployment runs
demo mode. To go live: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_VAPID_PUBLIC_KEY`. The VAPID **private** half never gets a `VITE_`
prefix and never goes in the deploy env — anything `VITE_*` is compiled into
the browser bundle. It belongs only in the Edge Function's secrets
(`supabase secrets set VAPID_PRIVATE_KEY=…`), with the push runbook in
[docs/phase6-reminders.md](docs/phase6-reminders.md). Migrations live in
`supabase/migrations/`; edge functions in `supabase/functions/`.
