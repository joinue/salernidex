# Superlist — competitive read & what's worth taking

> **Scope** — a proposal, not a commitment. Written 2026-08-13 against
> Superlist **v1.56** (June 2026) and `main` @ c90e43a.
> Nothing here is agreed work. §3 is the only part recommended for building;
> §4 is two product questions that need an answer before they can be scoped;
> §5 is the list of things deliberately **not** taken, recorded so they don't
> get re-litigated every time someone reads a review.
>
> **Amended 2026-08-18** — item 12 (live presence) was one decline covering two
> different features. It has been split: viewer presence stays declined, errand
> co-presence is now planned. See §5.

The ask: *"Superlist is a Things competitor. Besides AI, what do they have that
we don't?"*

The honest frame first, because it changes which gaps matter. **Superlist is
work-team software wearing a consumer coat.** Christian Reber's follow-up to
Wunderlist, priced per-seat, integrated with Slack / GitHub / Linear / Figma,
and structured around a shared workspace. We are a **household operating
system** — the shared layer next to Apple Calendar, with People, habits, key
dates, and an attention engine as first-class pillars. Superlist has nothing
against any of those.

So the interesting output of this comparison is *not* the raw gap list. It's the
short list of gaps that would still be gaps if they'd built for a household
instead of a team. That's §3.

AI is excluded throughout at the asker's request — Superlist's Make, botless
meeting transcription, and note summarization are out of scope here. Voice
capture ("Talk") appears below because plain dictation-to-task is speech
recognition, not a model.

---

## 1. The full diff

