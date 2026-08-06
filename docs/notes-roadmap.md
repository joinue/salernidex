# Notes — what's next

Four candidate pieces of work for the notebook, written up after the desktop
rework. This is a scope, not a build: each section says what exists today, what
the change actually is, where it gets hard, and what it costs. They're
independent — any subset ships coherently.

The desktop rework already landed: two panes above 900px, a card gallery, a
sticky filter bar, keyboard navigation with real focus, and `notesSort` in
`appPrefs`. What follows is the next tier, roughly in the order I'd do it.

| # | Idea | Cost | Schema? | Blast radius |
|---|---|---|---|---|
| 1 | Note-to-note links | medium | none | notes only |
| 2 | Search match highlighting | small | none | notes only |
| 3 | Multi-select + bulk actions | medium | none | notes + `useData` |
| 4 | Rail selection shouldn't spam Back | small | none | **the router** |

---

## 1. Note-to-note links

The biggest functional gain available here, and the one worth doing first.

### What exists today

A note's body can `@`-mention six kinds of thing — `MENTION_TYPES` in
`lib/notes.js` is `['person', 'organization', 'group', 'project', 'list',
'task']`. Notably *not* another note. So the notebook is the one part of the app
that can point at everything except itself.

The machinery is already generic:

| Piece | State |
|---|---|
| `notes.mentions` (`jsonb`, `[{type,id}]`) | untyped at the DB level — **no migration needed** |
| `extractMentions(html)` | type-agnostic; reads whatever the chips say |
| `sanitizeNoteHtml` | validates `data-type` against `MENTION_TYPES`, nothing else |
| `notesMentioning(notes, type, id)` | already takes an arbitrary type |
| `NoteBacklinks` | already a drop-in section, used on five pages |

So the happy path is genuinely small: add `'note'` to `MENTION_TYPES`, add notes
to `mentionCandidates(data)` (excluding the note being edited), add a `note`
case to `openMention` in `App.jsx`, and drop `<NoteBacklinks type="note" />`
into `NoteDetail`. An afternoon.

### The part that isn't small

Three problems the other mention types have been quietly getting away with,
which note links will expose:

**Chip labels go stale.** A mention chip stores its display text in the body
HTML at insert time. Rename the target and the chip lies — permanently, in every
note that referenced it. Today that's tolerable because people and organizations
rarely get renamed. **Note titles change constantly**, and a note with no
explicit title derives one from its first body line, so editing the first
sentence silently renames it. Every chip pointing at it is then wrong.

The fix is to make the chip carry only `data-type` + `data-id` and resolve the
label at render time from `data`. That's a change to how chips render
everywhere, plus a fallback for a target that no longer exists. It is the real
work in this feature, and it retroactively fixes the other five types.

**Dangling links.** Notes are soft-deleted (`deleted_at`, migration `0030`).
Backlinks handle this correctly by accident — `notesMentioning` is fed the
already-filtered live `notes` — but the *forward* chip in the body still renders
and still navigates, landing on "Note not found". A chip whose target is gone
should render inert (no accent, no cursor, not clickable) rather than being a
trapdoor.

**Privacy.** A shared note must never surface a private one through a backlink.
`NoteBacklinks` documents that its `notes` prop must be the privacy-filtered
list; with note-to-note links that contract becomes load-bearing in both
directions and deserves an explicit test.

### Design notes

- **Keep `@`, don't add `[[`.** The picker triggers on the regex at
  `RichTextEditor.jsx:45`. Wiki users will reach for `[[`, but a second trigger
  means a second parser, a second picker, and two ways to express one idea. One
  mechanism, one picker, notes just become another row in it — with a "Note"
  type label, which the picker already renders.
- **Show both directions.** A "Linked notes" section in `NoteDetail` listing
  outgoing links (from `mentions`) *and* incoming ones (`notesMentioning`). The
  two-pane layout has the room; on a phone it sits below the meta row.
- **Exclude self** from the candidate list. Cycles between two notes are fine
  and need no special handling.

---

## 2. Search match highlighting

Small, self-contained, and disproportionately satisfying.

### The problem

`noteSnippet(note, max)` returns the first N characters of the body text —
always from the top. Search matches anywhere. So searching "florence" returns
three rows whose previews contain no "florence" and give no clue why they
matched. At the two-line desktop density this is now very visible.

### The work

Two pieces, and the second is the one that matters:

