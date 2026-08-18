# Docs — what's here and how to read it

Every document in this repo is one of four kinds. The kind tells you whether the
document is supposed to be **true right now** — which is the only thing you need
to know before acting on it. Each file states its kind in a blockquote at the
top; if you add a doc, give it one.

| Kind | True now? | Lifecycle |
|---|---|---|
| **Rulebook** | Yes, always | Edited in place, never expires |
| **Live** | Yes, and rots fastest | Updated every session that changes the answer |
| **Scope** | No — describes a *possible* future | Frozen when written; header tracks what shipped |
| **Record** | It *was* true on its date | Never edited except its header |

The failure this prevents: reading a scope as a commitment, or a finished
runbook as a to-do list. Both have happened here.

---

## Rulebooks — the law

- [`../CONVENTIONS.md`](../CONVENTIONS.md) — the design and code rulebook. Parts
  of it are machine-enforced by `npm run audit:mobile`. **Authoritative.**
- [`../README.md`](../README.md) — the front door: what the app is, how to run
  it, how to deploy it.

## Live — what's happening now

- [`next-steps.md`](next-steps.md) — the rolling handoff. **The authoritative
  answer to "what's in flight?"** Reminder go-live, the data-model work that has
  to land before an App Store binary exists, and the native iOS plan.
- [`../ROADMAP.md`](../ROADMAP.md) — the longer arc: what's built, what's
  deliberately not, and the standing constraints. Defers to `next-steps.md` for
  current work.

## Scopes — proposals, not commitments

Nothing in here is agreed work. Each says what exists today, what the change is,
where it gets hard, and what it costs. Re-check the code before starting one —
they describe futures, and the present moves.

- [`scopes/notes.md`](scopes/notes.md) — four candidates for the notebook:
  note-to-note links, search match highlighting, multi-select, and the rail's
  Back-button behavior. *None shipped as of 2026-08-06.*
- [`scopes/areas-and-tags.md`](scopes/areas-and-tags.md) — the 2026-08-17
  rethink of the two organizing axes, and the current thinking on both.
  Areas become an app-wide **lens** set in the shell (tasks, lists, notes,
  habits — deliberately not contacts) rather than a per-page filter; tags become
  contexts that cross areas and pay off through a plain tag page (the saved-view
  rule engine on `groups.js` was weighed and **declined** in §4.2 — a fortnight
  of work for something nobody has asked for); sharing splits into "does this
  lens exist for you" (`areas.shared`) and "can you see this item" (the existing
  `privacy_level`), with tags inheriting their row's privacy for free. The
  schema half was the time-sensitive part — one `0040` migration carrying every
  column the feature will ever need — and it landed whole, which is what leaves
  the rest free of migrations. Five UI phases after that, an explicit decline
  list, and a §9 decisions table where the open questions used to be.
  ***Areas shipped: `0040` plus UI phases 1–4. Tags (phase 5) have not
  started.*** See the doc's own status block for what each phase covered.
- [`scopes/task-areas.md`](scopes/task-areas.md) — grouping tasks by area
  ("Work" vs "Home"), in three phases. **Superseded by `areas-and-tags.md`**,
  which keeps its reasoning and widens its scope — and which shipped, so this
  file is history rather than a plan. *Read it only for the reasoning; two of
  its names have since changed (see its own banner).*
- [`scopes/competitive-superlist.md`](scopes/competitive-superlist.md) — the
  2026-08-13 read of Superlist v1.56: the full feature diff, four candidates
  worth building (offline writes, attachments, multi-select, calendar in
  Today), two open product questions, and — the part worth keeping — an
  explicit list of what we're *declining* and why. *Nothing shipped.*

## Records — how we got here

Historical. Kept for the reasoning and the decisions, not as instructions. Read
each one's header first: two of them contain guidance that has since been
reversed or completed — and one of them, `mobile-audit.md`, is the exception to
the whole category, because its findings are still open.

- [`records/mobile-audit.md`](records/mobile-audit.md) — the 2026-08-18 mobile
  UI/UX + feature audit. **The one record that is still a to-do list:** nothing
  in it has been acted on. Carries a P0 (the selection bar and the tab bar
  occupy the same rect, so multi-select can't be used or cancelled on a phone),
  measured WCAG ratios showing `--text-2` and `--text-3` failing AA, and the
  note that the five audit scripts all pass because none of them enters a mode.
- [`records/ui-ux-review.md`](records/ui-ux-review.md) — the mobile-first UI/UX
  review of 2026-08-04, acted on in full. `CONVENTIONS.md` is what came out of
  it. The best single explanation of *why the app is shaped the way it is*.
  (File paths inside predate the `ui/shell/features` split.)
- [`records/cross-surface-review.md`](records/cross-surface-review.md) — the
  2026-08-13 pass over the *seams* rather than the features: whether each area
  of the app is reachable from the others. Acted on in full. Records why habits
  sit in the attention engine but never in the red badge, and the recurring
  failure mode it found (a new pillar ships without its wiring).
- [`records/notifications-review.md`](records/notifications-review.md) — June
  2026 review of the attention/notification stack. Its "stack at a glance" is
  still accurate; **its app-wrapping recommendation has been reversed.**
- [`records/phase6-reminders.md`](records/phase6-reminders.md) — the agreed
  scope for reminders. The product decisions still govern; **the go-live runbook
  inside has already been executed.**
- [`records/auth-multitenancy-runbook.md`](records/auth-multitenancy-runbook.md)
  — the auth + RLS cutover, **already performed**. Still the reference for how
  the live Supabase project's Auth settings are configured.

---

## Adding a doc

Pick the kind first, put it in the matching place, and open with the header
block. A scope that turns out to be the plan of record doesn't get promoted —
it gets *implemented*, and then its header records what shipped.

When a scope or record is contradicted by something newer, don't delete it and
don't silently leave it. **Edit its header to point at what superseded it.** The
document's value is the reasoning; the header is what keeps that reasoning from
being mistaken for an instruction.
