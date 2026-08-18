# Mobile UI/UX + feature audit — 2026-08-18

> **Record** — findings true on 2026-08-18 against `main` @ `ad3c356`. The
> findings below are left exactly as written; this header carries what has since
> been done, per the instruction the original version of it gave.
>
> **Acted on (2026-08-18, same day):** items 1 and 2 of the recommended order.
>
> - **P0, multi-select unusable on a phone — fixed.** `MobileNav` now stands
>   down on selection the same way it does for the software keyboard, so the bar
>   genuinely replaces the tab bar rather than stacking under it. Two further
>   occlusions surfaced while verifying and were fixed with it: List detail's add
>   dock stayed on screen (`hidden` loses to the dock's own `display` rule, so it
>   is unmounted now) and the bar's own actions **overflowed at 393px** — 419px of
>   content in a 369px bar — which flex resolved by laying "All" on top of the
>   cancel button. Actions go icon-only below 520px.
> - **P1, the audit only inspected resting state — fixed.** `mobile-audit.mjs`
>   has a modes pass that enters selection on Tasks, Notes and List detail and
>   hit-tests every action with `elementFromPoint`. Verified against the bug:
>   reverting the `MobileNav` change reproduces this record's exact finding
>   (20 issues, `"Done selecting" → tab`), and restoring it returns to clean.
>   A mode it cannot enter counts as a failure rather than a skip, so this cannot
>   quietly decay back into a resting-state-only audit.
>
> **Still open:** everything in Parts 2–4 — the contrast tokens, the `rem`
> migration, reduced-motion, the nav orphans, the mobile lens, the offline
> indicator, and the `ROADMAP.md` / `next-steps.md` re-stamp. Items 3–7 of the
> recommended order stand as written.
>
> See [`docs/README.md`](../README.md) for how the docs are organized.

Audited 2026-08-18 against `main` @ `ad3c356`, demo data, headless Chrome at
iPhone 14 Pro (393×852). Evidence: the five audit scripts, a scripted
occlusion probe in selection mode, WCAG relative-luminance computed from
`tokens.css`, and a read of the shell plus the subsystems that landed in
`28026b3` / `ad3c356`.

**Verdict.** The app is in good shape and the automated tooling is genuinely
strong — all five audits pass, 1,289 tests green. The findings are therefore
concentrated in what those audits *structurally cannot see*: they inspect a
route at rest, so nothing that only exists in a mode is ever measured. That gap
is where the one critical bug lives, and it makes a shipped feature unusable on
a phone.

---

## The blind spot

Every audit passes at this commit:

```
audit:mobile   Clean: no occluded controls, no target under 44px.
audit:zoom     Clean: every text control is at least 16px — no iOS focus zoom.
audit:frame    Clean: 8 devices × 24 routes, no framing findings.
audit:hover    clean (59 stylesheets)
audit:notes    Clean: notes hold up with a keyboard.
```

Each one loads a route, measures, and leaves. None enters a mode — none
long-presses a row, taps "Select", opens a snooze sheet, or goes offline.
`mobile-audit.mjs` was written to catch "the floating tab pill sitting on top of
a control the user is meant to tap", and that is exactly the bug it is currently
blind to.

---

## Part 1 — Critical

Severity: **P0** breaks a real interaction · **P1** materially hurts one ·
**P2** worth fixing · **P3** polish.

### P0 — Multi-select is entered but cannot be used or cancelled on a phone

