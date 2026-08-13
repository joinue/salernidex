# Cross-surface coherence review — 2026-08-13

> **Record** — true on its date, against `main` @ `e4c8243` plus the working tree
> of that day. Not a to-do list: everything below shipped in the same session.
> See [`docs/README.md`](../README.md) for how the docs are organized.

The question asked was narrow and worth repeating periodically: *do the different
areas of the app work with each other in logical ways?* Not "does each feature
work" — the suites answer that — but whether the seams between them hold.

## What held

The spine is genuinely integrated, and the review is worth recording partly to
say so:

- **One data layer.** [`useData`](../../src/hooks/useData.js) is the single
  source; privacy is enforced once in [`lib/privacy.js`](../../src/lib/privacy.js)
  and every view, search, export, badge and reminder inherits it. The `all*`
  arrays bypass it for the lossless backup only.
- **One attention engine.** [`buildAttention`](../../src/lib/reminders.js) feeds
  Today, the tab badge, the sidebar and the app icon, and `App.jsx` passes it the
  same options `TodayView` uses, so the count can't disagree with the list under
  it.
- **Real cross-entity linking.** Polymorphic `task_links` put tasks on person /
  org / group pages; `project_id` scopes lists to projects; note mentions produce
  backlinks; the activity feed serves both Today and `#/activity`.

## What didn't, and what was done

Six seams failed, all of them the same shape: a feature that works perfectly on
its own page and is invisible from everywhere else.

1. **Habits were an island with a tab slot.** Absent from Quick Find, from the
   activity feed, from the attention engine, and unmentionable in notes — while
   the Edge Function was already sending per-habit pushes. Now indexed, logged,
   mentionable, and an attention item at the `soft` tier (see below).
2. **No way to create a note from the ➕.** The mobile add sheet listed eight
   types and none was Note, and because `notes` wasn't in the FAB's `primary`
   map, tapping ➕ *on the notebook* opened that same eight-item menu. Note is in
   both now, plus a "New note" action in Quick Find.
3. **Today's habit rows went to the wrong place** — the Habits index rather than
   the habit, while every other row on the page opens the thing itself.
4. **List → project was one-way.** A project attached lists; the list said
   nothing about the project and offered no way back.
5. **Mentions outran backlinks.** Six mentionable types, five backlink surfaces;
   a plain task has no page, so mentioning one was write-only. Its backlinks now
   live in the sheet it's edited in — the only surface it has.
6. **Quick Find's page list was stale** — no Notes, Habits or Projects, so ⌘K
   couldn't reach three of the app's own destinations by name.

## The one real decision

**Habits are attention items, but never in the red count.** They ride the `soft`
tier alongside relationship check-ins.

The alternative was to count them like tasks, which would match what push already
sends. It was rejected for the reason `soft` exists at all: with four daily
habits the badge would read at least 4 every morning until they were logged, and
a count that never reaches zero stops being read. Habits still gain everything
else from being in the engine — one definition of "scheduled and not done"
(`habitsScheduledToday` / `habitsDueToday`), and the Edge Function's
`habit:<id>` snooze key, so snoozing one in-app also silences its push.

This is a contract, not a preference, so it is pinned in
[`badge.parity.test.ts`](../../supabase/functions/send-reminders/badge.parity.test.ts):
habits present, habits enabled, badge unmoved — and an assertion that they really
are in the engine, so the test can't pass for the wrong reason.

## What this suggests for next time

The recurring failure mode is that **adding a pillar doesn't add its wiring**.
Habits and Notes both shipped complete and both missed the same five registries:
Quick Find's index, Quick Find's `NAV`/`ACTIONS`, the add sheet, the activity
feed, and the mention types. None of those omissions breaks a test or throws — the
feature simply can't be reached from anywhere else, which reads as "not built".

[`quickFind.test.js`](../../src/lib/quickFind.test.js) now asserts coverage rather
than ranking, which catches two of the five. The remaining gap is that the route
table lives in `App.jsx` as a private constant, so nothing can check the register
of destinations against it automatically. Extracting it would make that
invariant testable; it was left alone here to avoid colliding with the in-flight
scroller work.

## Unrelated finding

`node scripts/ios-smoke.mjs` fails its edge-swipe-back assertion
(`#/person/p-nina → #/person/p-nina — worked: false`). Verified against a clean
worktree at `e4c8243`: **it fails there too**, so it predates both this review
and the scroller refactor in flight the same day. The script also hardcodes
`http://localhost:5173` and ignores an argv base URL, which is what made the
provenance non-obvious. Not investigated further here.
