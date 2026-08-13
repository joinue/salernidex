# Salernidex — roadmap & status

> **Live** — the longer arc: what's built, what's deliberately not, and the
> standing constraints. Last updated 2026-08-13 against `main` @ c90e43a.
> For **what's in flight right now**, [`docs/next-steps.md`](docs/next-steps.md)
> is authoritative and this file defers to it.
> See [`docs/README.md`](docs/README.md) for how the docs are organized.

**Vision:** a joint **household operating system** — the shared layer next to Apple Calendar.
You share the *when* (Calendar); this owns the shared **who** (rolodex), **to-do**
(tasks/chores/projects), **to-get** (lists), **habits**, and a **notebook**, unified by a
**Today** spine. Multitenant: any household type (couple, family, roommates), N members.

Legend: ✅ done · 🟡 partial · ⬜ not started

---

## Status in one line

**The app is live and in daily use.** The full multitenant stack runs against a real
Supabase project: per-user auth, create/join household by code, household switching,
`household_id` + RLS scoping on every write, realtime sync, and deployed edge functions
(`send-reminders`, `delete-account`). Migrations `0001→0033` are applied. **Reminders run
unattended** as of 2026-08-06: web push reached a real phone from the real Edge Function,
and a `pg_cron` sweep now invokes it every 15 minutes. Demo mode (no `.env`) remains the
zero-setup dev/preview fallback, not the primary target.

---

## Where we are

### ✅ Done

**The four pillars**

- **People** — fuzzy search, **tiers** (inner circle / close / network) with filter and "closest first" sort, **family units** ("The Parks", bidirectional), **key dates** beyond birthday, contact channels, smart groups from tag rules (AND/OR/NOT), live duplicate detection, soft-delete with restore, and a **self** record.
- **Organizations & relationships** — orgs as first-class records ([`OrgsView`](src/features/people/OrgsView.jsx), [`lib/orgs.js`](src/lib/orgs.js)), person↔person relationships ([`RelationshipsView`](src/features/people/RelationshipsView.jsx)), and person↔org **affiliations** (migration `0033`).
- **People map** — contacts geocoded and plotted ([`PeopleMap`](src/features/people/PeopleMap.jsx), [`lib/geocode.js`](src/lib/geocode.js), Leaflet; migration `0027`).
- **Tasks** — one model for to-dos + recurring chores + projects with subtasks; **recurrence engine** (RRULE-lite: the 20th, first Monday, …); **completion history** (who/when); priority, tags, due-time, member-based assignees; **natural-language quick-add** ([`lib/taskParse.js`](src/lib/taskParse.js) — "take the trash out every monday").
- **Deferred / two-axis dates** — `start_date` parks a task under Upcoming until it's due to surface ("Starts …"), separate from the deadline. Wired through `isDeferred`/`taskBucket` in [`lib/tasks.js`](src/lib/tasks.js). Optional, so the plain one-tap to-do is unchanged.
- **Projects** — split out from Tasks as their own index ([`ProjectsView`](src/features/tasks/ProjectsView.jsx)) with a **template pool** ([`ProjectTemplatePicker`](src/features/tasks/ProjectTemplatePicker.jsx)); migration `0028`. A project can scope lists to itself (`project_id`), and the list says so and links back, so the relationship reads from either end.
- **Lists** — shared groceries/hardware/packing, rapid add, check-off, "Got it" section; list types + sections, per-item qty/assignee/note/due, aisle ordering ([`lib/aisles.js`](src/lib/aisles.js)), per-list colour (`0031`), and a learned **catalog** for fast re-add.
- **Habits** — flexible recurrence (weekday sets, "N times per week", RRULE-lite for every-N-days / weekly / monthly-by-date-or-weekday / yearly), quick-log, streaks + insights ([`HabitInsightsView`](src/features/habits/HabitInsightsView.jsx)), templates, per-habit sharing, entry notes. Wired into the rest of the app rather than sitting beside it: findable in Quick Find, logged into the activity feed, mentionable in notes with backlinks of their own, and present in the attention engine. What today asks of a habit is decided once, in `habitsScheduledToday` / `habitsDueToday` ([`lib/habits.js`](src/lib/habits.js)), which Today and the engine both read.
- **Notebook** — rich text with entity **@-mentions** across seven types (person, organization, group, project, list, task, habit), each with a backlink surface — the five detail pages, plus habits on their own page and a plain task inside the sheet it's edited in, so no mention is one-way. Soft delete, a two-pane desktop rail with keyboard navigation, and sort prefs ([`lib/notes.js`](src/lib/notes.js); migrations `0029`, `0030`).

**The spine**