1. **Highlight the match.** Return React nodes with `<mark>` instead of a
   string. Safe without `dangerouslySetInnerHTML` — `htmlToText` has already
   flattened the body to plain text, so we're wrapping text nodes, not parsing
   markup.
2. **Window the excerpt around the match**, not from the start of the note. A
   new helper alongside `noteSnippet` — something like
   `noteExcerpt(note, needle, max)` returning the segments either side of the
   hit, with a leading ellipsis when it starts mid-body. Pure function, belongs
   in `lib/notes.js` with its tests in `notes.test.js`.

Highlight the title too, since the filter in `NotesView` matches against title,
body, and tags alike.

No schema, no routing, no new state. The one judgement call is what to show when
a note matches only on a tag — probably the normal snippet plus the tag chip
highlighted.

---

## 3. Multi-select and bulk actions

Shift-click a range, then pin, tag, or delete the lot. A real notebook
affordance the app doesn't have at all.

### Where it gets awkward

Rows are `SwipeRow`s whose click opens the note, so selection needs a *mode*
rather than a modifier alone:

- **Enter it** — ⌘/Ctrl-click or shift-click on a fine pointer; long-press on
  touch (`SwipeRow` already exposes `onLongPress`).
- **While in it** — the sticky toolbar becomes a bulk action bar (Pin · Tag ·
  Delete · Done), rows grow checkboxes, and clicking toggles instead of opening.
  In two panes, selecting must not change what the pane is showing.
- **Leave it** — Done, Escape, or an empty selection.

### The actual work is in `useData`

`deleteNote(id)` and `togglePinNote(id)` are per-id, and `deleteNote` fires its
own toast with its own undo. Deleting twelve notes would stack twelve toasts and
twelve separate undos. This needs `deleteNotes(ids)` — one optimistic update,
one sync, one toast, one undo that restores the whole set. Same for a bulk tag
add. That's the majority of the effort; the UI on top is straightforward.

The roving-tabindex work that just landed helps: in selection mode, Space
toggles the focused row rather than opening it, and the selection is
keyboard-drivable for free.

---

## 4. Rail selection shouldn't spam the Back button

The smallest user-visible win of the four, and the largest blast radius. Do it
last, or decide it isn't worth it.

### The problem

`go(path)` in `App.jsx` is `window.location.hash = '/' + path`, and route state
comes from a `hashchange` listener. Every click in the two-pane rail therefore
pushes a history entry. Glance at eight notes and Back walks you through all
eight instead of leaving Notes.

In the split layout the open note is a *selection*, not a screen. Selections
shouldn't be history.

### The proposal

`go(path, { replace })`, where replace does `history.replaceState` **and** calls
`setRoute(parseHash())` directly — `replaceState` does not fire `hashchange`, so
the listener won't do it for us. Use replace only from the split rail; every
other navigation in the app keeps pushing exactly as it does now.

### Why it's riskier than it looks

- It creates a second path into route state. Today there is exactly one
  (`hashchange`), which is a large part of why the router is comprehensible.
- Mobile edge-back (`useEdgeBack` + `DETAIL_ROUTES`) depends on real history
  entries. The phone layout never uses replace, so it should be untouched —
  "should be" is doing work in that sentence.
- The 900px breakpoint means the same click pushes or replaces depending on
  window width. Resize mid-session and history is a mix of both.

It wants its own tests: Back from a rail-selected note lands on whatever
preceded Notes; phone-width navigation still pushes per note; a deep link to
`#/note/<id>` still works cold.

---

## Recommended order

**1 → 2 → 3, and 4 only if the Back behaviour actually annoys someone.**

Note links first because they change what the notebook *is* — and because the
stale-label fix inside them pays off across all six existing mention types.
Highlighting second because it's cheap and makes search feel finished.
Multi-select third: real value, but it's the one that adds a mode, and modes are
where interaction bugs live.

## Deliberately not doing

- **Folders.** Tags plus pinning already cover it, and a second hierarchy in a
  notebook this size is bloat. The desktop rework gave tags a wrapping chip row;
  if that isn't enough, the answer is better tag management, not folders.
- **`[[wiki-link]]` as a second syntax.** See above — one trigger, one picker.
- **Virtualizing the rail.** A household notebook is hundreds of notes, not
  tens of thousands. Not a real problem.
- **Persisting the tag filter.** A filter that survives a relaunch hides notes
  without saying so, which reads as data loss. Sort persists because sorting
  only ever reorders. That line is deliberate and shouldn't drift.
