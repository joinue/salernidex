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
>
> **Built 2026-08-18** — §3a, §3c and §3e are no longer proposals; they shipped,
> along with item 15, which turned out to deserve a scope of its own rather than
> a footnote (see §3f). §3b (attachments) and §3d (calendar) are untouched and
> still read as written. The per-section notes below say what actually landed.

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
| 1 | Offline-first sync engine; writes taken offline and reconciled | Durable write outbox + staleness guard | **Built** — §3a |
| 2 | Tasks and notes as **one document** — rich-text blocks with tasks interleaved, infinitely nested | Three surfaces (Tasks / Lists / Notebook) bridged by @-mentions and backlinks | **Decline** — see §5 |
| 3 | Attachments: images, PDFs, one-tap preview, bulk download/replace | Avatar upload only ([`avatarStorage.js`](../../src/lib/avatarStorage.js)) | **Build** — §3b |
| 4 | Multi-select + bulk actions (Shift/Cmd-click, long-press on mobile) | Selection mode on Lists, Tasks, Notes | **Built** — §3c (People, and Shift-click ranges, still open) |
| 5 | Threaded comments on an item | Activity *log* ([`lib/activity.js`](../../src/lib/activity.js)) — history, no reply | **Open question** — §4a |
| 6 | Guest / external sharing of a single list | All-or-nothing household membership via join code | **Open question** — §4b |
| 7 | Calendar events surfaced alongside tasks | `.ics` export + Google/Outlook deep links ([`lib/calendar.js`](../../src/lib/calendar.js)), one-way | **Build** — §3d, already on the roadmap as Things polish |
| 8 | Integrations: Gmail, Slack, GitHub, Linear, Figma | None | **Decline**, except email-to-task — §5 |
| 9 | MCP server (assistants read/write tasks directly) | None | **Defer** — cheap, but wants a stable public API first |
| 10 | Native macOS, Windows, iOS, Android + home/lock-screen widgets | PWA; native iOS decided but unstarted | Already [next-steps §3](../next-steps.md) |
| 11 | User-chosen sort per list (alpha / created / due / priority / assignee) | Fixed policy per bucket + manual drag order ([`TasksView.jsx:187-240`](../../src/features/tasks/TasksView.jsx#L187-L240)) | **Decline** — see §5 |
| 12 | Live presence — avatars showing who's in a list now | Errand co-presence on a broadcast channel | **Split** (2026-08-18) — viewer presence declined; errand co-presence **built**, §3e |
| 13 | Cross-app activity heatmap | Habit insights only ([`HabitInsightsView`](../../src/features/habits/HabitInsightsView.jsx)) | Low value; note it and move on |
| 14 | Voice capture → task | Natural-language quick-add ([`lib/taskParse.js`](../../src/lib/taskParse.js)), typed | Cheap once native; Web Speech API on iOS Safari is not worth it |
| 15 | Copy-as-Markdown, copy link to a single item | Both — share sheet on detail screens, copy-as-Markdown in the selection bar | **Built** — §3f. Copy did fall out of §3c; the share sheet earned its own scope |

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

## 3. The six worth building

Ranked. Each is scoped the same way: what exists, what changes, where it gets
hard, what it costs. **3e was added 2026-08-18** out of the item 12 split; it is
the only one that came from asking what a *household* wants rather than from the
diff with Superlist, which is also why it's the only one they have no version of.
**3f was added the same day**, promoted out of item 15.

Four of the six are built (3a, 3c, 3e, 3f). **3b (attachments) and 3d (calendar)
are not**, and their sections below are still proposals — 3b because it should
follow the offline work rather than race it, 3d because it wants either an OAuth
stack or the native app.

### 3a. Durable offline writes — **built**

Recorded here because Superlist shipping an offline-first engine moved this from
*nice* to *table stakes*: a competitor in the same category treats a lost write
as a bug, and so should we.

**What landed.** [`lib/mutationQueue.js`](../../src/lib/mutationQueue.js) — an
ordered IndexedDB outbox, deliberately not a sync engine. `sync()` records each
write closure against a recorder rather than the live client, so a mutation is
*data* and survives a reload; the closure form could not. Retryable and
permanent failures are classified apart, because getting that backwards either
jams the queue forever or rebuilds the discarded-edit bug the module exists to
fix.

**The `updated_at` guard, and the trap in it.** The guard may only ever compare
against a timestamp the SERVER gave us. The obvious implementation — guard with
the row's `updated_at` out of local state — is wrong and quietly so: every
optimistic update stamps `updated_at: now()` from the client clock so the row
sorts correctly on screen, and guarding with that compares a phone's clock
against a Postgres trigger's. A phone two seconds slow would have its own edits
rejected as stale, turning a protection against lost work into a cause of it.
So `createGuardBook` records only what a server read returned, and forgets a row
the moment one of our writes to it settles. No observation ⇒ no guard ⇒
last-write-wins, which is the honest answer to "I don't know".

Chained edits get the same care: queueing a second edit to a row already in the
outbox drops the new guard, because the first one is about to move `updated_at`
past it and the "somebody else" who won the race would be us.

Guarded: the general edit paths (form saves, `updateTask`, `updateNote`,
`updateArea`, …). **Not** guarded: archive, delete and check-off — those carry a
decision rather than a field's contents, so there is nothing in them to lose,
and *"your delete didn't apply because somebody renamed it"* is a worse answer
than deleting it.

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

### 3c. Multi-select + bulk actions — **built**

**What landed.** [`useSelection`](../../src/hooks/useSelection.js) holds the
mode, [`SelectionBar`](../../src/components/ui/SelectionBar.jsx) is the bar, and
[`lib/bulk.js`](../../src/lib/bulk.js) turns a selection into Markdown. Wired
into **Lists, Tasks and Notes** (both the list and gallery layouts).

**The gesture collision, resolved centrally** as this section required —
`longPressOwner` in [`lib/gestures.js`](../../src/lib/gestures.js):

- While selecting, the long press does nothing. You are choosing rows, not
  arranging them, and a lift mid-selection would scatter the list under a finger
  that meant to add one more item.
- On a hand-orderable list, **reorder keeps it** — dragging is the whole point
  of those lists and has no other affordance.
- Everywhere else it enters selection.

What makes that safe is the second half: selection is *always* reachable from an
explicit **Select** control, so a list that can't offer the gesture loses a
convenience rather than a feature. That is also how iOS resolves the same
collision in Notes, Files and Photos — and it is what keeps the feature reachable
for anyone who can't perform a long press at all.

**Two things worth recording.** Bulk actions are their own mutations
(`deleteListItems`, `deleteTasks`, `deleteNotes`, `setListItemsChecked`), not
loops over the single-row helpers: ten calls to `deleteListItem` raise ten
toasts, each offering to undo one tenth of what you did, and only the last is
still on screen when you reach for it. One action is one Undo. And selection is
pruned against the *visible* ids, so a row a housemate checks off — or the lens
filters out — leaves the selection with it rather than being silently acted on.

**People is not done.** The three content surfaces are; the rolodex was left
alone. Its bulk verbs (merge? re-tier? archive?) are a product question this
scope never answered, and inventing one to finish a checklist is how a feature
arrives that nobody wanted.

**Not done:** Shift/Cmd-click range selection on desktop. Tap/click-to-toggle
works everywhere; the range shortcut is additive.

### 3f. Send a link to one thing — **built** (was item 15)

Added 2026-08-18. Item 15 listed "copy link to a single item" as something that
falls out of §3c for free, which understated it: the household already has a
text thread, and the fastest way to get your partner to the right screen is a
message they tap.

**What landed.** [`lib/share.js`](../../src/lib/share.js) +
[`ShareButton`](../../src/components/ui/ShareButton.jsx) on the task, list and
note detail screens, handing the OS share sheet a link to the singular detail
route (`#/list/<id>`), with a clipboard fallback. Building an SMS gateway of our
own was the alternative and it is the wrong shape.

**Not a sharing permission.** The link is a pointer; the household boundary is
still the only permission boundary there is. That is why it needed no schema
change — and why a private row is refused outright: not because the link would
leak it (RLS and [`lib/privacy`](../../src/lib/privacy.js) see to that) but
because the recipient would land on "not found", which reads as the app being
broken rather than the item being yours alone.

**The auth detour** was the real work. Password sign-in keeps the hash, so that
path already worked; password reset returns to `window.location.origin` and
Supabase's email links come back on `#access_token=…`, either of which eats the
destination. `deepLinkPath` in [`lib/nav.js`](../../src/lib/nav.js) recognises a
link to one specific thing, and App stashes it in `sessionStorage` across sign-in.

**Still true: iOS won't open the installed app.** [`site.webmanifest`](../../public/site.webmanifest)
scopes the PWA at `/`, so Android can capture the link; iOS opens Safari. "Right
into the app" needs universal links, which needs the native app — the same
conclusion §3d reached about calendar reads.

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

### 3e. Errand co-presence — *"Sam is shopping this list now"* — **built**

Added 2026-08-18 out of the item 12 split, and shipped the same day. Not viewer
presence; see §5 for the line between them, which is load-bearing and easy to
erase by accident.

**What landed.** [`lib/presence.js`](../../src/lib/presence.js) (pure state and
rules) + [`usePresence`](../../src/hooks/usePresence.js) (the channel), with the
banner on the list detail screen. All five constraints below were met, and the
line against viewer presence is now drawn *in code* rather than only in prose:
the signal is sent on the **first check-off, never on arrival**, and nothing in
the module can express "I am here" because there is no event for arriving.

Ephemeral honesty is enforced by construction — a signal carries the wall-clock
time it was made and every read is relative to a `nowMs` the caller passes in, so
"gone" is *derived* rather than trusted to arrive as its own event. A phone that
goes into a tunnel mid-aisle stops beating and the banner is simply gone 45
seconds later. Leaving the page also says so explicitly, because that is the one
moment we can be certain, and 45 seconds of a stale banner is 45 seconds of
somebody in an aisle believing their partner is already on it.

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

*Amended 2026-08-18:* §3f leans on the second answer — shipping a share sheet
says the thread the household already has is where this goes. That was a
deliberate bet, not a decision this question no longer needs: 3f makes it cheap
to send a *thing*, and says nothing about discussing one. If the `note` field
turns out to be in use as a message channel, comments are still open.

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
