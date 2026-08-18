# Areas and tags — scope

> **Scope** — a proposal, not a commitment. Written 2026-08-17, then revised
> twice the same day: once after a review pass against the rest of the repo and
> the category, once to fold in the answers to every open question. **§9 is now
> a decisions record rather than a question list.**
> **Supersedes [`task-areas.md`](task-areas.md)**, which scoped areas as a
> Tasks-page feature. This widens them to the whole app and answers the two
> questions that one left open: what tags are *for*, and how either interacts
> with a household.
>
> **Status (2026-08-17): §7.1 and UI phases 1–4 are built. Phase 5 (tags) is
> not. RE-RUN `0040` — it gained `member_preferences.area` after its first
> run.**
> Shipped: [`0040_areas.sql`](../../supabase/migrations/0040_areas.sql) (table,
> `area_id` on tasks/lists/notes/habits, `list_items.tags`, backfill,
> `merge_area` RPC), [`lib/areas.js`](../../src/lib/areas.js), the areas manager
> at `#/areas`, the shell switcher
> ([`AreaSwitcher`](../../src/components/shell/AreaSwitcher.jsx)), area pickers
> on tasks and lists, subtask/project inheritance, create-time pre-fill, and the
> "No area" section ([`UnfiledSection`](../../src/components/ui/UnfiledSection.jsx))
> on Tasks, Projects, Lists, Notes and Reminders.
> Phase 4 shipped with it: the `show_on_today` toggle in AreaForm, the rule in
> `buildAttention` (applied to **every** caller — Today, both badges, the push
> sweep — unlike the lens, which `buildAttention` does not apply at all; callers
> partition with `canBeFiled`/`attentionAreaId` so they can still offer what the
> lens excluded), a server port at
> [`areas.ts`](../../supabase/functions/send-reminders/areas.ts) wired through
> `badge.ts`, `deadlines.ts` and the sweep in `index.ts`, and three parity
> suites pinning the two implementations together
> ([`areas.parity.test.ts`](../../supabase/functions/send-reminders/areas.parity.test.ts)
> plus extensions to the badge and deadline ones).
> Phase 3 shipped too: the `default_private` toggle (shown only on unshared
> areas, per §5.2), `privacyForNewItem` wired into all four create paths
> (TaskForm, quick-add, ListForm, notes) on the same explicit-pick-wins
> precedence TaskForm uses for assignee, and the un-share confirm from §5.3.
> **Not built: phase 5 (tags).** Habits carry `area_id` but have
> no picker and are deliberately absent from `AREA_SCOPED_ROUTES` — see §3.2.
> Today follows §3.5 like every other surface: unfiled tasks and lists go to a
> collapsed "No area" section. It briefly didn't — the "urgency-based sections"
> argument for the exception didn't survive its own precedent, since Tasks has
> the same grain and got the section. The one carve-out is principled: `canBeFiled`
> in `lib/attention.js` keeps dates, check-ins and habits OUT of that section,
> because contacts have no area and nothing sets `habits.area_id` — sweeping them
> in would empty the Dates and Habits cards the moment a lens was picked.
>
> **The schema half is time-sensitive.**
> [`next-steps.md §2`](../next-steps.md) — *"do this before any App Store binary
> exists"* — names this work as pending. §7 is structured around that: **one
> migration, now; all the UI whenever.**

The ask, in three parts:

1. **Areas are the spine.** They're how one app holds both a working life and a
   home life without the two bleeding into each other. Tasks, lists, projects,
   notes — all of it should be filterable by area.
2. **Tags are the flexible axis.** They cross areas. It isn't yet clear what
   they're *for*.
3. **Sharing is unresolved.** Do areas get shared with a household? Do tags?

Short version of the recommendation: **an area is a lens over the entire app,
set once in the shell, not a filter you re-apply on every page.** A tag is a
context you deliberately reach for, and it pays off through one cheap surface —
a tag page — rather than a rule engine. Sharing is two separate questions that
get conflated, and keeping them separate is what makes the whole thing
tractable.

---

## 1. What exists today

`area` is a nullable free-text column on **tasks and nothing else**
([`0005_task_areas.sql`](../../supabase/migrations/0005_task_areas.sql)). `tags`
is a `text[]` on four tables. Neither reaches the household model.

| Entity | Area | Tags | Privacy |
|---|---|---|---|
| `tasks` (incl. projects, reminders, subtasks) | ✅ free text | ✅ | `privacy_level` |
| `notes` | ❌ | ✅ | `privacy_level` |
| `people` | ❌ | ✅ | `privacy_level` |
| `organizations` | ❌ | ✅ | `privacy_level` |
| `lists` / `list_items` | ❌ | ❌ | `privacy_level` (list) |
| `habits` | ❌ | ❌ | `shared` boolean, per-`member_id` |

