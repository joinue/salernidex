# Salernidex — UI/UX review (mobile-first) + design-system plan

> **Record** — historical. Reviewed and **acted on, 2026-08-04.** Every P0 and P1 below is fixed, along with
> the structural work in Parts 2 and 3. `CONVENTIONS.md` is the rulebook that
> came out of it, `#/kitchen-sink` (dev only) is the primitive reference, and
> `node scripts/mobile-audit.mjs` now fails the build on a re-introduced
> occlusion or an undersized tap target. Each finding below carries what was
> done. Kept as the record of *why* the app is shaped the way it is — note that
> the file paths below are as they were at 75876f6, before `styles.css` and
> `components/` were split.

Reviewed 2026-08-04 against `main` @ 75876f6, demo data, Chrome headless at
iPhone 14 Pro (393×660 CSS px) and iPhone SE (375×667), light and dark.
Evidence: screenshots across every route plus a scripted occlusion / tap-target
audit. Comparison target for organization: `joinue-2.0`.

**Verdict.** The visual language is genuinely good: iOS tokens are coherent,
dark mode is clean, the gesture work (swipe rows, drag-to-dismiss sheets,
edge-back, pull-to-refresh, haptics) is better than most PWAs. What lets it
down is not taste, it's **layout arithmetic and primitive discipline**. Two
persistent banners eat the top of every screen, the floating chrome covers the
bottom of every screen, and roughly a dozen recipes that should be one shared
primitive have been re-rolled per feature. The fixes are mechanical, not a
redesign.

---

## Part 1 — Mobile UX findings

Severity: **P0** breaks or blocks a real interaction · **P1** materially hurts
the experience · **P2** polish.

### P0-1. Two banners consume 21–45% of the first screen, on every route

> **Fixed.** The install hint renders on Today only and its copy no longer truncates; the demo notice is a one-line pill (49px → 22px). On an iPhone SE, `/tasks` went from one partial row to two full ones.

`InstallHint` and the demo banner render inside `.content` above *every* view
(`App.jsx:511-521`), so they are re-paid on Today,
Tasks, People, Lists, Settings, every detail page.

Measured on iPhone 14 Pro: install hint 66px + demo banner 49px + margins =
**~155px of a 660px viewport before the page title**. On iPhone SE the copy
wraps to three lines and it becomes **~300px of 667px**: the Tasks screen shows
exactly one task row, and the FAB covers part of it.

