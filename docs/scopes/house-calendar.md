# House calendar — scope

> **Scope** — a proposal, not a commitment. Written 2026-08-18 against
> `main` @ `4fe5b43`. Nothing here is agreed work.
>
> **Supersedes §3d of [`competitive-superlist.md`](competitive-superlist.md)**,
> which scoped only the *read* half of "calendar" and concluded it should wait
> for EventKit. That conclusion stands and is restated in §1.1. What that section
> missed is that reading is not how the competitors in this category actually
> work — they **own** the events and publish them outward, which has no native
> dependency at all. This doc scopes that half.
>
> **Two upstream docs are stale in ways that matter here.** Migrations are at
> `0042`, not `0033` ([`ROADMAP.md`](../../ROADMAP.md)); and **per-member
> timezone shipped** as [`0036_member_timezone.sql`](../../supabase/migrations/0036_member_timezone.sql)
> plus [`lib/timezone.js`](../../src/lib/timezone.js), while both ROADMAP and
> [`next-steps.md §2a`](../next-steps.md) still carry it as ⬜ remaining and
> "blocks selling outside Arizona." That matters because a timed calendar event
> is meaningless without a per-member zone — the dependency this work would
> otherwise have to wait on is **already satisfied**.

---

## 0. The one-paragraph version

A member ticks **"Add to house calendar"** on a task, a list, or a meal plan.
That item becomes an event in a per-member `.ics` feed which every household
member subscribes to once, in whatever calendar app they already use. Privacy
decides *who receives an item*; assignee decides *what it is called*. Deadline
tasks (`due_kind: 'by'`) never ride automatically, because a deadline is a
ceiling rather than an appointment — but a member can **place** one on the
calendar at a time of their choosing, which is a separate field and a separate
act. Nothing is read back in; that half stays deferred to native EventKit.

---

## 1. Two features, and only one of them is ours to build

"Calendar" is not one gap. It is two, and they have completely different costs.

### 1.1 Reading their calendar — still deferred, and the reason is stronger than we wrote

Showing the day's real events inside Today requires reading a calendar we don't
own. On iOS, **EventKit** does this for the price of a permission prompt, and it
returns *every* calendar the phone has already aggregated — iCloud, Google,
Exchange, subscribed feeds — with no per-provider work.

On the web there is no calendar API at all. The build is OAuth against the
Google Calendar API **and** Microsoft Graph, separately, each with a token store
and a refresh path. iCloud has **no public API**; CalDAV with app-specific
passwords is the only route, and that is a credential-harvesting flow we should
not ship.

`competitive-superlist.md` §3d called this "a materially bigger commitment."
That undersells it. The accurate framing: **the web cannot reach parity at any
price**, and the OAuth build buys the two providers our target household is
least likely to be on. Decline stands. Revisit with the native app, not before.

### 1.2 Publishing ours — this document

Cozi, Maple and Skylight do not primarily read your calendar. They **are** the
calendar: events are entered there and flow *out* as a subscribable feed. That
direction needs no native code, no OAuth, and no third-party API.

We already hold most of the material. What we lack is (a) an explicit way to say
"this belongs on the calendar", (b) a place to put a deadline task that has no
natural time, and (c) a way for it to leave the app as anything more durable
than a one-shot file.

### 1.3 The vision line has to move, and that is the real decision here

[`ROADMAP.md`](../../ROADMAP.md) opens with: *"the shared layer next to Apple
Calendar. You share the **when** (Calendar); this owns the shared **who**,
**to-do**, **to-get**, **habits** and a **notebook**."*

That sentence is what keeps us out of the family-organizer category, because
owning the *when* is the whole product those competitors sell. This scope
proposes amending it to: **we own the household's *when* and publish it into
whatever calendar each member already lives in.** We still don't ask anyone to
abandon Apple Calendar — we feed it.

That is a product decision, not a platform one, and it is available today.

---

## 2. The model

### 2.1 What already exists — three axes, and they're good

Nothing below is new. It is recorded because the model turned out to be richer
than the roadmap summary suggests, and it already answers the hardest question.