Note the privacy column is **not uniform** — habits use a boolean, everything
else an enum, and the enum's default differs by table (`lists` default
`family_shared`, tasks/people `shared`). §5 depends on getting this right.

What areas already drive, all inside `TasksView`: a pill row that filters the
buckets, a `.chip.area` on `TaskRow`, a `<datalist>` in `TaskForm`, quick-add
inheritance of the active filter, and
[`areaNames`](../../src/lib/tasks.js#L201) for the distinct values in use.

Five gaps, and only one of them is a schema problem:

1. **It stops at Tasks.** Lists, notes and habits have no area at all, so the
   partition leaks the moment you leave one page. A work grocery run, a work
   note, a work habit — all of them land in the personal view.
2. **The selection doesn't stick.** [`TasksView.jsx:111`](../../src/features/tasks/TasksView.jsx#L111)
   reads it from `sessionStorage`, so every cold launch of the PWA drops you
   back into the intermixed everything-view. `appPrefs` already persists
   `taskFilter`, `showCompleted`, `todayScope`, `peopleSort`, `projectsSort`
   and `notesSort` — area is conspicuously not among them.
3. **It fragments.** `areaNames` de-duplicates on the exact trimmed string, so
   `work` and `Work` are two areas forever. No rename, no merge, no delete.
4. **It never reaches Today.** `buildAttention` in
   [`attention.js`](../../src/lib/attention.js) reads no area. Every work task
   with a date lands on the Today dashboard on a Saturday morning. **This, not
   the Tasks page, is the sharpest version of the problem.**
5. **Tags are siloed per view and per entity.** `tagNames(tasks)` computes the
   task tag list; [`NotesView.jsx:91`](../../src/features/notes/NotesView.jsx#L91)
   computes its own from notes; people and orgs each have their own. The same
   word on a task and a note has no relationship. `TagInput` is shared across
   five forms — the *primitive* is common, the *namespace* is not.

---

## 2. The distinction that decides everything

Two properties, and every other decision falls out of them.

**An area is exclusive.** One per thing, or none. Work-vs-home is a partition,
not a set of labels — a task that is 40% work is not a real thing.

**A tag is not.** Many per thing, and the useful ones deliberately span areas.

Which gives the test to apply whenever it's unclear which one something wants
to be:

> **If you'd ever want to see _only_ that, it's an area. If you'd only ever
> want to see _everything_ with it, it's a tag.**

And the one-liner for what each axis answers:

> **Assignee is _who_. Due date is _when_. Tags are _what this needs_. An area
> is _which part of your life_ — and it's the only one of the four you can
> scope the whole app to.**

The risk this guards against is real and already visible: areas and tags
currently render as two stacked rows of the identical `.area-pill` class
([`TasksView.jsx:521-560`](../../src/features/tasks/TasksView.jsx#L521-L560)),
which is exactly why neither reads as more important than the other. If areas
become a second tag system the feature has failed, and the way that happens is
by degrees — a second area per task here, an area colour that's really just
decoration there.

---

## 3. Areas

### 3.1 The move that matters: a lens, not a filter

Everything else in this section is plumbing for this one idea.

Put an area switcher **in the shell** — a chip row in
[`Sidebar.jsx`](../../src/components/shell/Sidebar.jsx) and
[`MobileNav.jsx`](../../src/components/shell/MobileNav.jsx):

```
All  ·  💼 Work  ·  🏡 Home  ·  🎸 Band
```

Picking one scopes **every** view — Today, Tasks, Projects, Reminders, Lists,
Notes, Habits — and pre-fills the area on anything created while it's active.
It persists across launches.

That is the difference between "areas exist" and "work stays out of my
Saturday." A per-view pill row makes you re-apply the same decision on seven
pages; a lens you set once actually holds. It is also the only version that
fixes gap #4 above, because Today is a page like any other under a lens.

Once the lens exists, **delete the area pill row from `TasksView`.** Two
controls for one concept is worse than either alone. The tag pills stay.

The lens is orthogonal to `todayScope` (`'mine' | 'all'`) and to the member
filter — those answer *whose*, the lens answers *which part of life*. Both can
be on at once and they compose without argument.

**The lens is a client-side filter and must stay one.**
[`useData`](../../src/hooks/useData.js) already loads every row for the
household in ~20 parallel `select('*')` calls, and
[`offlineCache.js`](../../src/lib/offlineCache.js) caches that whole set for a
cold launch. So a lens costs one `.filter()` and zero queries — but the
corollary matters more: **never push the lens into the PostgREST query.** Doing
so would mean the offline cache holds only the last-viewed area, and switching
areas offline would show an empty app.

### 3.2 Which entities get an area

| Gets `area_id` | Why |
|---|---|
| `tasks` | Already has one. Covers projects, reminders and subtasks for free (`is_project`, `is_reminder`) |
| `lists` | A work shopping list is a real thing. The list is the unit you file, not the item |
| `notes` | Meeting notes are the clearest case in the app |
| `habits` | Cheapest of the four to add and the weakest to *use* — see below |

| Stays out | Why |
|---|---|
| `list_items` | Inherits the list. (They do get **tags** — §4.3 — but never an area) |
| `people` / `organizations` | **See below — this is a deliberate call, not an omission** |
| `groups`, `relationships`, `affiliations` | Derived from contacts; they inherit whatever contacts do |

**Contacts don't get areas, and this is the strongest evidence the model is
right.** Apply the test from §2: a colleague who becomes a friend is not
40%-work, they're *both*, permanently. You do not want a person to vanish
because you're in Work mode. Non-exclusive by nature ⇒ tags, not areas — and
the app already has the better answer there, in the smart-group engine in
[`groups.js`](../../src/lib/groups.js), which does AND/OR/NOT tag rules over
contacts with a whole top-level page as its front door.

So the rule is: **the lens filters the first seven destinations in
[`nav.js`](../../src/lib/nav.js) and never touches the `Contacts` group.** Say
it once in the UI ("Areas don't filter contacts — use Groups") and never again.

**Habits deserve honesty rather than symmetry.** Nobody has forty habits, and
the Habits page is not a bloated mess. The *column* is free and belongs in the
migration; the *picker in `HabitForm` and the filter in the habits view* are
the lowest-value work in this document and should be last or never. Listing all
four entities as equals would be the polite lie.

**Derived reminders are permanently unfiled**, and that's a consequence of two
correct decisions rather than a bug. Birthdays and key dates come from contacts
via `upcomingDates()` ([`reminders.js`](../../src/lib/reminders.js)); contacts
have no area; so they surface under every lens, in the "No area" section
described in §3.5. That is the right behaviour — a birthday is not work or home
— but it should be stated before someone files it as a bug.

### 3.3 Data — one migration, all of it

Next migration is `0040` (`0039_reminders` is taken). Everything below lands
**together**, including columns whose behaviour ships much later. Rationale in
§7: [`next-steps.md §2`](../next-steps.md) is explicit that additive columns are
free now and expensive once an old iOS build is on someone's phone.

```sql
create table public.areas (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  icon            text,                            -- lib/icons.js glyph, same picker as habits/lists
  color           text,                            -- lib/colors.js key
  sort_order      double precision,                -- manual drag order, lib/order.js
  shared          boolean not null default false,  -- §5: does this lens exist for other members
  default_private boolean not null default false,  -- §5: only meaningful while shared = false
  show_on_today   boolean not null default true,   -- §6
  archived_at     timestamptz,                     -- hidden from the switcher, items keep their area
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index areas_household_idx on public.areas (household_id);

-- One "Work" per person, but two people in a household may each have one.
-- Backfill attributes rows to the household owner (§ below) so created_by is
-- never null here and this stays a plain index — no NULL-distinctness trap.
create unique index areas_name_uniq on public.areas
  (household_id, created_by, lower(name));

create trigger areas_touch before update on public.areas
  for each row execute function public.touch_updated_at();
create trigger areas_audit after insert or update or delete on public.areas
  for each row execute function public.write_audit();

alter table public.tasks  add column area_id uuid references public.areas(id) on delete set null;
alter table public.lists  add column area_id uuid references public.areas(id) on delete set null;
alter table public.notes  add column area_id uuid references public.areas(id) on delete set null;
alter table public.habits add column area_id uuid references public.areas(id) on delete set null;

create index tasks_area_idx  on public.tasks  (area_id);
create index lists_area_idx  on public.lists  (area_id);
create index notes_area_idx  on public.notes  (area_id);
create index habits_area_idx on public.habits (area_id);

-- Tags on list rows, so a grocery row can join a tag page alongside tasks and
-- notes (§4.2). Same shape as tasks.tags / notes.tags — one namespace.
alter table public.list_items add column tags text[] not null default '{}';
```

Three details that are easy to miss and annoying to retrofit:

- **`touch_updated_at` is load-bearing.** It's what lets `areas` join
  `GUARDED_TABLES` in [`mutationQueue.js`](../../src/lib/mutationQueue.js) and
  get the staleness guard on queued offline writes. A table without it is
  last-write-wins forever. (`list_items` still has no `updated_at` and stays
  unguarded — that limitation is pre-existing and out of scope here.)
- **Realtime: add it.** Later tables have joined the publication via a guarded
  `do $$ … $$` block (0024 `list_catalog`, 0029 `notes`, 0033 `affiliations`);
  `habits` is the one that never did. Follow the majority — a renamed area
  showing its old name on the other person's phone is a small, confusing bug,
  and the table is tiny.
- **`on delete set null` throughout, deliberately:** deleting an area must never
  delete work. Its items fall back to no area, and the confirm copy says so —
  *"Its 14 tasks, 2 lists and 6 notes move to No area. The area itself is
  gone."* Archiving is the softer path and should be the default offer.

**RLS.** Household-scoped `is_member()` like every other table, and read is
*not* restricted to shared areas. That's a real decision: §5.3 concludes an
area name is not a secret, and the chip on a shared item has to be able to
render its name for whoever can see the item. Writes are creator-or-owner. The
lens list is filtered in the app (`shared || created_by === me`), not by RLS.

**Backfill** — this is also the moment the `work`/`Work` fragmentation heals,
for free. Rows are attributed to the household **owner** (`household_members`
already has `role in ('owner','member')`) and marked `shared`, because they came
from a household-wide free-text column that everyone could already see:

```sql
with names as (
  select household_id, lower(trim(area)) as key, trim(area) as name, count(*) as n
    from public.tasks
   where coalesce(trim(area), '') <> ''
   group by 1, 2, 3
), winners as (
  select distinct on (household_id, key) household_id, name
    from names order by household_id, key, n desc, name
), owners as (
  select distinct on (household_id) household_id, user_id
    from public.household_members where role = 'owner' order by household_id, joined_at
)
insert into public.areas (household_id, name, shared, created_by)
select w.household_id, w.name, true, o.user_id
  from winners w join owners o using (household_id);

update public.tasks t set area_id = a.id
  from public.areas a
 where a.household_id = t.household_id
   and lower(a.name) = lower(trim(t.area));
```

**`tasks.area` is not dropped.** Keep it, dual-written, indefinitely — or at
minimum until it is certain no old client reads it.
[`next-steps.md §2b`](../next-steps.md) is unambiguous: *"expand/contract only —
never drop or rename a column while an older client could still be reading it."*
A dead text column costs nothing. Dropping it while a six-month-old iOS build is
still installed costs data.

Because the name doesn't change, nothing user-facing moves: an area called
"Work" before is an area called "Work" after.

### 3.4 Inheritance, so nobody files anything twice

The feature is a tax rather than a tool if filing is manual. Every one of these
should be automatic:

- A **subtask** takes its parent's area. Non-overridable — a subtask in a
  different area than its parent is incoherent.
- A **task created inside a project** takes the project's area.
- A **list item** has no area; it reads the list's.
- **Anything created while a lens is active** is pre-filled with that area.
  [`TasksView.jsx:313`](../../src/features/tasks/TasksView.jsx#L313) already
  does exactly this for quick-add; generalise it to every create path and every
  entity.
- A **note created from a project** takes the project's area.

### 3.5 Unfiled items get a section, not a rule

**Decided.** When a specific area is active, items with no area appear in a
**collapsed "No area · 12" section at the bottom of the view, above Recently
completed.** Under "All" the section doesn't exist — there's nothing to
distinguish.

This is better than either of the two options originally weighed. Showing
unfiled items inline makes the lens quietly leaky; hiding them entirely makes it
airtight but silently swallows anything you forgot to file, and the first time
that happens the feature loses trust permanently. A collapsed section is
explicit, dismissible, costs one row of height, and does the nudging that a
silent rule can't.

It also softens a real divergence worth naming. The workspace switcher at the
top of the sidebar is now the standard pattern — Linear, Notion, Slack,
Superlist, Height all have one — and in every case it's a **hard boundary**:
different data, nothing leaks. Someone arriving with those instincts would find
a leaky lens surprising. A visible "No area" section is the affordance that
explains the difference instead of hiding it.

Two places it needs care:

- **Today's sections are urgency-based** (overdue → today → anytime), so an
  area-based section cuts across that grain. It still works at the bottom, but
  it's the one screen where the pattern is not free.
- **The section is never empty** on most setups, because derived reminders —
  birthdays, key dates — come from contacts and so are permanently unfiled
  (§3.2). Acceptable, and arguably right: it keeps them reachable without
  putting a birthday in "Work."

### 3.6 Where areas appear

**The switcher.** Sidebar: a chip row above the destination list, with icon,
name and open count. Mobile: the same row in the drawer, plus the active area's
icon in the header as the affordance that opens it. Horizontally scrollable,
`All` first — never wraps, so the cost of creating fifteen areas is visible
immediately.

**No swipe gesture for switching. Decided.** Horizontal swipe on rows already
belongs to [`SwipeRow`](../../src/components/ui/SwipeRow.jsx), a header swipe
has no affordance so nobody discovers it, and on iOS the screen edge is the
system back gesture. Above all, switching areas is a **few-times-a-day** action
— hidden gestures earn their keep on things you do constantly, not
occasionally. A visible chip you tap wins. A desktop keyboard shortcut is worth
adding later; [`keys.js`](../../src/lib/keys.js) already models the set.

**Selection persists to `appPrefs`.** A new `area` key alongside `taskFilter`
and `todayScope` ([`appPrefs.js`](../../src/lib/appPrefs.js)). Per-member,
which is correct — the lens is a personal viewing state, not household data.

**Search ignores the lens. Always.** Quick Find
([`quickFind.js`](../../src/lib/quickFind.js)) and the People/Notes searches
stay global, because searching *means* you don't know where the thing is —
scoping it to the active area is how a search returns nothing and the user
concludes the data is gone. Every app with a workspace switcher does it this
way. Show the area chip in the result row instead, so a cross-area hit explains
itself.

**The forms get an area picker**, styled like `AssigneePicker` (chip row with
icon) rather than the current free-text input, and rendered **only once an area
exists** — the same progressive-disclosure rule `PrivacyField` and the member
filter already follow. Someone with 20 tasks and no areas should see no area
chrome anywhere in the app.

**Colour is an accent, not a theme.** An area's colour tints its chip and the
switcher, and nothing else. Re-skinning the whole app per area is a strong
signal of "where am I", and also the thing that would make the app feel like
four different apps.

**The areas manager lives behind the switcher. Decided.** An "Edit areas" row
at the end of the chip row is the real home — people manage things where they
see them, which is the instinct Slack's workspace menu, Things' right-click on
an area, and Apple Reminders' edit-from-the-list-screen all set, and which this
app already follows by managing lists on the Lists page and habits on the Habits
page. **Settings gets a row that navigates to the same screen** — a pointer, not
a second implementation — because Settings is where people look when they can't
find something.

The screen itself: create, rename, recolour, reorder (`ReorderableList`), merge,
archive, delete. Roughly `ListsView` + `ListForm` in size, and it can borrow
`IconPicker` and `ColorPicker` wholesale.

**Archiving keeps items reachable.** An archived area leaves `area_id` intact
and drops out of the switcher, so its items are visible only under `All` — which
is a trap unless the manager says so. The archived row shows its item count and
offers *unarchive* or *move items to…*; the plain-language promise is that
archiving hides a lens, never an item.

### 3.7 Merge and delete need an RPC, not the write queue

This is the one place the areas manager collides with the architecture, and it's
worth catching before it's written.

A merge is *"repoint N tasks, M lists and K notes at area X, then delete area
Y."* [`mutationQueue.js`](../../src/lib/mutationQueue.js) describes a mutation as
data — `{ table, op, values, where }` — so it can be replayed after a reload.
That shape can express the repoints and the delete, and the outbox preserves
order, but it **cannot make them atomic**. If the repoints exhaust
`MAX_ATTEMPTS` and the delete succeeds, `on delete set null` quietly unfiles
every affected item, and the user's merge looks like data loss.

So: **merge and delete-with-reassign are `security definer` RPCs**, the way
`create_household()` and `join_household()` already are. They're online-only —
an RPC isn't expressible in the queue — and the UI should say so plainly rather
than pretending. That's an acceptable trade for a rare, destructive, one-shot
operation. Everything else about areas (create, rename, recolour, reorder,
assigning an item to an area) is an ordinary row write and rides the queue
normally.

---

## 4. Tags

### 4.1 The honest answer to "useful for what?"

Tags are currently decorative. They render as chips, they weight search, and
one of them at a time can filter Tasks or Notes. Nothing in the app *starts*
from a tag.

The framing that makes them earn their keep:

> **An area is whose life this belongs to. A tag is what this needs from you.**

That points straight at contexts — `@errand`, `@call`, `@waiting-on`,
`@15min`, `@offline`, `@low-energy` — and those genuinely cross areas. Standing
in the hardware store you want every errand at once, work and home together;
the whole point is that the lens doesn't apply. That's the cleanest possible
statement of why tags aren't just weak areas.

The second use is the escape hatch. Areas are walls; tags punch holes through
them on demand. `#taxes` spans Work and Personal and pulls both together when
you deliberately ask — without leaking either into the other's normal view.

### 4.2 The payoff is a tag page, not a rule engine

**Decided: no saved views.** Tap any tag anywhere in the app and get **one
list of everything carrying it** — tasks, notes, lists, list rows, people, orgs
— across every area. That's the whole feature.

No rule editor, no AND/OR/NOT, no date predicates, no persistence, no
configuration. This is what Bear and Apple Notes do, it's roughly a day of work
rather than a fortnight, and it delivers most of what the saved-view idea was
for: standing in the hardware store, you tap `@errand` and see the dry cleaning
task next to the milk row.

The version declined was a table of stored rules — Todoist filters, Linear
Views, Apple Reminders Smart Lists. It's well-precedented, and it was also being
badly under-scoped by pointing at [`groups.js`](../../src/lib/groups.js) as
though it were a generalisation. That engine matches *one* entity type against a
*flat tag array* with no dates. Multi-entity with date and completion predicates
is a small query engine plus a rule editor plus a results view — a different
size of thing entirely, and not worth it before anyone has asked.

Two consequences worth recording:

- **A tag page needs no nav slot.** It's a detail route reached by tapping a
  tag, like a person page — not a destination in
  [`nav.js`](../../src/lib/nav.js). The five-slot bar stays as it is. This is
  what dissolved the "where do saved views live" layout problem.
- **A tag page ignores the active lens**, and says so on screen ("across all
  areas"). Crossing the partition is the entire point.

### 4.3 The rules that keep tags cheap

- **One flat namespace per household**, shared across tasks, notes, lists, list
  items, people and orgs. `#taxes` on a note and `#taxes` on a task are the same
  tag, and the autocomplete in `TagInput` draws from all of them. Today each
  view computes its own list, which is why the same word means nothing across
  pages.
- **Tagging a list row is a muted icon button and nothing more.** A list row is
  the densest, highest-volume row in the app and most rows will never carry a
  tag. So: no chip row, no inline field, no space reserved — a single muted tag
  glyph in the row's actions that opens the same `TagInput` everything else
  uses. Existing tags render as they do elsewhere once set; the *entry point*
  stays invisible until wanted. This is the one place tags could bloat a
  surface, so it's specified rather than left to the implementer.
- **No tag colours, no tag icons, no tag detail pages beyond the list, no
  hierarchy.** The moment a tag wants an icon it wanted to be an area — that's
  the test in §2 doing its job. Keeping tags visually plain is also what stops
  the two axes looking identical, which is gap #5 in the current UI.
- **A tag manager in Settings**: rename, merge, delete, across every entity at
  once. Same atomicity problem as §3.7 — a cross-table rename is an RPC.
- **Lowercase on write.** `Errand` and `errand` should never coexist. Do it in
  `TagInput` so there's one enforcement point.

---

## 5. Sharing

### 5.1 Two questions that get conflated

Almost all the difficulty here comes from treating these as one thing:

- **(a) Who can see that the area exists** — its name, icon, colour; whether
  it appears as a lens in your sidebar.
- **(b) Who can see the items inside it** — which is `privacy_level`, and
  already works.

Keep them separate and the design is two columns. Collapse them and you've
built a second access-control system next to the one in
[`privacy.js`](../../src/lib/privacy.js), with two rules that can disagree
(area says shared, item says private → now what?).

### 5.2 The recommendation

Two fields on `areas`, already in the DDL above.

**`shared boolean`** — answers (a). A shared area appears as a lens for every
household member. An unshared one exists only for its creator: it isn't in
anyone else's switcher, and their items never land in it. So 🏡 Home is a place
you both go, and 💼 Work simply doesn't exist for your partner.

This also settles what
[`task-areas.md` §7.2](task-areas.md) left open — *"are areas per-household or
per-member?"* The answer is **both, and `shared` is the switch.** Rows are
household-scoped like every other table; lens visibility is
`shared || created_by === me`. Two people can each have a private "Work"
holding their own job without colliding, which is precisely the mess the old
doc worried a shared "Work" would create.

**`default_private boolean`** — answers (b), as a *pre-fill only*, and **it only
exists on unshared areas.**

That last clause is the resolution of what was the fiddliest open question here
(*"if you share an area set to default-private, and your partner adds something,
can you see it?"*). The question dissolves rather than needing an answer: **a
shared area whose contents default to private is close to a contradiction** —
you shared it so you'd both see what's in it. So the toggle is hidden whenever
`shared` is on, and the setting means what it obviously means on 💼 Work:
everything you file here is yours. Wanting one item in shared Home to be private
is a per-item decision, and the per-item control is right there.

It is also deliberately **not** a `privacy_level`, which is what the first draft
of this document proposed and what `task-areas.md` proposed before it. A full
enum breaks on contact with the schema in three ways:

- The non-private default already **differs per table** — `lists` default
  `family_shared`, tasks and people `shared`. One enum stamped across all of
  them silently re-defaults lists.
- **Habits have no `privacy_level` at all**, just `shared boolean`. An enum has
  no clean mapping; a boolean maps exactly (`default_private` → `shared: false`).
- Nobody has ever asked for *"everything in Home is family_shared."* The real
  request is *"everything in Work is private,"* which is one bit.

So the precedence is a fallthrough, not an override:

```
area.default_private = true   →  'private'
otherwise                     →  member preference (member_preferences.default_*_privacy)
                              →  column default
```

### 5.3 Edge cases, decided

**A shared item that lives in a private area — does the other person see the
area name?** Yes. Show the chip. Areas are names, not secrets, and an item
arriving with a chip blanked out is more confusing than the name it hides. The
alternative — restrict the `areas` row by RLS and denormalise the name onto
shared items — buys very little and costs a denormalised column that can drift.
This is why §3.3's read policy is household-wide.

**A private item in a shared area.** Works already, no special handling: the
lens exists for both of you, the item is only visible to one. This is the
common case and it's why (a) and (b) have to stay separate.

**Sharing an area that was default-private.** The toggle disappears (§5.2) and
the setting stops applying to new items; everything already filed stays exactly
as private as it was. The confirm should say so.

**Un-sharing an area that has shared items in it.** The lens disappears from
other members' switchers; the items stay exactly as visible as they were. Say
so in the confirm — *"Home stops appearing for Marc. The 8 shared items in it
stay shared."*

**A member leaves the household.** Their private areas' items are already
handled by the household lifecycle work in
[`0017_household_lifecycle.sql`](../../supabase/migrations/0017_household_lifecycle.sql);
the areas themselves should follow whatever that migration does with their
other rows. Worth re-reading before building, not re-deciding here.

**Tags need no work at all.** The instinct in the original ask is right: a tag
is a string in an array on a row that is *already* privacy-scoped, so it
inherits perfectly by construction. The autocomplete inherits too, because it's
computed from rows that `filterVisible` has already passed. Nothing to build,
and worth writing down so nobody builds it.

---

## 6. The part that actually fixes "bloated mess"

Filtering pages is the obvious half. The other half is that **work should be
able to disappear when you're not at work.**

That's `show_on_today` on the area. An area with it off never reaches:

- the Today dashboard
- the Today nav badge and the OS app-icon badge
- the push notifications from the `send-reminders` Edge Function

Worth noting this is a genuine differentiator rather than a copy: **Things 3 has
areas and cannot do this** — its Today is global. Things is single-user software,
where work bleeding into Saturday is a nuisance; in a shared household it's a
partner's phone buzzing about your job.

The first two come from `buildAttention` in
[`attention.js`](../../src/lib/attention.js) — one pure function, so one change.
The rest is the catch, and it's bigger than it looks:

**This rule will exist in three languages.** The client has it in
`attention.js`; the Edge Function re-derives it in Deno
([`badge.ts`](../../supabase/functions/send-reminders/badge.ts),
[`deadlines.ts`](../../supabase/functions/send-reminders/deadlines.ts)); and
[`next-steps.md §3`](../next-steps.md) commits to a Swift `SalernidexCore` port.
That document names `habitSchedule.ts` as the hand port that *silently drifted
until a limit habit's weekly count was wrong.*

Two consequences, and they're the reason this section is short:

1. **Keep it a boolean.** The "schedule it — show Work on weekdays only"
   refinement floated in `task-areas.md` is **declined outright**, not deferred.
   A recurrence-shaped rule triply implemented is precisely the failure that
   already happened once.
2. **It ships with parity vectors.** `badge.parity.test.ts` and
   `deadlines.parity.test.ts` exist to catch exactly this drift; extend both,
   and put the area case into the vector corpus that §3 of `next-steps.md` wants
   extracted anyway.

Note the interaction with the lens: `show_on_today` is a *standing* rule about
an area, the lens is a *momentary* one about your attention. Work tasks with
`show_on_today` off stay out of Saturday whether or not you've switched lenses,
which is the behaviour you want at 8am on a weekend when you haven't touched
the switcher.

---

## 7. Plan of work

### 7.1 The schema goes first, and goes in one piece

[`next-steps.md §2`](../next-steps.md) — *"Data-model work — do this **before**
any App Store binary exists... Schema changes are cheap now and expensive
forever after"* — names this scope as outstanding. So the sequencing rule:

> **One migration, containing every column this document will ever need,
> including the ones whose behaviour ships a year later.** Then UI work, in
> whatever order suits.

`0040` therefore carries `shared`, `default_private` and `show_on_today` even
though nothing reads them until phases 3 and 4, and `list_items.tags` even
though the tag page is phase 5. **No `saved_views` table** — that feature is
declined (§4.2), so there is nothing to reserve space for.

This is a correction to how `task-areas.md` phased it, and to the first draft of
this document: both spread schema across releases, which is exactly the shape
[`next-steps.md`](../next-steps.md) warns against.

### 7.2 The UI phases

**1 — Identity.** The areas manager (create/rename/icon/colour/reorder/merge/
archive/delete, with §3.7's RPCs, reached from the switcher per §3.6), and move
the selection from `sessionStorage` to `appPrefs`. Areas stop fragmenting and
start persisting.

**2 — Reach.** The shell switcher; the inheritance rules in §3.4; create-time
pre-fill everywhere; area pickers on lists and notes; the "No area" collapsed
section (§3.5); retire the `TasksView` area pills. **This is the phase that
delivers the actual ask** — 1 is groundwork and 3–5 are refinements. If only one
phase ever ships it must be this one, and phase 1 alone is worse than nothing: a
management screen for a feature that still works on one page.

**3 — Sharing.** The switcher filtered to `shared || mine`, the
`default_private` fallthrough and its shared-area suppression, and the confirm
copy in §5.3.

**4 — Quiet.** `show_on_today` through `buildAttention` *and* the Edge Function,
with parity tests and vectors extended.

**5 — Tags.** The tag manager, one flat household namespace with a shared
autocomplete source, lowercase-on-write, the muted tag button on list rows, and
the tag page.

Habits' area picker sits outside this order and can be dropped entirely (§3.2).

### 7.3 The four integration points that are easy to forget

None of these are optional, and all four are enforced by something already
written down:

1. **Backup and restore.** `BACKUP_VERSION` is at **v10** with a documented
   migration history ([`ImportExport.jsx`](../../src/features/settings/ImportExport.jsx)),
   and [`ROADMAP.md`](../../ROADMAP.md) promises every table rides in the JSON
   backup. `areas` makes it **v11**, and restore has to remap `area_id` to the
   newly-inserted area rows — exactly the way v7 and v10 remap organization ids.
   A backup that drops areas silently unfiles the entire app on restore.
2. **Demo mode.** [`demo.js`](../../src/lib/demo.js) has **no areas at all**
   today, so the seed needs a Work/Home split across tasks, lists and notes.
   [`CONVENTIONS.md`](../../CONVENTIONS.md): *"Every feature should be visible
   there, because it's how the app gets reviewed."*
3. **Search stays global** (§3.6) — a deliberate non-integration, listed here so
   it doesn't get "fixed" later.
4. **Realtime publication** (§3.3) — add `areas` via the guarded block, the way
   `list_catalog`, `notes` and `affiliations` each did.

---

## 8. What this declines

Recorded so they don't get re-proposed:

- **Saved views / stored tag rules** — §4.2. The rule engine is a fortnight of
  work for something nobody has asked for; a plain tag page gets most of the
  value in a day. Declined on cost, so worth revisiting if tags see real use.
- **Areas as destinations instead of a lens** — the Things 3 model, where an
  area is a page in the sidebar you click into. Genuinely simpler: no global
  state, no page-by-page interaction matrix, and §3.6's search question never
  arises. Declined because it cannot deliver the sharpest half of the ask —
  an area you *visit* can't keep work off Today when you haven't visited it.
  A per-area "home" page is a reasonable **addition** later; it is not a
  substitute. This is the closest competitor's design and the strongest
  alternative in the document, which is why it's recorded rather than omitted.
- **Scheduled `show_on_today`** ("weekdays only") — §6. Declined outright, not
  deferred: three implementations of a recurrence rule is the drift that already
  bit once.
- **A swipe gesture to switch areas** — §3.6. Contended with `SwipeRow` and the
  iOS back gesture, undiscoverable, and aimed at a few-times-a-day action.
- **Sub-areas / nesting.** Projects already provide the layer below an area,
  and a two-level partition is how a partition becomes a taxonomy.
- **Multiple areas per item.** That's tags. See §2.
- **Areas on contacts.** §3.2 — non-exclusive by nature, and Groups already
  does it better.
- **Areas on list items.** §3.2 — the list is the unit you file. They get tags,
  not areas.
- **A per-area access-control list.** §5.1 — a second permission system beside
  `privacy_level` that can disagree with it.
- **Areas as tenancy.** An area is not a household. Anyone wanting real
  separation between work and home wants two households, and that already
  exists (`household_members` supports N memberships with a switcher).
- **Server-side lens filtering.** §3.1 — it would gut the offline cache.
- **Tag colours, icons, hierarchy.** §4.3.
- **Smart areas** (computed membership, à la smart groups). Work-vs-home is a
  plain exclusive partition. The pattern is in the codebase if it's ever wanted,
  but wanting it is evidence the thing was a tag.

---

## 9. Decisions

Every question this document opened has been answered. Recorded with the
reasoning's location, so the *why* is one jump away.

| # | Question | Decision | Where |
|---|---|---|---|
| 1 | Do list items get tags? | **Yes.** Entry point is a muted tag icon button only — no chip row, no reserved space | §4.3 |
| 2 | Does a `saved_views` table land in `0040`? | **No.** The feature is declined, so there's nothing to reserve | §4.2, §7.1 |
| 3 | Does the lens hide unfiled items? | **Neither.** A collapsed "No area · N" section at the bottom, above Recently completed, only when an area is active | §3.5 |
| 4 | Does a shared area's privacy default bind other members? | **Dissolved.** The setting only exists on unshared areas — a shared area that defaults to private is a contradiction | §5.2 |
| 5 | Where do saved views live in the nav? | **Dissolved** with saved views. A tag page is a detail route, not a destination; the five-slot bar is untouched | §4.2 |
| 6 | Does switching areas get a swipe? | **No.** Contended gesture, no affordance, wrong frequency. Visible chip; desktop shortcut later | §3.6 |
| 7 | Areas manager in Settings or behind the switcher? | **Switcher is home**; Settings gets a pointer row to the same screen | §3.6 |

Two things remain recommendations rather than decisions, both low-stakes and
both fine to settle while building: whether `areas` joins the realtime
publication (§3.3 leans yes), and whether habits ever get an area picker at all
(§3.2 leans no).