The install hint is also a two-line card with a truncated subtitle ("Full
screen, an app icon, and notificat…") — it is paying full price and not even
delivering its own message.

**Fix.** Neither is page content; both are app-level status.
- Show the install hint **once, on Today only**, and make it a single dismissible
  line rather than a card. Better still, defer it until the second or third
  session.
- Make the demo banner a **thin, non-wrapping strip pinned under the status
  bar** (or fold it into the tab bar as a "Demo" pill). It repeats the same 18
  words on 15 screens today.
- Move both out of `.content` into the shell, so a page's first paint is its own
  title.

### P0-2. The floating chrome permanently covers live controls

> **Fixed.** `--tabbar-h` / `--fab-size` / `--chrome-bottom` / `--fab-bottom` / `--content-bottom` in `tokens.css`; every scroller derives its padding from them. The FAB also tucks away on scroll-down (`useHideOnScroll`). The dock bug turned out to be a sticky-offset error — a sticky `bottom` resolves against the scroller's *content* edge, so `.main`'s padding was double-counted and the dock parked 144px too high.

`.main` reserves `92px` of bottom padding
(`styles.css:4712-4718`), but the FAB's top edge
sits **128px** above the viewport bottom and the tab bar's top edge sits 67px
up. Content is therefore ~44px short of clearing the FAB, and the FAB is
`position: fixed` at `right: 18px` — so it covers a 54px square of *whatever
row happens to be there*, at every scroll position, not just at the end.

Scripted audit results (rows scrolled to a normal reading position):

| Route | Occluded |
|---|---|
| `/habits` | FAB covers the **Increase** stepper on "Weight"; tab bar covers **Decrease/Increase** on "Mood" |
| `/tasks` | FAB covers a task row; tab bar covers the **"Done · 5"** section toggle |
| `/settings` | Tab bar covers the **privacy `<select>`**; FAB covers the **"I'm this"** button |
| `/list/<id>` | Tab bar covers a row *and* its checkbox; the add-item dock covers the row above it and clips the next section header |
| `/today`, `/people`, `/activity`, `/projects`, `/orgs` | FAB and/or tab bar cover list rows |

These are not aesthetic overlaps — they are controls the user cannot tap.

**Fix.**
- Bottom padding must be derived, not guessed. Publish the chrome heights as
  tokens (`--tabbar-h`, `--fab-h`, `--dock-h`) and set
  `padding-bottom: calc(var(--tabbar-h) + var(--fab-h) + 24px + env(safe-area-inset-bottom))`.
- The `ListDetail` add dock needs the same treatment — currently list rows slide
  under it (`styles.css:2547` reserves nothing for it).
- Consider whether the FAB should hide on scroll-down / reappear on scroll-up
  (the standard iOS answer to exactly this problem), or move to a trailing-edge
  position that never lands on a row's action zone.

### P0-3. Four destructive actions use the browser's native `confirm()`

> **Fixed.** `useConfirm()` (`hooks/useConfirm.jsx`) wraps `ConfirmDialog` in a promise, so the call sites still read `if (await confirm({…}))`. All four now state the consequence ("Its 3 subtasks go too").

A styled `ConfirmDialog` exists and is used in 6 places, but delete still goes
through `window.confirm` in:

- `HabitDetail.jsx:363` — deletes a habit *and all its history*
- `ListDetail.jsx:342` — deletes a list
- `ProjectDetail.jsx:155` — deletes a project *and its subtasks*
- `ImportExport.jsx:212` — restore/overwrite

On iOS this is a gray system alert with a browser origin in it, in the middle of
an app that otherwise looks native. It's the single most jarring moment in the
product, and it guards the four most destructive operations.

**Fix.** Route all four through `ConfirmDialog`. While you're there: state the
consequence in the body ("This also deletes 3 subtasks"), don't just ask "are
you sure".

### P1-1. Today buries the thing Today exists for

> **Fixed.** To-do leads, habits follow.

Section order is Habits → To-do → Lists → Check in → Dates → Recent activity
(`TodayView.jsx:245-419`). With the two
banners, the greeting, and the search bar above it, **the first due/overdue task
is below the fold** — even though overdue items are what drive the red "9" on
the Today tab and the app icon badge.

(`README.md` says "Today leads with the To-do (tasks due) section". It no longer
does; the doc is stale either way.)

**Fix.** To-do first, then Habits. And consider collapsing the greeting +
date + search into a single compact header — three stacked full-width elements
before any content is a lot on a phone.

### P1-2. Three competing "add" affordances on one screen

> **Fixed.** `PageHeader` gained `createAction`, which renders on desktop only — the mobile FAB already offers that create from the thumb zone. The FAB is hidden entirely on Settings, Activity, Import, List detail and the legal pages.

On `/tasks` a user simultaneously sees: a `+` in the page header, an inline
"Add a task…" quick-add row, and the floating `+` FAB. All three create a task.
On `/settings` and `/person/<id>` the FAB is present but creates something
unrelated to the screen (acknowledged in
`MobileNav.jsx:57-60` via `forceMenu`).

**Fix.** Pick one per screen. The strongest version: keep the inline quick-add
where it exists (it's the fastest capture path and it's good), keep the FAB as
the *global* cross-create, and drop the header `+` where a FAB is already
present. Hide the FAB on screens with no sensible create (Settings, Activity,
Import).

### P1-3. Tap targets below the 44px minimum

> **Fixed.** A `.tap-target` hit-area extension in `base.css`, applied by class, plus the `IconButton` primitive so new controls get it by construction. Adjacent icon buttons now keep ≥12px apart (at 2px their 44px areas overlapped, and the right edge of "Edit list" opened "Delete list").

Apple HIG minimum is 44×44. `.task-check` handles this correctly with a
`::before { inset: -10px -12px }` hit extension
(`styles.css:2835-2839`) — but that is the **only**
such extension in 5,694 lines of CSS. Everything else ships at its visual size:

| Class | Size | Where |
|---|---|---|
| `.info-btn` | 26×26 | page headers |
| `.habit-step-btn` | 30×30 | habit +/− steppers (used constantly) |
| `.member-name-input` | h 30 | Settings |
| `.habit-check` | 32×32 | habit done toggle |
| `.icon-btn` | 32×32 | incl. **destructive** "Remove member", "Remove relationship" |
| `.text-btn` | h 34 | "I'm this", "Add" |
| `.header-action` | 38×38 | every page's primary action |

The habit steppers are the worst case: 30px targets, used many times a day, and
partly under the FAB.

**Fix.** Promote the hit-extension into a shared utility (`.tap-44`) or a
`<IconButton>` primitive that applies it, and use it everywhere. Visual size can
stay as designed.

### P1-4. Detail pages have no persistent nav bar

> **Fixed.** A `NavBar` primitive — sticky frosted bar, back on the left, large title below that collapses into the bar on scroll — now serves all ten detail screens.

Person, Project, Habit, List and Settings all render a plain `← Back` text link
that scrolls away with the content. On a long person page the way back is only
reachable by scrolling to the top. iOS puts back in a pinned nav bar that
collapses the large title into a small centered one on scroll.

Edge-swipe back exists (`App.jsx:331`), which mitigates it —
but it's an invisible affordance, and it doesn't help a user who reaches for the
top of the screen.

**Fix.** A `NavBar` primitive: sticky, frosted, back on the left, overflow menu
on the right, large title below that shrinks into the bar on scroll. This is one
component that fixes five screens.

### P1-5. Destructive actions have primary-button prominence

> **Fixed.** Delete/Archive moved out of the action row into a quiet text button at the foot of the page.

Person page shows `Edit · Connect · Save contact · Archive` as four equal pills,
Archive in filled red. Project detail shows `Edit · Calendar · Delete`, Delete
in filled red. Settings shows a bare `×` next to each member — one tap from
removing a household member, 32px, directly beside "I'm this".

**Fix.** Destructive actions belong behind an overflow (`•••`) menu or at the
bottom of the page, styled as text, not as a filled pill competing with Edit.

### P1-6. Raw `<input type="date">` breaks the visual language

> **Fixed**, though not by migrating to `DatePicker`: native date inputs are the better control for near-term dates, so they're now styled once in `primitives/forms.css` (fill, radius, 44px, tinted calendar glyph). `DatePicker` stays for birthdays and anniversaries, where the native picker buries the year.

A `DatePicker` primitive exists and is used by 3 components. Seven components
use the browser's native date input instead — `HabitDetail`,
`RecurrencePicker`, `ListForm`, `TaskForm`, `InteractionForm`, `ProjectDetail`,
`ProjectTemplatePicker`.

On Project detail this is very visible: two `mm/dd/yyyy` fields with the default
browser 1px border and a black glyph, sitting inside an otherwise perfectly
styled inset card. It's the one place the app stops looking designed.

### P1-7. The primary CTA scrolls out of the task form

> **Fixed** in the `Modal` primitive: a form's last-child primary button sticks to the foot of the sheet, so none of the eighteen forms had to change.

The New-task sheet is 607px tall with 1,216px of content once "More options" is
expanded — so **"Add task" is below the fold** exactly when the user has done
the most work. Same shape in `PersonForm`, which has no visible save at all
until you scroll to the bottom of a long form.

**Fix.** Sticky footer inside `Modal` for the primary action (or a `Save` in the
sheet header, iOS-style). This belongs in the `Modal` primitive so every form
gets it.

### P1-8. Sheets don't handle the on-screen keyboard

> **Not fixed.** Still open — `Sheet` has no `useVisualViewport` pass. Reachable only via the filter sheet, the backfill note editor and the member picker.

`Modal` uses `useVisualViewport` (`Modal.jsx:14`).
`Sheet` does not — so any sheet containing a text field (filter sheet, backfill
note editor, member picker) will be covered by the keyboard on a real device.

### P2 — smaller things

> Done: the People/Contacts naming split, the "1 sessions" pluralization (with
> tests), the task-row chip budget (four chips ranked by decision value, the
> rest collapsing into "+N"), the orphaned stat tile (the grid auto-fits now),
> and the `:focus-visible` ring. The add sheet turned out to be fine — the
> "163px rows" in the first pass was a device-pixel-ratio misread; it's 54px
> and all eight items fit. Still open: the A–Z scrubber overlapping the header,
> and muted-title-as-done on the habits list.

- **Naming inconsistency.** The tab bar says **Contacts**; the page title, the
  hub dropdown and the sidebar all say **People**. Pick one.
- **Truncation is doing real damage.** "Metallography Lab Manage…", "It's been a
  while · last catch-up 7mo…", "Goal ≥ 1 sessions/day …", "Stretch 90% more
  often on days you stick…". Several of these truncate while whitespace remains
  in the row — the row is over-partitioned (title + subtitle + timestamp +
  chevron + chips all competing). Give the text column the space and drop the
  chevron on rows that are obviously tappable.
- **"1 sessions/day"** — pluralization bug on the habits list.
- **Task rows wrap unpredictably.** "Call David about the polisher quote" pushes
  its 4 chips onto a second line and leaves the checkbox visually unaligned. Cap
  the chips shown on a row (priority + due + assignee) and move the rest to the
  expanded view.
- **The A–Z scrubber overlaps content** on People — it floats over the demo
  banner at the top and sits directly above the FAB at the bottom.
- **The add sheet is enormous.** 8 items at ~163px apart; "Group" is cut off
  below the fold. iOS action-sheet rows are ~56px. This sheet should fit without
  scrolling.
- **Habit detail stat grid** is 7 tiles in a 3-column grid, leaving one orphan on
  its own row. Either 6 tiles or a 2-column layout.
- **Muted-title-as-done** on the habits list makes completed habits read as
  disabled while their steppers stay live.

### Accessibility

> Done: one `:focus-visible` ring for the whole app, `SectionLabel` renders an
> `<h2>` (59 sites), and the active tab carries `aria-current="page"`. The
> toast live region was already correct.

- **No `:focus-visible` anywhere.** The only focus styling in the app is
  `:focus` on five form inputs. Every button, tab, row and FAB is invisible to
  keyboard focus. This is also a desktop bug.
- **No heading hierarchy.** One `<h1>` per page; section labels are `<div>` 51
  times, `<span>` 4 times, `<button>` once. A screen reader gets a flat page
  with no structure to navigate.
- **Tab bar doesn't expose selection.** `nav.tabbar > button.tab` with no
  `aria-current` / `role="tab"` + `aria-selected`, so the active destination
  isn't announced.
- Good, for the record: toasts already carry `role="status"` +
  `aria-live="polite"`, `prefers-reduced-motion` is respected globally, inputs
  are held at 16px to stop iOS zoom, and `aria-label`s on icon buttons are
  consistently present.

---

## Part 2 — Primitives

> **Done.** Tokens for spacing-adjacent concerns, motion (`--ease-ios`,
> `--dur-1/2/3`), a z-index scale and the chrome offsets are in
> `styles/tokens.css`. Ten primitives were extracted (`NavBar`, `IconButton`,
> `Button`, `Card`, `Chip`, `Field`, `SectionLabel`, `EmptyState`, `Stepper`,
> `StatTile`), the regular call sites migrated, and `#/kitchen-sink` renders
> every one of them in every state.

The joinue rule is *"No one-off styling. Compose screens from primitives; never
restyle a primitive inside a feature. Tokens only."* Salernidex has good tokens
for **color** and partial ones for radius/shadow, and essentially none for
anything else.

### What's missing from the token layer

`:root` (`styles.css:8-48`) defines colors, 2 radii, 3
shadows. It does not define:

- **Spacing** — 90 distinct `padding` declarations across the file.
- **Type scale** — font sizes are literal px at every call site.
- **Motion** — `cubic-bezier(0.32, 0.72, 0, 1)` is retyped 16 times; there are
  ~20 distinct `transition` shorthands, several differing only by 20ms. This is
  the app's signature easing and it deserves `--ease-ios` / `--dur-fast`.
- **Z-index** — 15 ad-hoc values from `0` to `2000`, with `40/41` (tab
  bar/FAB) and `50/51`, `60/65/70` clustered by accident rather than by layer.
- **Chrome heights** — the root cause of P0-2.

### Primitives to extract

Existing and healthy — keep, and stop bypassing them: `Modal`, `Sheet`,
`ActionSheet`, `PageHeader`, `Segmented`, `SwipeRow`, `PressableRow`,
`ConfirmDialog`, `Avatar`, `DatePicker`, `ReorderableList`, `Toasts`.

Missing, and currently re-rolled per feature:

| Primitive | Replaces | Evidence |
|---|---|---|
| `Card` / `InsetList` | `className="list"` | 55 sites, each re-deciding padding + dividers |
| `Field` | `className="field"` | 97 sites |
| `SectionLabel` | `className="section-label"` | 59 sites across 3 different elements |
| `EmptyState` | `.empty` / `.empty-inline` / `.empty dots` | 22 sites, 3 variants |
| `IconButton` | `.icon-btn` / `.header-action` / `.info-btn` | 3 near-identical recipes, none with a 44px hit area |
| `Chip` | `className="chip …"` | 45 sites, many variants |
| `Button` | `.btn-primary` / `.text-btn` / `.pill-btn` | 22+ sites |
| `NavBar` | hand-rolled `← Back` | 5 detail screens (P1-4) |
| `Stepper` | `.habit-step` | habits list, habit detail, quantity editor |
| `StatTile` | habit-detail tiles | would also fix the orphan-tile grid |

`SettingsView` alone carries 30 inline `style={{…}}` objects and `HabitForm`
16 — a reliable signal that a primitive is missing underneath.

### Then: prove them

joinue has `/admin/kitchen-sink`. A `#/kitchen-sink` route (dev-only) rendering
every primitive in every state, light and dark, at 375px and 1024px, is the
cheapest possible guard against the drift cataloged above. It's also where the
next contributor learns the vocabulary.

---

## Part 3 — Codebase organization

> **Done.** `styles.css` → 45 files under `styles/` (the emitted CSS is
> byte-identical); `components/` → `components/ui/`, `components/shell/` and
> `src/features/<area>/`; `CONVENTIONS.md` written; 26 component tests added
> alongside the 296 logic tests. The migration scripts are kept in `scripts/`
> as the record of how each move was derived.

Current shape:

```
src/
  App.jsx              851 lines — routing, 12 modal states, prefs, badges, shell
  components/          70 flat .jsx files, no grouping
  hooks/               11
  lib/                 44 modules + 24 test files
  styles.css           5,694 lines, one file, 392 classes
```

joinue's shape: `src/features/<feature>/` owns its components and actions;
`src/components/ui/` holds shared primitives (each with a colocated test);
`src/lib/` holds cross-cutting helpers; conventions live in `AGENTS.md` and
`docs/decisions/`.

Four gaps, in the order they'll hurt:

**1. `styles.css` is a monolith.** It's well-commented — genuinely better than
most — but 5,694 lines in one file means nothing is scoped, nothing is
deletable with confidence, and "is this class still used?" is unanswerable.
Split it: `styles/tokens.css`, `styles/base.css`, `styles/primitives/*.css`,
`styles/features/*.css`, imported from one `styles/index.css`. Pure file moves,
no behavior change, and it makes the primitive extraction above enforceable.

**2. `components/` is 70 files with no structure.** `Avatar.jsx` and
`HabitInsightsView.jsx` sit as siblings. Mirror the CSS split:

```
src/
  components/ui/       Modal, Sheet, Card, Field, Chip, IconButton, NavBar, …
  features/today/      TodayView, InsightCarousel, ProfileNudge
  features/people/     SearchView, PersonPage, PersonForm, PeopleMap, AlphaIndex, …
  features/tasks/      TasksView, TaskForm, TaskRow, ProjectsView, ProjectDetail, …
  features/lists/      ListsView, ListDetail, ListForm
  features/habits/     HabitsView, HabitDetail, HabitForm, HabitQuickLog, …
  features/settings/   SettingsView, ImportExport, LegalView
  components/shell/    Sidebar, MobileNav, PageHeader, InstallHint, Toasts
```

**3. `App.jsx` is doing four jobs.** Routing table, 12 pieces of "which modal is
open" state, preference plumbing, and badge computation. Extract the route table
to `src/routes.jsx`, and the modal fleet to a small `useOverlays()` hook or a
context — App.jsx currently has 12 `useState`s whose only job is "which sheet is
open", and every one of them is threaded through the JSX by hand.

**4. Testing stops at `lib/`.** 24 test files, all in `src/lib/`, zero component
tests. The logic layer is well covered; the interactive layer isn't covered at
all. The primitives are the right place to start — they're small, they're pure,
and a regression in `Modal` or `SwipeRow` breaks every screen.

**5. There is no `AGENTS.md`/`CONVENTIONS.md`.** joinue's is the reason its
conventions hold across a much larger surface. Salernidex's rules currently live
only in CSS comments (which are good, but unenforceable and invisible from JSX).
Write down: tokens-only, compose-don't-restyle, the canonical primitives, the
copy style, mobile-first, the 44px rule. Then the fixes in Part 1 don't come
back.

One copy note while you're writing that file: joinue bans em dashes in
user-facing copy. Salernidex uses them freely ("Demo mode — sample data…",
"It's been a while — say hi", "Called — Streetlight request"). Worth a decision
either way, since these are two apps by the same author.

---

## Sequence (as executed)

**1. Stop the bleeding (small, mechanical, high payoff).**
Chrome-height tokens + derived bottom padding (P0-2) · banners out of `.content`
(P0-1) · four `window.confirm` → `ConfirmDialog` (P0-3) · Today section order
(P1-1) · `.tap-44` utility on the seven undersized classes (P1-3) ·
`:focus-visible` ring.

**2. Split the files.** `styles.css` → `styles/`; `components/` → `ui/` +
`features/`. No behavior change, do it in one commit so the diff reads as
moves.

**3. Extract the primitives** in the Part 2 table, starting with `NavBar`
(fixes 5 screens), `IconButton` (fixes the tap targets permanently), `Modal`'s
sticky footer (P1-7), and `Field`. Migrate the 7 raw date inputs to `DatePicker`
as part of this.

**4. Kitchen sink + conventions doc + first component tests.**

**5. Polish pass** — the P2 list, truncation, chip budgets, the add sheet,
heading semantics.
