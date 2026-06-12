# Salernidex

A **household operating system** for two (or more) people — the shared layer
next to the calendar. The calendar owns the *when*; Salernidex owns the shared
**who** (a warm rolodex), **to-do** (tasks, chores, projects), and **to-get**
(lists), unified by a **Today** screen that shows exactly what needs attention.

**Stack:** React (Vite) · Supabase (PostgreSQL + Auth + Realtime, design-doc
stage) · installable PWA tuned for iPhone.

Status and phase history live in [ROADMAP.md](ROADMAP.md). Currently: all
demo-buildable phases (1–8a) are done; next milestone is go-live.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

No `.env` = **demo mode**: any login works, rich sample data, everything runs
in memory. This is the primary development mode — see "Demo-first" below.

```sh
node scripts/tasks-smoke.mjs    # Playwright smoke suites (Chrome channel):
                                # demo-, tasks-, lists-, phase6-, phase7-,
                                # phase8-, push-, ios-, mobile-ux-…
```

## What's inside

- **Today** — greeting, due/overdue tasks, **Check in** (people you meant to
  stay close to — deliberately warm, never CRM-speak), birthdays & key dates,
  household activity feed. Swipe any row to snooze (per member); attention
  badges on the tab bar and app icon.
- **People** — fuzzy search, tiers (inner circle / close / network), family
  units ("The Parks"), key dates beyond birthdays, touchpoint logging with
  keep-in-touch cadence, smart groups from tag rules (AND/OR/NOT), duplicate
  detection, soft-delete with restore.
- **Tasks** — one model for to-dos, recurring chores (RRULE-lite: "the 20th",
  "first Monday"), and projects with subtasks; member-based assignees;
  completion history; people/orgs linkable to projects (the plumber on the
  faucet project).
- **Lists** — shared groceries/hardware/packing with rapid add and check-off.
- **Reminders** — in-app attention engine (`src/lib/reminders.js`) shipping
  now; web-push (service worker, subscriptions, morning digest) is
  code-complete and deploys at go-live
  ([docs/phase6-reminders.md](docs/phase6-reminders.md) has the runbook).
- **Portability** — lossless JSON backup/restore (v4), CSV import/export with
  column mapping + duplicate review, vCard 3.0 export (person / group /
  everyone) straight into the phone's address book.
- **iOS-native feel** — bottom tab bar, sheets, swipe rows, long-press menus,
  pull-to-refresh, edge-swipe back, haptics, large titles, light/dark,
  standalone PWA chrome with safe-area handling.

## Key decisions

- **Demo-first.** `supabase/schema.sql` is an evolving design doc — no
  migration runs until go-live, then one clean migration. The JSON backup is
  the demo→live data path.
- **Multitenant by design.** Households with N members, join codes,
  member-based assignment. Live RLS model is designed in the schema.
- **Portability is a feature.** Every table rides in the backup; no lock-in.
- **Warm, not salesy.** The relationship features read like staying close to
  people you care about, never like working a pipeline.

## Deploy (Vercel / Netlify)

Build `npm run build`, output `dist/`. Without env vars the deployment runs
demo mode. To go live: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_VAPID_PUBLIC_KEY`, plus the go-live runbook in
[docs/phase6-reminders.md](docs/phase6-reminders.md).
