# Salernidex engineering conventions

The concise rulebook, for people and AI alike. `README.md` is the product tour;
`ROADMAP.md` is the phase history; `docs/ui-ux-review.md` is the review these
rules came out of.

## Architecture

```
src/
  components/ui/     shared primitives — every screen composes these
  components/shell/  app chrome (sidebar, tab bar, page header, toasts, Quick Find)
  features/<area>/   one folder per area; owns its screens, forms and rows
  hooks/             cross-cutting React hooks
  lib/               pure logic + data access, with colocated *.test.js
  styles/            tokens → base → primitives → features (see styles/index.css)
```

A component belongs in `ui/` when two features would both reach for it, in
`shell/` when it's app chrome, and in `features/<area>/` otherwise. Nothing in
`ui/` may import from `features/`.

## Styling

- **Tokens only.** No hardcoded colour, radius, shadow, easing, duration,
  z-index or chrome offset. They all live in `src/styles/tokens.css`. If you
  need a value that isn't there, add it there.
- **Compose primitives; never restyle one from a feature.** If a primitive
  doesn't fit, give it a variant — don't override its classes from
  `features/*.css`.
- Mobile-first. Desktop is the wide-screen treatment, not the design target.
- iOS feel: system font, negative tracking on large titles, uppercase tracked
  section labels, `tabular-nums` on anything that ticks, 0.5px hairlines between
  siblings only, press feedback, `--ease-ios` for anything that moves.
- The stylesheet order in `styles/index.css` **is** the cascade. Add a file in
  the section it belongs to; don't reorder the imports to win a specificity
  fight.

## Layout arithmetic (the rule that broke most often)

The floating tab pill and the FAB are `position: fixed`, so any scroll
container has to reserve room for them. **Never type a bottom offset.** Derive
it:

```css
--chrome-bottom   /* top edge of the tab pill */
--fab-bottom      /* where the FAB sits */
--content-bottom  /* what a scroller must reserve so its last row clears both */
```

A `position: sticky` offset inside a scroller resolves against that scroller's
**content** edge, so the container's own padding is already part of the offset
and has to be subtracted back out — see `.list-add-dock` and `.navbar`, both of
which publish `--main-pad-*` for exactly this. Getting this wrong is what put
list rows permanently under the add composer.

`node scripts/mobile-audit.mjs` fails if any control ends up under the chrome.

## Touch targets

44×44 minimum (Apple HIG), measured on the **hit area**, not the painted box.
Controls paint at whatever size the design wants and get their target from the
`.tap-target` extension in `styles/base.css`. Use `IconButton` rather than a
bare `<button className="icon-btn">` and this is free.

Adjacent icon buttons need **≥12px** between them, or their 44px areas overlap
and the later sibling wins the hit test (this is how the right edge of "Edit
list" used to open "Delete list").

The A–Z scrubber is the one documented exception: it's a drag strip, not 27
buttons.

## Accessibility

- One focus ring for the whole app, in `base.css`, on `:focus-visible`. Don't
  define another.
- Section headings go through `SectionLabel`, which renders an `<h2>`. A page
  should have a heading outline, not one `<h1>` and 50 `<div>`s.
- Every icon-only control needs an accessible name. `IconButton` requires
  `label`; decorative icons inside a labelled control take `aria-hidden`.
- The active tab carries `aria-current="page"`.

## Destructive actions

- **Never `window.confirm`.** Use `useConfirm()` (`hooks/useConfirm.jsx`), which
  wraps `ConfirmDialog` in a promise so the call site still reads
  `if (await confirm({…}))`.
- State the consequence, not "are you sure": *"Its 3 subtasks go too. This
  can't be undone."*
- A destructive action doesn't get primary weight. Prefer `Button variant="text"
  tone="danger"` or an overflow menu over a filled red pill sitting next to Edit.

## The primitives

Check `#/kitchen-sink` (dev only) before inventing a control — it renders every
primitive in every state, and it's the fastest way to review a token change.
Add a specimen there whenever you add one.

| Primitive | For |
|---|---|
| `NavBar` | detail-screen chrome: sticky back, trailing actions, large title that collapses into the bar |
| `PageHeader` | top-level screen title, `createAction` for the page's own "new" (desktop only — mobile has the FAB) |
| `Card` | the grouped inset list surface |
| `SectionLabel` | the uppercase label above a card, optional trailing action |
| `Field` | label + control + hint/error, with the label wired to the control |
| `Button` | `primary` / `pill` / `text`, `tone="danger"` |
| `IconButton` | every icon-only control |
| `Chip` | tags, dates, statuses; pick a **tone**, never a colour |
| `EmptyState` | empty and loading states, with an optional way forward |
| `Stepper` | −/value/+ |
| `StatTile` + `StatGrid` | a figure with its caption |
| `Modal` / `Sheet` / `ActionSheet` / `ConfirmDialog` | overlays |
| `SwipeRow` / `PressableRow` / `ReorderableList` | row interaction |
| `Segmented` / `DatePicker` / `TagInput` / `AssigneePicker` / `PrivacyField` | inputs |

A form sheet's primary button is the **last child of its `<form>`**; `Modal`
sticks it to the foot of the sheet from there, so no form has to arrange that
itself.

Dates: native `<input type="date">` for near-term dates (the OS picker and
keyboard entry win), `DatePicker` for birthdays and anniversaries reaching
decades back (where the native picker buries the year). Both are styled by
`styles/primitives/forms.css`.

## Testing

- Vitest. `npm test`. Logic and utilities live in `src/lib/` with colocated
  `*.test.js`; primitives with real behaviour have `*.test.jsx` beside them in
  `components/ui/`.
- Test behaviour, not markup. Skip purely presentational wrappers.
- `node scripts/mobile-audit.mjs` guards chrome occlusion and touch targets.
- `node scripts/demo-smoke.mjs` (and the other `*-smoke.mjs`) drive the demo in
  a real browser. Keep them passing; a red suite is worse than no suite.

## Demo mode

No `.env` means demo mode: in-memory sample data, any login works. Every feature
should be visible there, because it's how the app gets reviewed.

## Copy

- Warm, not salesy. The relationship features read like staying close to people
  you care about, never like working a pipeline.
- Keep it short enough not to truncate at 375px. If a line needs an ellipsis to
  fit, it's the wrong line.

## Commits

Concise and human. No AI attribution or `Co-Authored-By` trailers.