- **Today hub** — greeting, To-do (due/overdue + deferred), **Check in**, Dates (birthdays + key dates), and recent activity (collapsible on a phone).
- **Quick Find** — keyboard-driven search across everything, with match highlighting ([`QuickFind`](src/components/shell/QuickFind.jsx), [`lib/quickFind.js`](src/lib/quickFind.js)). *Previously listed here as unbuilt "Things polish" — it shipped.* Coverage is the contract, not the ranking, and [`quickFind.test.js`](src/lib/quickFind.test.js) pins it: every entity type, every index page, every create action.
- **Activity feed** — unified household log (touchpoints + task completions + habit check-ins + lists) at `#/activity` ([`lib/activity.js`](src/lib/activity.js)).
- **Reminders — in-app + push** — one attention engine ([`lib/reminders.js`](src/lib/reminders.js)) feeding every surface, Today's **Check in** (warm copy, never CRM-speak), per-member swipe-to-snooze (3d / 1w / never), app-icon + tab badges (Badging API), and Settings → Notifications (per-member category toggles, FYIs off by default, date lead-time). Web-push delivery is **deployed and proven**: service worker, real subscriptions that self-heal across a VAPID key change ([`lib/push.js`](src/lib/push.js)), and the `send-reminders` Edge Function with constant-time bearer auth ([`auth.ts`](supabase/functions/send-reminders/auth.ts)).
- **Privacy** — "Private — only me" rows enforced once at the data layer and again by RLS, so every view, export, badge, and reminder inherits it ([`lib/privacy.js`](src/lib/privacy.js); migration `0023`).

**Platform**

- **Multitenancy** — per-user signup/login/reset/recover ([`AuthScreen`](src/features/auth/AuthScreen.jsx)), create-or-join-by-code onboarding via the `create_household` / `join_household` RPCs ([`Onboarding`](src/features/auth/Onboarding.jsx)), household switcher across memberships ([`useHousehold`](src/hooks/useHousehold.js)), `household_id` stamped on every insert with RLS rejecting unscoped rows, realtime re-hydration.
- **Account lifecycle** — `delete-account` edge function (full account + data removal); household leave/lifecycle.
- **Portability** — round-trippable JSON backup + restore (**v10**); CSV people import/export with column mapping + duplicate review; **vCard 3.0** export (person / group / everyone) with stable UIDs; **calendar export** — a task out as RFC 5545 `.ics`, or a deep link into Google/Outlook, all client-side with no OAuth ([`lib/calendar.js`](src/lib/calendar.js)).
- **Offline — Tier 1** — read-only cache so the app opens and reads without a network ([`lib/offlineCache.js`](src/lib/offlineCache.js)). **Writes are not queued** and an offline write is silently lost; Tier 2 is a live decision, see [next-steps §2c](docs/next-steps.md).
- **Design system + code structure** — the 2026-08-04 review ([`docs/records/ui-ux-review.md`](docs/records/ui-ux-review.md)) produced [`CONVENTIONS.md`](CONVENTIONS.md) as the rulebook, a `ui/shell/features` source layout, `#/kitchen-sink` (dev only) as the primitive reference, and `npm run audit:mobile`, which **fails the build** on a re-introduced occlusion or an undersized tap target.
- **iOS feel** — standalone PWA chrome, edge-swipe back (content tracks the finger), gestures tuned for real fingers, chrome that stands down while the keyboard is up, visual-viewport sizing, Add-to-Home-Screen hint, 16px inputs (no focus zoom), `enterkeyhint`/`inputMode`.
- **Test + CI** — Vitest with jsdom component testing alongside the pure-logic suites, Playwright smoke scripts, ESLint + Prettier, CI on Node 22, zero known dependency vulnerabilities.

### 🟡 Partial

- **Reminder go-live** — the sweep is scheduled and running, but one dead June subscription still fails every send, and `pushToSubs()` doesn't prune on Apple's `400 VapidPkHashMismatch`, so dead subscriptions accumulate. [next-steps §1b](docs/next-steps.md).
- **Task areas** — the front door exists (area pills + filter in Tasks, picker in the form) but not the managed table, counts, or per-area behaviour. [`docs/scopes/task-areas.md`](docs/scopes/task-areas.md).
- **Real-usage hardening** — the live stack runs end to end, but RLS and realtime want more day-to-day, multi-account mileage.
- **Branding / final polish** — ongoing, not a final pass.

### ⬜ Remaining

