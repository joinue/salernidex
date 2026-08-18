# Task areas — scope

> **Scope** — a proposal, not a commitment. Written 2026-08-05.
> **Superseded (2026-08-17) by [`areas-and-tags.md`](areas-and-tags.md)**, which
> keeps this document's core reading — exclusive/optional, `task_areas` as the
> end state, `show_on_today` as the thing that actually fixes the complaint —
> and widens it from a Tasks-page feature to an app-wide lens over lists, notes
> and habits. It also answers the open questions in §7: projects get areas
> (they're tasks), contacts deliberately don't, and §7.2's per-household vs
> per-member is settled by an `areas.shared` flag. Two names below have since
> changed: the table is `areas`, not `task_areas`, and `buildAttention` moved to
> `lib/attention.js` when `lib/reminders.js` became the reminder entity (0039).
> **Status (2026-08-06): phase 1 is partly shipped.** `TasksView` has the area
> pill row, an area filter, and `TaskForm` has the picker — but the pills carry
> no counts, and the selection persists to `sessionStorage`, not `appPrefs`.
> **Phases 2 and 3 are unbuilt:** there is no `task_areas` table (`tasks.area`
> is still the freeform text column from
> [`0005_task_areas.sql`](../../supabase/migrations/0005_task_areas.sql)), and
> no `show_on_today` / `default_privacy` behavior.
> The three open questions in §7 are still open.

The ask: *"I have a lot of tasks at work. Intermixing those with the home tasks
makes the Tasks page a bloated mess. Can I group my tasks?"*

This is a scope, not a build. It ends with a recommendation and a three-phase
plan, and it starts by admitting something inconvenient: **most of this feature
already shipped, it just has no front door.**

The thing being described is `tasks.area`, and it keeps that name. Two reasons.
The obvious one: users' data already says "Work" and "Home", the column is
called `area`, and renaming a working concept buys nothing. The one that
actually settles it: **the app already has a top-level Groups page** — smart
groups of *contacts*, with their own tag-rule engine in `lib/groups.js`. A
second, unrelated "Groups" in the same sidebar would be a worse mess than the
one being fixed.

---

## 1. What exists today

`tasks.area` is a nullable free-text column — one category per task, added in
migration `0005_task_areas`. It already drives:

| Surface | Behavior |
|---|---|
| `TasksView` | a pill row (`All areas · Work · Home`) that filters every bucket |
| `TaskRow` | a `.chip.area` on the row |
| `TaskForm` | a text input with a `<datalist>` of areas in use |
| quick-add | a new task inherits the active area filter, so it stays in view |
| `lib/tasks.areaNames` | the distinct areas in use, alphabetical |

So the *partition* is built. What's missing is everything that makes a partition
feel like a place you go:

1. **No front door.** It's a free-text field that lived behind "More options"
   until the form rework. Nobody discovers it.
2. **No identity.** No icon, no color, no order, no count. The area pills are
   indistinguishable from the tag pills stacked directly above them — same
   `.area-pill` class, same size, same position.
3. **It fragments.** `areaNames` de-duplicates on the exact trimmed string, so
   `work` and `Work` are two different areas forever. There is no rename, no
   merge, no delete.
4. **The selection doesn't stick.** It lives in `sessionStorage`, so every fresh
   launch of the PWA drops you back into the intermixed everything-view — which
   is exactly the mess being complained about.
5. **It doesn't reach Today.** `buildAttention` in `lib/reminders.js` reads no
   area and no assignee. Every work task with a date lands on the Today
   dashboard on a Saturday morning. **This, not the Tasks page, is the sharpest
   version of the problem.**

Nothing in that list is a schema problem. Points 1, 4 and 5 are the ones that
are actually felt day to day, and none of them need a migration.

---

## 2. What an area means

Two properties decide the whole design:

**Exclusive.** A task is in exactly one area, or none. Work-vs-home is a
partition, not a set of labels — a task that is 40% work is not a real thing.
This also keeps the model honest against what's already there: `tags` is the
many-per-task axis and it works well. Areas must not become a second tag system,
which is precisely the risk while both render as identical pill rows.

**Optional.** No area is a valid, permanent state. Someone with 20 tasks should
never see area chrome. The current pill row already gets this right — it renders
only once an area exists — and that behavior carries forward.

Which gives the one-liner:

> **Assignee is _who_. Due date is _when_. Tags are _about what_. An area is
> _which part of your life_ — and it's the only one of the four you can scope
> the whole app to.**

---

## 3. Options considered

|         | Approach                                                                | Verdict                                                                                                |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **A**   | Keep free-text `area`, invest only in UI                                | **All of phase 1.** Ships fast, no migration, fixes most of the felt pain                              |
| **B**   | Back `area` with a real `task_areas` table — identity, order, behavior  | **Recommended end state.** Casing fragmentation and the missing rename/merge are structural            |
| **C**   | Areas as saved filters ("smart areas") over tags/assignee/dates          | Over-built for now. Work-vs-home is a plain exclusive partition                                        |
| **D**   | Reuse Projects                                                          | No. A project is bounded and has a finish line. "Work" never finishes                                  |

A and B aren't rivals — A is the first half of B, and everything built in A
survives the migration. Option C is worth a back pocket: a smart area is an area
whose membership is computed, and `lib/groups.js` already does exactly this for
contacts (AND/OR/NOT tag rules), so the pattern is in the codebase if it's ever
wanted.

---

## 4. Recommended design

### Data

Phase 1 needs none. Phase 2 promotes the free-text string to a row:

```sql
create table public.task_areas (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  icon            text,                              -- lib/icons.js glyph, same picker as habits/lists
  color           text,                              -- lib/colors.js key
  sort_order      double precision,                  -- manual drag order, lib/order.js
  show_on_today   boolean not null default true,     -- see §5
  default_privacy privacy_level not null default 'shared',
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.tasks
  add column area_id uuid references public.task_areas(id) on delete set null;
create index tasks_area_id_idx on public.tasks (area_id);
```

`on delete set null`, deliberately: deleting an area must never delete work. Its
tasks fall back to no area, and the confirm copy says so — _"Its 14 tasks move
to No area. The area itself is gone."_

RLS mirrors every other table (household-scoped `is_member()`, privacy-aware).

**Migration.** One backfill pass: for each distinct `lower(trim(area))` per
household, insert a row using the most common casing as its name, then set
`tasks.area_id`. This is also the moment the `work`/`Work` fragmentation gets
healed, for free. Keep the `area` text column writing in parallel for one release
as a rollback seat, then drop it.

Because the name doesn't change, the migration is purely additive and nothing
user-facing moves. An area called "Work" before is an area called "Work" after.

### Where areas appear

**Tasks page — a scope rail.** The `.area-filter` pill row becomes the page's
primary scope control: horizontally scrollable, icon + name + open count, `All`
first. It sits directly under the title, above the member Segmented. The tag
pills stay but must become visually subordinate — right now areas and tags share
the identical `.area-pill` class, which is exactly why neither reads as more
important than the other.

**Selection persists.** Move it from `sessionStorage` to `appPrefs` (`taskArea`,
alongside the existing `taskFilter` / `showCompleted`), so the app opens where
you left it. Two lines, and most of the felt improvement.

**New tasks inherit the active area.** Already true in `TasksView.addQuick`;
extend it to `TaskForm`, which should open pre-set to whatever you were looking
at. Typing a task while scoped to Work must produce a Work task with zero extra
taps — if it doesn't, the feature is a tax rather than a tool.

**The form gets an Area picker.** Styled like `AssigneePicker` (chip row with
icon) rather than the current free-text input, rendered **only once an area
exists** — the same progressive-disclosure rule `PrivacyField` and the member
filter already follow. It belongs next to Who, above "More options". Until an
area exists there is nothing to pick, so nothing shows.

**Desktop sidebar.** Areas nest under Tasks with counts. This is where it pays
off most on a large screen and costs nothing extra — the sidebar already renders
counts for Tasks, Projects and Lists.

**Managing areas.** A small screen reachable from the rail's overflow: create,
rename, recolour, reorder (`ReorderableList`), delete. Roughly `ListsView` +
`ListForm` in size, and it can borrow `IconPicker` and `ColorPicker` wholesale.
Rename is the one that can't exist before phase 2 — renaming a free-text string
means rewriting every task that carries it.

---

## 5. The part that actually fixes "bloated mess"

Filtering the Tasks page is the obvious half. The other half is that **work
should be able to disappear when you're not at work.**

Give each area a `show_on_today` switch. `buildAttention` in `lib/reminders.js`
takes it into account, so an area with the switch off never reaches:

- the Today dashboard
- the Today nav badge and the OS app-icon badge
- the `send-reminders` Edge Function's push notifications (it re-derives the same
  rules server-side, so the column has to be read in **both** places or they
  drift — see `docs/notifications-review.md`)