[`selection.css:10`](../../src/styles/primitives/selection.css) ·
[`App.jsx:1240–1249`](../../src/App.jsx#L1240)

`.selection-bar` and `.tabbar` resolve to the **identical rectangle**. Both are
`position: fixed`, both sit at `bottom: var(--tabbar-inset)`, and both carry
`z-index: var(--z-chrome)` — 40. At equal z-index the later sibling in the DOM
paints on top, and `SelectionBar` renders inside `<main>` (which closes at
`App.jsx:1240`) while `MobileNav` renders after it at `App.jsx:1249`.

Measured on `/tasks` in selection mode, iPhone 14 Pro:

```
selection-bar  y=586 h=58  z=40
tabbar         y=586 h=58  z=40   overlaps: true

elementFromPoint at each action's centre:
  "Done selecting"  → TABBAR
  "All"             → TABBAR
  "Done 1 task"     → TABBAR
  "Copy 1 task"     → TABBAR
  "Delete 1 task"   → TABBAR
5 of 5 actions unreachable
```

Every action is dead, **including cancel**. The only way out is tapping a
tab-bar destination underneath, which navigates away rather than exiting the
mode. Confirmed empirically on Tasks; [`NotesView.jsx:655`](../../src/features/notes/NotesView.jsx#L655)
and [`ListDetail.jsx:914`](../../src/features/lists/ListDetail.jsx#L914) render
the same component from the same stylesheet at the same position in the tree, so
they share it.

**Fix.** Hide the tab bar while selecting rather than stacking on it. That is
what the CSS comment already claims happens — *"Sits OVER the tab bar, not above
it… Same z-layer as the chrome it replaces"* — and it is the iOS pattern.
`MobileNav` already has a stand-down path for the software keyboard (`tucked` +
`inert`); drive the same path from selection state. Raising `.selection-bar` to
a layer above `--z-chrome` also clears the paint order, but leaves two live bars
stacked with the tab bar's hit areas still active underneath.

### P1 — The audit that should have caught this only inspects resting state

[`scripts/mobile-audit.mjs`](../../scripts/mobile-audit.mjs)

The measurement code is already written and correct; it simply never has a
selection bar on screen to measure. The same blindness covers the add-dock on
List detail, snooze sheets, and the note formatting bar.

**Fix.** Add a modes pass — for each route that has one, enter the mode, re-run
the existing occlusion check, exit. Do this *second*, not last: it is what stops
the class from recurring, and it validates the P0 fix.

### P2 — The tab pill moves twice, and neither move is its own fault — FIXED

[`tabbar.css:6`](../../src/styles/shell/tabbar.css#L6) ·
[`useScrollLock.js`](../../src/hooks/useScrollLock.js) ·
[`useViewportSettled.js`](../../src/hooks/useViewportSettled.js)

Reported from a device, not from a script, and for the reason above: both are
transient, and both are about the *viewport* rather than the layout. The pill is
`position: fixed` against a floor built from `env(safe-area-inset-bottom)`, and
that floor is not a constant — the browser revises it, twice, for reasons that
have nothing to do with this app.

**Opening a sheet moved it.** Every overlay takes a scroll lock, and on a phone
that lock pins the body (`scroller.js`) so the document can no longer scroll.
Browsers answer that by changing what the bottom of the viewport means: iOS
Safari brings its toolbar back out — which flips `env(safe-area-inset-bottom)`
between 0 and ~34px, an 18px step through `--tabbar-inset` — and a desktop
window narrow enough to be on the phone shell loses its scrollbar and widens by
8px. Every overlay did this; the right-hand nav drawer is just the one that
covers 310px and leaves the pill on screen to be watched.

**Launching the installed app moved it.** `black-translucent`
([`index.html:17`](../../index.html#L17)) makes the iOS web view full-bleed, but
WebKit lays the page out once *before* applying that, against a rectangle inset
for chrome the app doesn't have — so the pill draws high and drops when the
correction lands, which reads exactly like the app leaving room for a URL bar.
`useViewportSettled` existed to cover this and missed, because it waited on
`window` `resize` and WebKit reports the correction on `visualViewport`, if at
all: iOS can defer it as far as the first touch.

**Fix.** Three parts, because the floor can't be held still and shouldn't be.

1. Don't paint the pill while the page is covered. `useScrollLock` now publishes
   the lock as a subscribable signal (`useOverlayOpen`) and `MobileNav` withholds
   the bar on it — opacity and `inert`, not `tucked`, since a slide off the edge
   is motion and motion is the complaint. Behind a backdrop this costs nothing.
2. `useViewportSettled` watches `visualViewport` resize as well as `window`, so
   the launch correction is seen where it is actually reported.
3. `.tabbar` transitions `bottom`. `CAP` still bounds how long the bar can be
   withheld — a bar that never arrives is worse than one that arrives 18px low —
   so a correction landing after the fade glides rather than teleports. That tail
   is unavoidable: if iOS defers the truth to the first touch, no amount of
   waiting produces it sooner.

Covered by `MobileNav.test.jsx` for the overlay half. The launch half is not
testable in jsdom and wants a device check — the open question is whether
`visualViewport` reports the true screen height at launch while `innerHeight` is
still stale. If it does, anchoring the pill to the measured band
([`useVisualBandBottom`](../../src/hooks/useKeyboardOpen.js#L96), already used by
the notes toolbar) removes the guess entirely instead of smoothing it.

---

## Part 2 — Accessibility

Both issues live in tokens rather than components, which makes them cheap to fix
and currently applied everywhere.

### P1 — The secondary and tertiary text ramps fail WCAG AA

[`tokens.css:23–24`](../../src/styles/tokens.css#L23)

`--text-2` carries 125 usages and `--text-3` another 55 — subtitles, row counts,
metadata, placeholders. Ratios computed to WCAG 2.1 relative luminance:

| Token | On | Ratio | AA body (4.5:1) |
|---|---|---|---|
| `--text` (light) | `--surface` | 17.01:1 | Pass |
| `--text-2` (light) | `--surface` | 3.44:1 | Large text only |
| `--text-2` (light) | `--bg` | 3.08:1 | Large text only |
| `--text-3` (light) | `--surface` | **1.95:1** | **Fail** |
| `--text-3` (light) | `--bg` | **1.75:1** | **Fail** |
| `--text-2` (dark) | `--surface` | 5.94:1 | Pass |
| `--text-3` (dark) | `--surface` | **2.52:1** | **Fail** |
| `--accent` | `--surface` | 4.02:1 | Large text only |

Note the asymmetry: **light mode is the weaker theme.** Dark mode's `--text-2`
passes comfortably at 5.94:1 while light mode's sits at 3.44:1. These are
Apple's system greys, and Apple uses them over vibrancy and at larger optical
sizes — borrowed as flat hex on a white card they lose the context that made
them legible. `--text-3` at 1.95:1 is below even the 3:1 floor for non-text UI.

**Fix.** Two values in `tokens.css`, and every usage inherits. `--text-2:
#6b7078` reaches ~4.6:1 on white. `--text-3` needs the bigger move, to roughly
`#74797f` — keep it reading quieter than `--text-2` by dropping its *size and
weight* rather than its contrast, which is the lever that was doing the work at
1.95:1. `--accent` is fine on large text and filled buttons but should not carry
14px links at 4.02:1.

### P1 — Every font size is px, so the user's text-size preference does nothing

**249 px font-sizes across `src/styles`, and zero `rem`.** Someone who has
turned up Larger Text on iOS, or raised the default font size in a browser, gets
a pixel-identical app. For a product whose stated design law is best-in-class
mobile and elegant iOS, this is the widest gap between the claim and the build,
and WCAG 1.4.4 covers it directly.

**Fix.** A mechanical migration with one real constraint: the 16px minimum on
inputs exists to stop iOS focus-zoom and `audit:zoom` enforces it. Convert the
type scale to `rem` against a 16px root, floor inputs at `max(1rem, 16px)` so
the zoom guard survives, and leave structural values in px — border radii,
chrome heights, the 44px tap floor. Worth its own commit so `audit:zoom` and
`audit:frame` gate it.

### P2 — Reduced-motion is honored in a minority of the files that animate

38 stylesheets declare `animation` or `transition`; 7 have a
`prefers-reduced-motion` block. The sheet-up transition, view transitions, toast
entrances and the swipe-row spring all move regardless. Beyond vestibular
sensitivity, this is where the iOS impression is thinnest — the OS takes that
setting seriously.

**Fix.** One global guard in `base.css` reducing durations to near-zero, then
let the seven files that already opt in keep their bespoke handling. Cheaper and
more complete than continuing per-file.

---

## Part 3 — Navigation and information architecture

[`lib/nav.js`](../../src/lib/nav.js) is a genuinely strong piece of design.
Three things sit outside it.

### P2 — Activity and Board are nav orphans

Both are in `KNOWN_ROUTES`; neither is in `DESTINATIONS`, so neither appears in
the drawer or in any bar.

- **Activity** is reachable on a phone only from the feed at the bottom of Today
  ([`App.jsx:965`](../../src/App.jsx#L965)).
- **Board** is reachable only from a row in Settings
  ([`SettingsView.jsx:901`](../../src/features/settings/SettingsView.jsx#L901)) —
  a whole lazy-loaded view with its own test suite, behind the least-visited
  screen in the app.

This is the same failure the nav table was written to fix. Its own header says
it: *"Notes ended up a top-level feature reachable on a phone from exactly one
button on the Today page."* Two more features have since landed in that
position.

**Fix.** Decide deliberately for each. Activity reads like a drawer destination.
Board is a mode over Tasks rather than a place, so it may belong as an action on
the Tasks header instead — but "findable only from Settings" isn't the answer to
either.

### P2 — The area lens on mobile kept the shape the desktop rail was just fixed for

[`AreaSwitcher.jsx`](../../src/components/shell/AreaSwitcher.jsx) ·
[`areas.css:170`](../../src/styles/features/areas.css#L170)

`28026b3`/`ad3c356` rebuilt the `rail` variant into a single fixed-height
trigger that names the active lens and opens a menu, because pills *"wrapped, so
each row of them shoved Today / Tasks / Lists further down."* The phone kept the
horizontal scroller. Three consequences:

1. **The active pill can be off-screen.** There is no `scrollIntoView` anywhere
   in the component, so arriving on Tasks with the fifth of eight areas selected
   shows a row starting at "All", with the thing filtering the page past the
   right edge.
2. **It scrolls away.** The row is `position: static`, so scrolling down Tasks
   leaves nothing on screen answering *"why is this list short?"* — while the
   lens persists across launches, so you can open the app already filtered.
3. **It costs ~45px on six routes** (8px padding ×2, ~29px pill, 6px margin) on
   the app's most-used screens.

The codebase already argues this case against itself: `PageHeader`'s `filter`
prop is documented as belonging on the title row *"because a filter row under
the header scrolls away from the thing it's filtering"* — which is what the lens
does.

**Fix.** Give the phone the rail's new shape — a compact `● Work ▾` control that
opens a picker. One constraint found while checking: on Tasks the title-row
`filter` slot is already spent on the member dropdown
([`TasksView.jsx:563`](../../src/features/tasks/TasksView.jsx#L563)), and on
Tasks / Projects / Reminders the title itself is a `workNav` dropdown. So the
lens wants a slot of its own rather than either existing one. Failing that, the
two-line version is a `scrollIntoView` on the active pill at mount.

### P3 — No horizontal scroller reveals its own selected item

Eight `overflow-x: auto` rows — areas, filter pills, note tags, lists, habits,
the people index. Every `scrollIntoView` call in the app serves keyboard nav,
the alpha index, or editor focus; none serves a selected chip. Wherever a
selection can sit past the fold, it does.

**Fix.** One shared hook that scrolls the `.on` / `aria-pressed` child into view
on mount and on change, applied to all eight.

---

## Part 4 — Feature set

Against [`ROADMAP.md`](../../ROADMAP.md) and what is actually in the tree, which
have drifted apart.

### Offline Tier 2 shipped, and the UI never mentions it

[`mutationQueue.js`](../../src/lib/mutationQueue.js) ·
[`useData.js:455`](../../src/hooks/useData.js#L455)

The durable write queue landed: IndexedDB-backed, ordered, `MAX_ATTEMPTS`, and a
staleness guard scoped to the 14 tables carrying the `touch_updated_at` trigger.
It is well-argued and it closes what the roadmap calls table stakes.

But **nothing surfaces it.** There is no offline indicator and no pending count
anywhere in the JSX; the only user-visible signal is an error toast when a write
is finally *dropped*. Offline and online look identical. In a shared household
app that matters more than in a solo one: you add milk to the list, your partner
doesn't see it, and the app gave you no reason to suspect why.

**Fix.** A quiet ambient state — the header or bar tinting with "Offline · 3
waiting", clearing when `drain` completes. The queue already knows the count;
nothing on screen asks it.

### P2 — The roadmap is now wrong about the thing it calls table stakes

[`ROADMAP.md:60`](../../ROADMAP.md) still lists Offline Tier 2 under Remaining
and states *"Writes are not queued and an offline write is silently lost"*. Both
halves of that entry — durable queued writes **and** `updated_at` guarding — are
built. The file is stamped against `c90e43a`; main is `ad3c356`.

**Fix.** Move Offline Tier 2 to Done with the caveat that `list_items` stays
last-write-wins (no trigger, and one of the busiest write paths there is —
`mutationQueue.js` says so plainly). Re-stamp both this and `next-steps.md`.

### Habits are now the only fileable thing outside the lens

`habits.area_id` has existed since `0040` and nothing sets it — there is no
picker in [`HabitForm.jsx`](../../src/features/habits/HabitForm.jsx), so
`habits` stays out of `AREA_SCOPED_ROUTES`. That was defensible when tasks and
lists were the only things filed. `300cc3c` gave reminders and notes their
pickers, so the count is now five with and one without.

**Fix.** Small and self-contained: an `AreaPicker` in `HabitForm`, then add
`habits` to `AREA_SCOPED_ROUTES` in the same commit — the code comment in
`nav.js` already specifies exactly that ordering.

### Two carried-over blockers worth restating

- **Per-member timezone.** `TZ_NAME`
  ([`send-reminders/index.ts:38`](../../supabase/functions/send-reminders/index.ts#L38))
  is one hardcoded zone for the whole system. Already documented as blocking any
  sale outside Arizona, and it is schema work that must land before an App Store
  binary exists. See [`next-steps.md §2a`](../next-steps.md).
- **Attachments.** Still entirely unbuilt — no reference anywhere in `src`.
  [`scopes/competitive-superlist.md`](../scopes/competitive-superlist.md) §3b
  calls it the most household-shaped gap we have, and it's right: "get *this*
  one" is a photo. Note that the ordering constraint recorded in
  [`next-steps.md §2c`](../next-steps.md) — attachments come after durable
  writes — **has now been cleared** by the queue landing.

---

## Recommended order

Sequenced by what unblocks or de-risks what, not by size.

1. **Unbreak multi-select.** A shipped feature is unusable on the primary
   platform. One state-driven change to `MobileNav`.
2. **Teach `mobile-audit` to enter modes.** Second, not last — it stops the
   class from recurring and validates step 1.
3. **Fix the two contrast tokens.** Two hex values, app-wide effect, no
   component churn. The best ratio of legibility gained to code touched here.
4. **Re-stamp `ROADMAP.md` and `next-steps.md`.** Cheap, and these files are
   load-bearing for planning.
5. **Give the phone lens the rail's shape** — or, as a stopgap, scroll the
   active pill into view. Then the shared scroller hook covers the other seven
   rows.
6. **Surface offline state, and re-home Activity.** Two small pieces of
   visibility work on subsystems that already exist and already work.
7. **Migrate the type scale to `rem`.** Last because it is the widest diff and
   wants its own commit with the zoom and frame audits gating it — but it is the
   finding that most separates the app from its own stated design law.

---

## What's already right

Recorded because an audit that only lists faults misrepresents the thing it
audited.

- **The layout arithmetic.** `--tabbar-inset` → `--chrome-bottom` →
  `--content-bottom`, derived rather than typed, is why `audit:frame` passes 8
  devices × 24 routes with zero findings. That is hard to get right and it is
  right.
- **The nav table.** One data structure feeding sidebar, drawer and bar, with a
  test asserting every slot names a real destination. The two orphans above are
  things that never entered it, not failures of it.
- **The write queue's scope discipline.** Explicitly not a CRDT, with the
  `GUARDED_TABLES` limitation stated in the source rather than quietly assumed.
  That comment will save someone a week.
- **The parity suites.** Pinning the client and Edge Function rules to each
  other with test vectors is the correct answer to a known drift risk, and it is
  already paying off.
- **Comment quality throughout.** Nearly every decision carries its rationale.
  Several findings above were reached by taking a comment at its word and
  checking whether the code still honored it.