| Field | Meaning | Where |
|---|---|---|
| `start_date` | park it until then — deferred, hidden from Today | `isDeferred` ([`tasks.js:75`](../../src/lib/tasks.js#L75)) |
| `due_date` | the date itself | `dueState` ([`tasks.js:64`](../../src/lib/tasks.js#L64)) |
| `due_kind` | `'on'` = a day to show up · `'by'` = a ceiling with slack | `isDeadline` ([`tasks.js:89`](../../src/lib/tasks.js#L89)), migration `0034` |
| `due_time` | optional clock time; exports as a 1-hour event | [`calendar.js`](../../src/lib/calendar.js) |

`due_kind` is the important one and it is why this scope is small. A `'by'` task
is *"actionable now, and the date is only the last acceptable moment"* — it
already has its own bucket (`anytime`), its own label style (`"4d left"`,
deliberately **not** a date to show up on), and its own place in the sort order.
**The app already knows the difference between a deadline and an appointment.**

### 2.2 `on_calendar` — the explicit act

A boolean on the item. Set by a person, never derived.

The alternative considered and rejected was deriving calendar-eligibility from
`due_kind` — publish every `'on'` task automatically. It is worse in three ways.
No heuristic can judge whether a to-do deserves a slot in someone's real
calendar, but the person can. It would flood a subscribed calendar with every
dated errand, and a flooded calendar gets unsubscribed once and never
resubscribed. And a subscribed feed is **undebuggable from the user's side** —
they see an event in Apple Calendar with no way to ask why it is there, so the
contents have to be predictable by construction.

An explicit tick also *is* the commitment a calendar entry claims to represent,
which makes the semantics honest rather than approximated.

### 2.3 `scheduled_at` — the block, and why it's Akiflow rather than Motion

`on_calendar` on a `'by'` task has nothing to publish: a ceiling carries no
time. So placing a deadline task on the calendar needs a second field —
`scheduled_at` (a timestamp) and `scheduled_minutes` (a duration, defaulting to
the hour [`calendar.js`](../../src/lib/calendar.js) already assumes).

The critical property: **this is purely additive and changes nothing.**

- `due_date` + `due_kind` — the obligation. Untouched.
- `scheduled_at` — the intention. Optional, only ever set by an explicit act.

A blocked `'by'` task is **still** a `'by'` task. `isDeadline`, `slackDays`,
`taskBucket` and the `anytime` bucket all keep working unchanged. The only
render change is that the bucket should say *"Planned Tue 3pm"* so nobody blocks
the same task twice.

**Akiflow, not Motion.** Akiflow is manual: you drag a task onto a slot, the
deadline is untouched, the block is deterministic. Motion is a scheduler that
auto-places work from deadline + duration + priority and continuously re-solves.
Motion's model needs duration estimates, configured working hours, and —
decisively — the ability to **read** the user's existing calendar so it doesn't
book over their dentist. §1.1 says we cannot read that calendar on the web. So
auto-scheduling is not a later phase of this work; it is a different product.
See §8.

### 2.4 Delivery — privacy decides who, assignee decides what it's called

This is the part that looked messy and isn't. Two independent fields we already
ship do the whole job, and no new sharing concept is required.

An item appears in member M's feed when **`on_calendar` is true** *and* **M is
entitled to see the row** — which [`lib/privacy.js`](../../src/lib/privacy.js)
already answers and RLS already enforces.

Assignee is not a filter. It is the **label**, which is exactly Cozi's
per-member-colour model reached from a field we already have.

| Item | Whose feed | Reads as |
|---|---|---|
| Private, assignee Marc | **Marc's only** | `Dentist` |
| Household-visible, assignee Marc | everyone's | `Marc: Dentist` |
| Household-visible, assignee `anyone` | everyone's | `Trash night` |
| Household-visible, assignee Sam | everyone's | `Sam: Soccer run` |

A personal-but-not-private item therefore reaches everyone, and that is correct:
it is the entire point of a house calendar that Sam can see Marc is at the
dentist Thursday. A *genuinely* personal item is the private one, and it is
already unreadable to anyone else at the database level — so it needs no
calendar-specific logic whatsoever.

**Decided:** your own private items **do** ride your own feed. It is your URL,
and a private appointment is the most calendar-shaped thing there is. This is
the single biggest reason the token in §4.2 deserves care.

### 2.5 Full eligibility table

| Item shape | Rides the feed? | As |
|---|---|---|
| `due_kind: 'on'` + `due_time`, `on_calendar` | yes | timed event, 1h default |
| `due_kind: 'on'`, no time, `on_calendar` | yes | all-day event |
| `due_kind: 'by'`, `on_calendar`, **no** `scheduled_at` | **no** | — (nothing to publish) |
| `due_kind: 'by'` + `scheduled_at` | yes | timed block at `scheduled_at` |
| Any task without `on_calendar` | no | — |
| Deferred task (`start_date` future) | follows the rules above | the block/date is what matters, not the defer |
| Recurring task, `on_calendar` | yes | **one `RRULE` event**, not N (§4.4) |
| List with a due date, `on_calendar` | yes | all-day event |
| Meal plan | yes, flagged **at list level** | one all-day event per `on_date` |
| Key dates + birthdays | **automatic**, per-member toggle | all-day, yearly `RRULE` |
| Habits | **no** — see §8 | — |
| Reminders (attention engine) | **no** — see §8 | — |

---

## 3. Schema — one migration, `0043`

[`next-steps.md §2`](../next-steps.md) is explicit that schema is cheap now and
expensive the moment an App Store binary exists, and `0040` proved the pattern:
**land every column the feature will ever need in one migration, then take as
long as you like over the UI.** Same approach here.

```sql
-- 0043_house_calendar.sql

-- The explicit act (§2.2)
alter table public.tasks  add column if not exists on_calendar boolean not null default false;
alter table public.lists  add column if not exists on_calendar boolean not null default false;

-- The block (§2.3)
alter table public.tasks  add column if not exists scheduled_at timestamptz;
alter table public.tasks  add column if not exists scheduled_minutes integer;

-- The feed credential + member preferences (§4.2, §5.5)
alter table public.household_members
  add column if not exists calendar_token text,
  add column if not exists calendar_token_rotated_at timestamptz,
  add column if not exists calendar_include_dates boolean not null default true,
  add column if not exists calendar_enabled boolean not null default false;

create unique index if not exists household_members_calendar_token_key
  on public.household_members (calendar_token) where calendar_token is not null;
```

**Every column is additive with a safe default**, so applying it changes no
existing behaviour — nothing is `on_calendar` until somebody ticks it, and
`calendar_enabled` starts false so no feed exists until it is asked for.

**Deliberately not in `0043`:**

- No `events` table. Tasks, lists, meal plans and key dates already carry dates;
  a parallel event entity would be a second source of truth for the same facts
  and would immediately raise "why is this an event and not a task?"
- No per-item calendar sharing override. Privacy already governs delivery (§2.4)
  and a second, calendar-only visibility axis is exactly the mess this design
  avoids.
- No `on_calendar` on notes or habits. See §8.

---

## 4. The feed

### 4.1 Transport

A new edge function, `calendar-feed`, deployed `--no-verify-jwt` (the
[`send-reminders`](../../supabase/functions/send-reminders/) precedent), serving
`Content-Type: text/calendar; charset=utf-8`.

The URL is handed to the user as `webcal://` so a tap subscribes rather than
downloads. Apple Calendar, Google Calendar and Outlook all accept it.

### 4.2 The token, and why `auth.ts` doesn't transfer

[`send-reminders/auth.ts`](../../supabase/functions/send-reminders/auth.ts) is
the right *comparison* and the wrong *mechanism*. **A calendar subscription
cannot send an `Authorization` header** — the calendar client fetches the URL
and nothing else. So the credential has to live in the URL:

```
https://<project>.supabase.co/functions/v1/calendar-feed/<token>.ics
```

Consequences, all of which need deciding before this ships:

- **The URL is a bearer credential with no expiry.** Anyone holding it reads
  that member's calendar view — *including their private items* (§2.4) —
  indefinitely. It will end up in screenshots, browser history, and whatever
  cloud account syncs their calendar. That is an accepted cost of every ICS feed
  ever shipped, but it should be an accepted cost, not an accident.
- **Path, not query string.** Query strings land in more logs and referrer
  headers than path segments do.
- **CSPRNG and long.** [`joinCode.js`](../../src/lib/joinCode.js) is the
  in-repo precedent for CSPRNG generation, but its 12 characters are sized for a
  human to read aloud. Nobody types a feed URL — use 32+ characters.
- **Constant-time compare.** Reuse `timingSafeEqual` from
  [`auth.ts`](../../supabase/functions/send-reminders/auth.ts#L21) rather than
  `===`. Same reasoning as that file records.
- **Rotation invalidates every subscription** on every device that member owns,
  and there is no way to notify them. The Settings copy has to say so plainly.
- **Never in the backup.** [`ROADMAP.md`](../../ROADMAP.md) says every table
  rides backup/restore. A `calendar_token` in an exported JSON file is a live
  credential in a file people email to themselves. Exclude it explicitly, the
  way [`catalog.js`](../../src/lib/catalog.js) is excluded — different reason,
  same treatment.

### 4.3 Contents — one strip more than you'd think

`data` from `useData` has already applied visibility **for the viewer**. The
feed serves a *specific member*, so it filters for **that member** rather than
for whoever asked.

[`board.js`](../../src/lib/board.js) is the precedent worth copying: it re-strips
private rows a second time *for the room*, even though the signed-in viewer is
entitled to see them. The feed is the same move with a different audience. Put
the rule in one pure module (`lib/calendarFeed.js`) so it can be unit-tested
without a network, and so the edge function and any in-app preview agree.

### 4.4 `RRULE`, not N events

A weekly chore is **one** recurring VEVENT, not fifty-two. Emitting expanded
occurrences makes the feed grow without bound, breaks "edit the series," and
makes every refresh heavier than the last.

[`calendar.js`](../../src/lib/calendar.js) already builds RRULE fragments (see
`WEEKDAYS_RR`) and [`recurrence.js`](../../src/lib/recurrence.js) already models
the rule set, so the mapping exists. Where RRULE-lite cannot express a rule,
fall back to a bounded expansion window rather than silently dropping the task —
and log which rules took the fallback, so the gap is measurable.

Completion history complicates this: a recurring task that was skipped once
should carry an `EXDATE`. `recurrence.exdates` already exists
([`tasks.js:448`](../../src/lib/tasks.js#L448)) and maps directly.

### 4.5 No `VALARM`

An ICS event can carry its own alarm. If it does, the user gets **both** Apple's
notification and our push for the same item. Emit events with no alarms and let
[`reminders.js`](../../src/lib/reminders.js) keep owning notification. This is
easy to miss and reads as a duplicate-notification bug rather than a design
choice.

### 4.6 Refresh cadence belongs to the client

Apple Calendar refreshes subscribed calendars on its own schedule — often hours,
and not configurable by us. Google is similar. **This is ambient presence in
their calendar, not sync.** Fine for meal plans, birthdays and next week's
soccer run; wrong for anything anyone expects to be live. The in-app surfaces
(§5) are where live lives.

Say this in the Settings copy. A user who expects instant propagation will file
it as broken.

### 4.7 A free win: subscribed calendars are read-only

Apple Calendar and Google both make subscribed calendars read-only. Nobody can
edit an event in their calendar and expect it to come back to us, so the
one-way boundary is **enforced by the platform** rather than needing to be
explained or defended. Worth recording, because it removes the usual objection
to one-way sync.

---

## 5. In-app surfaces

The feed is the transport. If the house calendar exists *only* in Apple
Calendar, we have handed away the surface we're trying to own.

### 5.1 The board — the best screen for this

[`board.js`](../../src/lib/board.js) already answers *"what does this house
owe"* on a screen propped in the kitchen, already strips private rows for the
room, and already re-derives at midnight from a passed-in `todayISO`. A week
view of the house calendar is the single most Skylight-shaped thing we could
build, and it reuses a module that was designed for exactly this audience.

### 5.2 Today

Today already shows dated work. Calendar-flagged items with a `scheduled_at`
should show their time, so the day reads in order.

### 5.3 The place-on-calendar affordance

On a `'by'` task, this is a date+time picker that writes `scheduled_at`. On an
`'on'` task it is a plain tick. Same control, different payload — the form
decides from `due_kind`, which it already knows.

**Blocking is a claim.** A `'by'` task assigned to `anyone` that you block for
Sunday is now *yours* on Sunday. Setting `scheduled_at` is the natural moment to
also set `assignee` to yourself — consistent with the one-tap claim already on
Today, and it is what makes the feed read `Marc: Taxes` rather than putting an
unowned block on the house calendar.

### 5.4 The `anytime` bucket

Show `"Planned Tue 3pm"` on a blocked deadline task. Without it, the same task
gets blocked twice.

### 5.5 Settings → Calendar

The subscribe URL (tap to subscribe, and copy-to-clipboard for a desktop
calendar), the birthdays toggle (`calendar_include_dates`), a rotate button with
the honest warning from §4.2, and the refresh-cadence sentence from §4.6.

---

## 6. Phases

Ordered so each phase is independently valuable and the risky one is isolated.

### Phase 1 — the migration

`0043` as written in §3. No UI, no function.

**Do this first and independently of everything else**, per the ROADMAP rule.
Once an App Store binary exists this gets expensive; today it is one file.

*Done when:* applied, `schema.sql` updated to mirror it, backup round-trip still
passes with `calendar_token` excluded.

### Phase 2 — the model in the app, with no feed at all

`on_calendar` ticks, the `scheduled_at` picker (§5.3), the claim-on-block
behaviour, `"Planned Tue 3pm"` in the `anytime` bucket (§5.4), and the house
calendar view on the board (§5.1) and Today (§5.2). Pure client work.

**This phase stands alone.** If the feed never ships, time-blocking and a house
calendar on the kitchen screen are still a feature — and it is the phase that
proves whether anyone actually ticks the box.

*Done when:* a `'by'` task can be placed at a time, appears on the board on that
day, and the `anytime` bucket says so. Unit tests on the new pure rules;
`npm run audit:mobile` green.

### Phase 3 — `lib/calendarFeed.js`

The pure module: rows + member + `nowMs` → VEVENTs. Privacy strip (§4.3), the
label rule (§2.4), `RRULE` + `EXDATE` (§4.4), no `VALARM` (§4.5). No network, no
Supabase, fully unit-testable — same shape as `board.js` and `presence.js`.

*Done when:* the eligibility table in §2.5 is a test file, and every row of it
passes.

### Phase 4 — the `calendar-feed` edge function

Token generation, lookup and constant-time compare; the function itself is thin
because Phase 3 holds the logic. All of §4.2's decisions land here.

*Done when:* a real subscription in Apple Calendar on a real phone shows a real
item — the [`send-reminders`](../../supabase/functions/send-reminders/) standard
of proof, which is the standard that caught the VAPID mismatch.

### Phase 5 — Settings, and the subscribe flow

§5.5. The point at which this is usable by somebody who isn't Marc.

*Done when:* a second household member can subscribe without being told how, and
a rotate leaves them with clear instructions rather than a silently dead feed.

### Phase 6 — recurrence + meal plans in the feed

RRULE emission proven against real recurring chores, and the meal-plan
list-level flag (§2.5). Split out because meal plans are the highest-value
content and the most likely to expose an RRULE gap.

### Phase 7 — retire the per-task `.ics` download

Once a feed exists, two export mechanisms with different semantics coexist: the
feed updates, the downloaded file never does. That is a support problem waiting
to happen. Keep the Google/Outlook deep links (they're a different job — "put
this one thing in my work calendar") and drop the file download, or demote it.

---

## 7. Where it gets hard — consolidated

1. **The token is the whole security surface** (§4.2), and it carries private
   items. Everything else here is ordinary product work; this is the part that
   deserves a review pass of its own.
2. **Stale blocks are the main source of calendar junk.** Tuesday passes, the
   task isn't done, the deadline is Friday. Motion reshuffles; Akiflow drops it
   back in the inbox. **Proposed:** a past `scheduled_at` on an incomplete task
   clears itself and the task falls back to plain `anytime`. Without this, dead
   blocks accumulate in everyone's calendar forever and the feed becomes noise.
3. **Backup must exclude `calendar_token`** (§4.2) — a live credential in a file
   people email themselves.
4. **RRULE gaps** (§4.4): where RRULE-lite can't express a rule, fall back to a
   bounded window and log it. Silently dropping the task is the failure mode to
   avoid.
5. **Demo mode.** [`CONVENTIONS.md`](../../CONVENTIONS.md) requires every feature
   to be visible in demo, and demo has no edge functions. Phase 2 is fully
   demo-able; Phases 3–4 need an in-app preview of the feed contents rather than
   a live subscription, or the feature is invisible in the one place the app
   gets reviewed. This is the same constraint that
   [`competitive-superlist.md §3e`](competitive-superlist.md) hit with presence.
6. **Timezone** is satisfied (`0036`), but timed events are the first feature to
   actually *depend* on it — so it is the first real test of that migration.
   DST-observing zones need a test; Phoenix was chosen originally precisely
   because it has none.
7. **The lens.** Areas filter the app. Do they filter the feed? See §9.

---

## 8. Deliberately not taken

Recorded with reasons so they don't get rediscovered as gaps.

- **Motion-style auto-scheduling.** A constraint solver needing duration
  estimates, working hours and continuous re-solving against a calendar we
  cannot read on the web (§1.1). Not a later phase of this — a different
  product. Manual placement (§2.3) is the whole of what's proposed.
- **Reading the user's calendar.** §1.1. Deferred to native EventKit, and that
  decline is stronger than the one `competitive-superlist.md §3d` recorded.
- **Two-way sync.** Subscribed calendars are read-only client-side (§4.7), so
  this isn't a limitation we have to defend — the platform enforces it.
- **An `events` table.** §3. A second source of truth for dates we already hold.
- **Habits on the calendar.** A habit is a rhythm, not an appointment, and
  [`cross-surface-review.md`](../records/cross-surface-review.md) already
  settled that habits stay ambient — in the attention engine, never in the red
  count. A calendar entry is louder than the red count, not quieter.
- **Reminders on the calendar.** The attention engine is a *notification*
  stack ([`reminders.js`](../../src/lib/reminders.js)), not a set of events. The
  underlying key date is the event; the reminder about it is not. Publishing
  both would double every birthday.
- **Notes on the calendar.** No date semantics to publish.
- **Per-item calendar visibility.** Privacy already decides delivery (§2.4).
  A calendar-only second axis is precisely the complexity this design avoids.
- **CalDAV.** §1.1 — app-specific passwords are a credential-harvesting UX.
  `ROADMAP.md` already lists CardDAV under the same reasoning for contacts.

---

## 9. Decisions and open questions

| # | Question | Status |
|---|---|---|
| 1 | Automatic eligibility vs an explicit tick | **Decided** — explicit (§2.2) |
| 2 | Do `'by'` tasks ride the calendar? | **Decided** — not automatically; placeable via `scheduled_at` (§2.3) |
| 3 | Akiflow or Motion model? | **Decided** — Akiflow; Motion declined (§8) |
| 4 | One house feed, or one per member? | **Decided** — per member (§2.4) |
| 5 | Do your own private items ride your own feed? | **Decided** — yes (§2.4) |
| 6 | Does assignee filter delivery? | **Decided** — no, it labels (§2.4) |
| 7 | Does blocking a task claim it? | **Decided** — yes (§5.3) |
| 8 | Birthdays automatic or flagged? | **Decided** — automatic, one per-member toggle (§2.5) |
| 9 | **Does the areas lens filter the feed?** | **Open.** An unshared "Work" area contributing to nobody else's feed falls out of privacy for free. Whether *your own* feed respects your currently-selected lens is a different question — a feed is not a session, and the lens is a per-session view. **Leaning: no.** The feed carries everything you're entitled to; the lens is a UI state. |
| 10 | **What happens to a stale block?** | **Open**, §7.2. Leaning: clear it and fall back to `anytime`. |
| 11 | **Does the feed URL survive leaving a household?** | **Open.** A member who leaves must stop receiving the feed — the token is on `household_members`, so a deleted membership kills it, but that should be verified rather than assumed. |
| 12 | Retire the per-task `.ics` download? | **Open**, Phase 7. |

---

## 10. Cost

| Phase | Size | Notes |
|---|---|---|
| 1 — migration | **Small** | One file. Do it now regardless of the rest. |
| 2 — model in-app | **Medium** | Biggest UI surface; also the phase that stands alone |
| 3 — `calendarFeed.js` | **Medium** | Pure, testable; the eligibility table is the spec |
| 4 — edge function | **Medium** | Small code, but §4.2 is where the care goes |
| 5 — Settings | **Small** | |
| 6 — RRULE + meal plans | **Medium** | RRULE gaps are the unknown |
| 7 — retire `.ics` | **Small** | |

No new dependency. No new infrastructure — the function slot and the Supabase
project already exist. The genuinely new risk is one URL that reads a member's
calendar forever.

---

## Related

- [`competitive-superlist.md`](competitive-superlist.md) — §3d (superseded by
  §1.1 here), §2 on platform-shaped gaps, §3e for the demo-mode constraint
- [`next-steps.md`](../next-steps.md) — §2 on schema timing, §3 on native
- [`areas-and-tags.md`](areas-and-tags.md) — the "one migration now, UI whenever"
  precedent this scope copies
- [`ROADMAP.md`](../../ROADMAP.md) — the vision line §1.3 proposes amending