| # | Superlist has | We have | Verdict |
|---|---|---|---|
| 1 | Offline-first sync engine; writes taken offline and reconciled | Tier 1 **read-only** cache; an offline write is silently lost | **Build** — already [next-steps §2c](../next-steps.md) |
| 2 | Tasks and notes as **one document** — rich-text blocks with tasks interleaved, infinitely nested | Three surfaces (Tasks / Lists / Notebook) bridged by @-mentions and backlinks | **Decline** — see §5 |
| 3 | Attachments: images, PDFs, one-tap preview, bulk download/replace | Avatar upload only ([`avatarStorage.js`](../../src/lib/avatarStorage.js)) | **Build** — §3b |
| 4 | Multi-select + bulk actions (Shift/Cmd-click, long-press on mobile) | None, anywhere | **Build** — §3c |
| 5 | Threaded comments on an item | Activity *log* ([`lib/activity.js`](../../src/lib/activity.js)) — history, no reply | **Open question** — §4a |
| 6 | Guest / external sharing of a single list | All-or-nothing household membership via join code | **Open question** — §4b |
| 7 | Calendar events surfaced alongside tasks | `.ics` export + Google/Outlook deep links ([`lib/calendar.js`](../../src/lib/calendar.js)), one-way | **Build** — §3d, already on the roadmap as Things polish |
| 8 | Integrations: Gmail, Slack, GitHub, Linear, Figma | None | **Decline**, except email-to-task — §5 |
| 9 | MCP server (assistants read/write tasks directly) | None | **Defer** — cheap, but wants a stable public API first |
| 10 | Native macOS, Windows, iOS, Android + home/lock-screen widgets | PWA; native iOS decided but unstarted | Already [next-steps §3](../next-steps.md) |
| 11 | User-chosen sort per list (alpha / created / due / priority / assignee) | Fixed policy per bucket + manual drag order ([`TasksView.jsx:187-240`](../../src/features/tasks/TasksView.jsx#L187-L240)) | **Decline** — see §5 |
| 12 | Live presence — avatars showing who's in a list now | Realtime re-hydration, no presence | **Split** (2026-08-18) — viewer presence declined, errand co-presence **build**; §5 |
| 13 | Cross-app activity heatmap | Habit insights only ([`HabitInsightsView`](../../src/features/habits/HabitInsightsView.jsx)) | Low value; note it and move on |
| 14 | Voice capture → task | Natural-language quick-add ([`lib/taskParse.js`](../../src/lib/taskParse.js)), typed | Cheap once native; Web Speech API on iOS Safari is not worth it |
| 15 | Copy-as-Markdown, copy link to a single item | Hash routing exists; no per-item share affordance | Falls out of §3c for free |

---

## 2. Where the comparison is unfair in both directions

**In their favor:** they have four native clients and we have a PWA. Every
platform-shaped gap in the table above (widgets, offline durability, launch
speed) is downstream of that one decision, and [next-steps §3](../next-steps.md)
already answers it.

**In ours:** items 5, 6, 8, and 12 are all the same feature wearing different
hats — *coordinating strangers who don't share a data boundary.* A household is
2–6 people who already share everything; the join code plus RLS already models
that correctly. Reading those four as "gaps" would import a permissions model we
deliberately don't need.

*Amended 2026-08-18:* that reading was right about item 12 as Superlist ships it
and wrong about the half of it a household actually wants. It holds for who is
*looking* at a list. It does not reach two people in different places working the
same errand, which is a data boundary they already share. §5 has the split.

---

## 3. The five worth building

Ranked. Each is scoped the same way: what exists, what changes, where it gets
hard, what it costs. **3e was added 2026-08-18** out of the item 12 split; it is
the only one of the five that came from asking what a *household* wants rather
than from the diff with Superlist, which is also why it's the only one they have
no version of.

### 3a. Durable offline writes — **already the recommended next step**

No change to the plan. Recorded here only because Superlist shipping an
offline-first engine moves this from *nice* to *table stakes*: a competitor in
the same category treats a lost write as a bug, and so should we.

The existing analysis in [next-steps §2c](../next-steps.md) stands — all 60 write
paths funnel through [`sync()`](../../src/hooks/useData.js), and the `updated_at`
guard lands at the same time.

### 3b. Attachments

**What exists.** Supabase Storage is already wired and proven, but only for one
thing: [`avatarStorage.js`](../../src/lib/avatarStorage.js) handles person and
group avatars. There is no attachment concept on a task, list item, or note.

**The change.** One polymorphic `attachments` table (`household_id`,
`entity_type`, `entity_id`, `storage_path`, `mime`, `bytes`, `created_by`),
an upload control reusing the [`AvatarUpload`](../../src/components/ui/AvatarUpload.jsx)
plumbing, and a thumbnail strip on the three detail surfaces.

**Where it gets hard.** Three places. **Privacy** — attachments must inherit
[`lib/privacy.js`](../../src/lib/privacy.js) and RLS, which means the storage
bucket cannot be public and every read needs a signed URL. **Portability** —
[`ROADMAP.md`](../../ROADMAP.md) says every table rides in backup/restore, and a
JSON backup that silently drops the binaries breaks that promise; either embed
small images base64 or version the format to carry a manifest. **Offline** —
interacts with 3a, and a queued upload is a different problem from a queued row
write; ship attachments *after* 3a or explicitly exclude them from the queue.

**Why it's worth it.** This is the most household-shaped gap in the whole table.
"Get *this* one" is a photo. So is a receipt, a paint chip, a school form, and
the model number on the back of the dryer.

**Cost.** One migration, one storage bucket + policies, one reusable component,
three call sites. Medium — the privacy and backup work is most of it.

### 3c. Multi-select + bulk actions

**What exists.** Nothing. [`scopes/notes.md`](notes.md) lists multi-select as
unbuilt for the notebook alone; no other surface has considered it.

**The change.** A selection mode shared across Tasks, Lists, Notes, and People:
long-press to enter on touch, Shift/Cmd-click on desktop, then complete, move,
assign, tag, delete, and copy-as-Markdown across the selection.

**Where it gets hard.** Gesture collision. [`SwipeRow`](../../src/components/ui/SwipeRow.jsx)
owns horizontal drag, [`ReorderableList`](../../src/components/ui/ReorderableList.jsx)
owns long-press-to-reorder — and long-press is exactly the gesture selection
wants. That conflict is the feature's real cost, and it has to be resolved once,
centrally, in [`lib/gestures.js`](../../src/lib/gestures.js), not per-view.
[`CONVENTIONS.md`](../../CONVENTIONS.md) forbids the bespoke one-off here.

**Cost.** Low-to-medium, and it buys item 15 for free. This is the gap users
notice on day three.

### 3d. Calendar events inline in Today

Already on [`ROADMAP.md`](../../ROADMAP.md) as Things polish worth stealing;
Superlist independently confirms it. Read-only display of the day's events above
the To-do block, so Today is the whole day rather than the half we own.

**Where it gets hard.** We have no calendar *read* path — [`lib/calendar.js`](../../src/lib/calendar.js)
is export-only and deliberately OAuth-free. Reading Google Calendar means OAuth,
a token store, and a refresh path, which is a materially bigger commitment than
anything else in §3. **On iOS, EventKit gives it to us for the price of a
permission prompt** — which argues for deferring this to the native app rather
than building an OAuth stack for the web.

### 3e. Errand co-presence — *"Sam is shopping this list now"*

Added 2026-08-18 out of the item 12 split. Not viewer presence; see §5 for the
line between them, which is load-bearing and easy to erase by accident.

**What exists.** Sync, not collaboration. [`useData`](../../src/hooks/useData.js)
puts one channel on `postgres_changes` across all of `public`, debounces 250ms,
then refetches **all 13 tables**. It converges, and it has none of the three
properties this needs: a row change carries **no attribution** (the refetch
can't say who), the DB holds only committed facts so there is **no in-flight
signal**, and it is the **wrong carrier for anything chatty** — every event
costs a 13-table refetch on every other member's client.

The durable half of the same coordination problem already shipped: a one-tap
claim on Today writes the existing `tasks.assignee`, so "I've got this" survives
a pocketed phone and routes through `buildAttention` like any other assignment.
This is the *ephemeral* half, and it should stay ephemeral — the two are not
alternatives.

**The change.** A second Realtime channel, `household:<id>`, carrying
`broadcast` only and never touching the database. Two signals, both scoped to
work actually in progress: a list being shopped (who, and the check-off count
moving), and a task being done right now. It rides the existing websocket —
`connect-src ... wss://*.supabase.co` is already in [`_headers`](../../public/_headers),
so there is no CSP or infrastructure change at all.

**Where it gets hard.** Five places. **It must not ride the `postgres_changes`
path** — the debounced refetch is exactly what this exists to avoid, and wiring
it there would make the feature its own performance bug. **Ephemeral state
lies**: a broadcast dies with the tab, so it needs a TTL and an honest "gone"
state, and it must never be drawn in a way that reads as durable truth — the
claim chip is the durable surface, this one is a hint. **Privacy** — a private
list must not announce itself, which means [`lib/privacy.js`](../../src/lib/privacy.js)
gates the send, not just the render. **Demo mode has no realtime**, and
[`CONVENTIONS.md`](../../CONVENTIONS.md) requires every feature to be visible
there because it's how the app gets reviewed — so it needs a demo path or it is
invisible in the one place it gets looked at. **The lens** — a broadcast about a
list in an area you're not looking at should not pull you out of it.

**Why it's worth it.** It's the one genuinely unserved thing in this document.
Live shared-list *sync* is table stakes — Cozi, AnyList, OurGroceries and Apple
Reminders all have it, and so do we. None of them says anyone is **at the shop**.
The value doesn't scale with collaborator count, which is why §5 declined it for
Superlist's shape; it scales with **physical separation**, which is the ordinary
condition of a household and the reason the original decline didn't reach it.

**Cost.** Medium. No migration and no new dependency — the cost is the five
constraints above, of which the demo path and the privacy gate are most of it.

---

## 4. Two open product questions

Neither can be scoped until answered, and both are answerable without code.

### 4a. Should an item be commentable?

Superlist has threaded comments. We have an activity feed — accurate history,
but nowhere to say *"which brand?"* on a grocery row.

The question is whether that conversation belongs **in** the app or in the text
thread the household already has. Cheapest test: the per-item `note` field
already exists on list items. If people are using it as a message channel, the
demand is real. If not, this is team software leaking in.

### 4b. Is household membership the only permission boundary?

Today: join code → full access to everything, including the rolodex. There is no
way to hand the packing list to a house-sitter, or a project's task list to a
contractor, without that.

This is a genuine product question with a schema consequence, and
[`ROADMAP.md`](../../ROADMAP.md) is explicit that schema changes get expensive
the moment an App Store binary exists. **Decide the answer before native ships,
even if the feature waits.**

---

## 5. Deliberately not taken

Recorded with reasons so a future reader doesn't rediscover them as gaps.

- **The unified tasks-and-notes document.** Their central structural bet, and
  it's a real difference — but a grocery list should not be a document. Our
  split model plus @-mentions and backlinks across seven entity types is the
  better fit for a household, and switching would be a rewrite of three
  surfaces to land somewhere arguably worse. Declined on the merits, not on
  cost.
- **Slack / GitHub / Linear / Figma.** Work integrations for a work product.
  **Email-to-task is the one exception** and stands on its own merits — a
  forwarding address that lands in the inbox is genuinely household-shaped
  (school emails, appointment confirmations, order receipts).
- **User-chosen sort.** Our fixed per-bucket ordering is a deliberate
  Things-style opinion — the app decides what's next so the user doesn't
  maintain a sort preference. Revisit only if real usage produces a complaint.
- **Viewer presence.** Avatars saying who is *looking* at a list — item 12 as
  Superlist ships it. Meaningful at ten collaborators, noise at three. Three
  people do not need to know which page the other two are on, and §2's reading
  holds: this is team software's answer to coordinating people who don't share a
  data boundary. **Still declined**, and [§3e](#3e-errand-co-presence--sam-is-shopping-this-list-now)
  is not a door back to it — errand co-presence draws on a list being *worked*,
  never a general "who's here" indicator, on any screen.
- **Per-seat pricing.** Their model is $10/user/month. A household product
  prices per household; the entitlement design in
  [next-steps §3](../next-steps.md) already assumes that.

---

## 6. What they have nothing for

The point of the exercise, and the reason none of §3 is urgent: the four pillars
and the spine have no counterpart in Superlist. **People** — tiers, family units,
relationships, affiliations, key dates, the map. **Habits** with streaks and
insights. The **attention engine** that turns all of it into one warm "Check in"
rather than a notification pile. **Privacy** enforced at the data layer and again
in RLS.

Superlist is a better *list app*. We are not building a list app. The four items
in §3 are the ones where being a better list app is still part of the job.

---

## Sources

Superlist [release notes](https://www.superlist.com/updates) (v1.53–v1.56,
Apr–Jun 2026) · [product site](https://www.superlist.com/) ·
[their Things comparison](https://www.superlist.com/things-alternative) ·
[Efficient App review](https://efficient.app/apps/superlist) ·
[Akiflow: Superlist vs Things 3](https://akiflow.com/blog/superlist-vs-things-3)
