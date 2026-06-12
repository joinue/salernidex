# Salernidex — roadmap & status

_Last updated: 2026-06-12 (Phase 7 shipped)_

**Vision:** a joint **household operating system** — the shared layer next to Apple Calendar.
You share the *when* (Calendar); this owns the shared **who** (rolodex), **to-do**
(tasks/chores/projects), and **to-get** (lists), unified by a **Today** spine.
Multitenant: any household type (couple, family, roommates), N members.

Legend: ✅ done · 🟡 partial · ⬜ not started

---

## Where we are

### ✅ Done
- **Design system** — iOS-native primitives (Avatar, grouped lists, Segmented, large titles, frosted bars), light/dark.
- **CRM heart** — interactions (touchpoints), keep-in-touch cadence, "last contacted" / overdue signals.
- **Portability** — full round-trippable JSON backup + restore; CSV people import/export. (No vendor lock-in.)
- **Today hub** — greeting, To-do (due tasks), Birthdays, Recent activity. (Needs-a-nudge moved to Phase 6 with the rest of proactive reminders.)
- **Tasks** — one model for to-dos + recurring chores + projects; **recurrence engine** (RRULE-lite: the 20th, first Monday, etc.); **completion history** (who/when, for accountability).
- **Lists** — shared household lists (groceries/etc.), rapid add, check-off, "Got it" section.
- **Gesture groundwork** — `useDrag`/`useLongPress`, haptics, SwipeRow, drag-to-dismiss sheets, pull-to-refresh, long-press action sheets.
- **Navigation** — bottom bar `Today · People · ➕ · Tasks · Lists` (capped at 5), page-aware FAB, More hub, grouped desktop sidebar.
- **Settings + members** — household name, N members (add/rename/remove, "you are"), join code, theme, leave household.
- **Multitenancy foundation** — household + member model with **member-based assignee** ("Anyone" / member); live schema designed (households, household_members, `household_id` + RLS, `join_household` RPC) in `supabase/schema.sql`.
- **Project ↔ contact bridge** — link people/orgs to a project (`task_links`, LinkEntityForm, ProjectDetail). The integration a generic to-do app can't do.
- **Activity feed** — unified household log (touchpoints + task completions + lists) at `#/activity` (`lib/activity.js`).
- **Polish (ongoing)** — logo mark, ConfirmDialog (iOS-style confirms), live duplicate detection in the add-person form (`lib/duplicates.js`).
- **Phase 7 — richer relationships** — tiers (inner circle / close / network: form picker, profile badge, People filter + "closest first" sort), contact **family units** ("The Parks": assign or create inline in the form, bidirectional family section on profiles, distinct from the household/tenant model), and **key dates** beyond birthday (annual or one-off, "N years" counting, add/remove on the profile) merged with birthdays into Today's **Dates** section. All in backup v3 + CSV (tier).
- **Phase 6a — in-app reminders** — the attention engine (`lib/reminders.js`, one pure function feeding every surface), Today's **Check in** section (warm copy — "It's been a while", never salesy/CRM language per Marc), per-member swipe-to-snooze on all attention rows (3d / 1w / never via action sheet, `reminder_snoozes` in backup v4), badges on the Today tab/sidebar + app icon (Badging API), and Settings → Notifications (per-member category toggles, FYIs off by default, date lead-time picker). Push delivery is 6b.

### 🟡 Partial
- **Reminders + notifications** — in-app layer (6a) done; **web-push delivery** (6b) waits on Supabase go-live.
- **Branding/polish** — underway, not a final pass.

### ⬜ Remaining
- **Phase 6b — push delivery**: web-push + morning digest at Supabase go-live (iOS 16.4+ installed PWA; Vibration API absent on iOS web — haptics no-op there by design). Spec in `docs/phase6-reminders.md`; live design scaffolded: snooze/prefs/subscription/dedupe tables + RLS in `supabase/schema.sql`, Edge Function skeleton in `supabase/functions/send-reminders/` (main work item: port `lib/reminders.js` server-side).
- **Phase 8 — Contact bridge**: vCard export → CardDAV, so data can flow back to the phone's address book (mitigates "phone gravity").
- **Multitenancy go-live**: real signup/login UI, join-by-code screen, household switcher, thread `household_id` into every insert. (Activates when Supabase is wired.)
- **Final polish + branding pass.**

---

## Key decisions / constraints
- **Demo-first.** Everything runs in-memory (`src/lib/demo.js`); `supabase/schema.sql` is an evolving **design doc**. NO migration is run until the app is polished and the schema is proven — then one clean migration.
- **Multitenant + per-user accounts.** Each person signs in with their own login; invite via **shareable join code**; users can **leave and join another** household and belong to several. Members are a list of **N** (not a fixed pair).
- **Portability is a feature.** Every new table goes into the backup/restore. Keep the model backend-agnostic.
- **Design law.** Consistent, space-efficient, elegant iOS, best-in-class mobile. Reuse existing primitives — no bespoke one-offs.
- **Assignee** is a stable member id (or `anyone`); legacy `me/partner/either` mapped on read (`normalizeAssignee`).

## Run it
```sh
npm install
npm run dev        # http://localhost:5173 ; no .env = demo mode (any login, in-memory)
node scripts/tasks-smoke.mjs   # + lists-smoke.mjs / demo-smoke.mjs (Playwright, Chrome channel)
```

## Recommended next
**Phase 6 (reminders + notifications)** — Today now surfaces dates and due tasks; the natural next step is making the app proactive (in-app nudge layer for keep-in-touch cadence + key dates, then web-push on the installed PWA). Alternative: **Phase 8 (vCard/CardDAV bridge)**.