Work tasks then live in the Work area, are found when you go looking for them,
and stay out of Saturday. That single switch is worth more than the entire rail.

A future refinement, not phase one: schedule it. "Show Work on Today, weekdays
only" — the recurrence vocabulary in `lib/recurrence.js` already describes
weekday sets, so the rule language exists.

### Areas and privacy

In a multi-member household these interact, and the default matters. A Work area
in a shared household almost certainly shouldn't push its contents into a
partner's Today feed. Hence `default_privacy` on the area: new tasks created
inside it take the area's default rather than the member-level `taskPrivacy`.
Set an area to private once, and everything filed there is private from then on.

---

## 6. Phasing

**Phase 1 — no schema change.** Turn the pill row into a real scope rail with
counts, persist the selection to `appPrefs`, promote the area picker in
`TaskForm` beside Who, have the form inherit the active area, and de-duplicate
`areaNames` case-insensitively. Ships small and delivers most of the everyday
benefit. Keeping the name "area" removes what would otherwise have been the bulk
of this phase.

**Phase 2 — the table.** `task_areas` + `tasks.area_id` + the backfill, icon and
color, manual order, the manage screen (rename/merge/delete), sidebar counts.

**Phase 3 — behavior.** `show_on_today` wired through `buildAttention` _and_ the
Edge Function, `default_privacy`, and per-area defaults for new tasks.

Each phase is independently shippable and each leaves the app coherent.

---

## 7. Open questions

1. **Do projects belong to areas?** A work renovation is a work project. The
   column costs nothing (`is_project` rows are tasks), but the Projects index
   would need its own scope rail to use it. Suggest: add it in phase 2, surface
   it in the Projects index only if it's missed.
2. **Are areas per-household or per-member?** Per-household is simpler and
   matches every other table. But "Work" means different things to two people in
   one household, and a shared Work area holding both their jobs is a worse mess
   than the one being fixed. Suggest: per-household rows, with the member filter
   and per-area privacy doing the separating — and revisit if it chafes.
3. **A cap?** Areas are cheap to make and a rail with 15 of them is its own
   bloat. Suggest no hard limit, but the rail scrolls rather than wraps, so the
   cost of over-creating is visible immediately.