- **Per-member timezone** — `TZ_NAME` is one hardcoded zone for the whole system, so "today" is Arizona's for everyone. **Blocks selling outside Arizona**, and it's schema work that must land before any App Store binary exists. [next-steps §2a](docs/next-steps.md).
- **Native iOS / iPadOS / watchOS** — decision reached: **native SwiftUI**, keeping the React web app and Supabase unchanged; explicitly *not* Capacitor or a WebView wrapper. Bound to the web implementation by a shared cross-language test-vector corpus rather than shared code. First step is extracting that corpus. [next-steps §3](docs/next-steps.md).
- **Offline Tier 2** — durable queued writes, plus `updated_at` guarding so a stale queued write can't clobber a newer one. **Table stakes, not polish:** Superlist ships an offline-first engine, so a competitor in this category treats a lost write as a bug.
- **Notebook tier 2** — note-to-note links, search match highlighting, multi-select, rail/Back behaviour. All four unbuilt. [`docs/scopes/notes.md`](docs/scopes/notes.md).
- **Attention-engine unification** — the client and the Edge Function still re-derive the same rules separately and will drift; they want a shared module rather than a port. The contract tests are the current guard ([`badge.parity.test.ts`](supabase/functions/send-reminders/badge.parity.test.ts) and the `*.parity.test.ts` siblings). *The habit half is settled:* habits are now attention items on the client too, at the ambient `soft` tier — they reach Today and share the Edge Function's `habit:<id>` snooze key, but never the red count, and a parity test pins that so promoting them has to be a deliberate act.
- **CardDAV sync** — live two-way address-book sync. Needs a CardDAV server; weigh it against what vCard export already covers.
- **Attachments** — images and PDFs on a task, list item, or note. Supabase Storage is already proven for avatars ([`avatarStorage.js`](src/lib/avatarStorage.js)) but nothing else; the work is the privacy/RLS inheritance, signed URLs, and keeping the backup format honest. The most household-shaped gap we have — "get *this* one" is a photo. [`docs/scopes/competitive-superlist.md`](docs/scopes/competitive-superlist.md) §3b.
- **Multi-select + bulk actions** — none anywhere today. One selection mode shared across Tasks, Lists, Notes, and People. The cost is gesture collision: long-press already belongs to [`ReorderableList`](src/components/ui/ReorderableList.jsx), so it resolves once in [`lib/gestures.js`](src/lib/gestures.js), not per-view. [competitive-superlist §3c](docs/scopes/competitive-superlist.md).
- **Polish still worth stealing** — the Things check-off animation, and calendar events inline in Today. The calendar half wants **EventKit on native**, not an OAuth stack for the web ([competitive-superlist §3d](docs/scopes/competitive-superlist.md)).

**Two open product questions** — both answerable without code, and 4b has a schema
consequence, so it must be settled *before* an App Store binary exists:

- **Is an item commentable?** We have an activity log, not a reply surface. Whether "which brand?" belongs in the app or in the text thread the household already has. [competitive-superlist §4a](docs/scopes/competitive-superlist.md).
- **Is household membership the only permission boundary?** Today a join code grants everything, including the rolodex — there's no way to hand one list to a house-sitter. [competitive-superlist §4b](docs/scopes/competitive-superlist.md).

---

## Key decisions / constraints

- **Live, demo-as-fallback.** The app runs against a real Supabase project; `supabase/schema.sql` mirrors the applied `migrations/` (`0001→0033`). With no `.env`, it falls back to in-memory **demo mode** ([`lib/demo.js`](src/lib/demo.js)) for zero-setup dev/preview.
- **Multitenant + per-user accounts.** Each person signs in with their own login; invite by **shareable join code**; users can leave and join another household, and belong to several. Members are a list of **N**.
- **Portability is a feature.** Every table rides in the backup/restore (now v10). Keep the model backend-agnostic.
- **Design law.** Consistent, space-efficient, elegant iOS, best-in-class mobile. Reuse existing primitives — no bespoke one-offs. [`CONVENTIONS.md`](CONVENTIONS.md) is the enforceable form of this.
- **Assignee** is a stable member id (or `anyone`); legacy `me/partner/either` mapped on read (`normalizeAssignee`).
- **Warm, not salesy.** Relationship features read like staying close to people you care about, never working a pipeline.
- **Schema changes are cheap now and expensive after an App Store binary exists.** Old clients live on phones for months. Additive, idempotent, expand/contract only.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
                   # no .env  → demo mode (any login, in-memory)
                   # with .env → live Supabase (real auth + sync)
npm test           # Vitest (unit + jsdom component)
npm run audit:mobile   # fails on occlusion / undersized tap targets
node scripts/tasks-smoke.mjs   # + lists- / demo- / habit- / push- / ios- / mobile-ux- smoke
```

To run live, set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_VAPID_PUBLIC_KEY`. **The VAPID private key must never carry a `VITE_` prefix** —
that prefix is what compiles a value into the browser bundle. It belongs in the Supabase
function secrets only; the full env layout is in
[next-steps § Reference](docs/next-steps.md). Migrations live in `supabase/migrations/`;
edge functions in `supabase/functions/`.

## Recommended next

The reminder sweep is scheduled, so the attention engine now earns its keep unattended.

Next is **durable offline writes**. [`sync()`](src/hooks/useData.js) is optimistic plus
fire-and-forget: on failure it toasts and calls `refresh()`, which snaps local state back
to the server's and discards what the user typed. That fails hardest in the app's most
characteristic moment — adding to the grocery list in a shop with no signal — and it's
the gate on trusting any "real-usage hardening" evidence, since lost writes are
indistinguishable from sync bugs. It's well-contained: all 60 write paths funnel through
that one function. Do the `updated_at` guard at the same time.

Then **per-member timezone**, which blocks selling outside Arizona and gets harder the
moment a native binary is in the field. It touches the same code where the client and the
Edge Function separately re-derive "what is today", so extract that shared rule while
you're in there.

After that it's a real fork: harden and monetize the web app, or start `SalernidexCore`
and the vector corpus for native. The corpus is worth extracting either way — it turns
the existing logic suites into an executable spec and makes client/server drift
checkable, with or without Swift.
