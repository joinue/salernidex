# Next steps — reminder go-live, then native iOS

State of play as of **August 2026**, written at the end of the session that took the
reminder stack live for the first time. Ordered by what blocks what.

---

## 1. Finish the reminder go-live

Everything below is small. The hard part (proving the stack works end to end) is done —
a real push landed on a real phone from the real Edge Function on 2026-08-06.

### 1a. Schedule the sweep — **the only thing between here and it running itself**

The function currently only fires when something calls it. Enable `pg_cron` + `pg_net`,
then run the `cron.schedule('send-reminders', '*/15 * * * *', …)` block from
`supabase/schema.sql` (near the Phase 6 section) in the **SQL editor**.

The job must send `Authorization: Bearer <CRON_SECRET>`. The value is in
`supabase/.env.local` (gitignored) and is already set as a function secret.

Note: the function is deployed with `--no-verify-jwt`, so Supabase's gateway does not
gate it — `auth.ts` is the only thing standing in front of it. That's intentional, and
it's why that check was tightened.

### 1b. Delete the dead June subscription

One row in `push_subscriptions` (created 2026-06-15) is still bound to a retired VAPID
key. Every send to it returns `400 VapidPkHashMismatch`.

**Related bug worth fixing:** `pushToSubs()` in `send-reminders/index.ts` only prunes on
`404`/`410`. Apple returns **`400`** for a key mismatch, so permanently-dead subscriptions
accumulate forever and every sweep wastes a request on them. Consider pruning on `400`
with `reason: VapidPkHashMismatch` too.

### 1c. Rotate the `service_role` key

It was printed into a chat transcript on 2026-08-06 while debugging. It bypasses all RLS.
Dashboard → Project Settings → API → rotate. Nothing in the app uses it (the client uses
the anon key; the Edge Function gets its own injected copy), so rotation is low-risk.

### 1d. Two gaps carried over from `notifications-review.md`

- A **"send a real test push"** button in Settings. Today's test button calls
  `showNotification()` locally, which cannot catch a VAPID mismatch — the exact failure
  class that cost hours this session.
- `notificationclick` may not re-route an already-open hash-router client. Consider
  `postMessage` to the client rather than `win.navigate()`.

---

## 2. Data-model work — do this **before** any App Store binary exists

Once an iOS app ships, old versions live on phones for months and you cannot force an
update. Schema changes are cheap now and expensive forever after.

### 2a. Per-member timezone — **blocks selling to anyone outside Arizona**

`TZ_NAME` ([index.ts:38](../supabase/functions/send-reminders/index.ts#L38)) is a single
hardcoded zone for the entire system. `localNow()` uses it to decide, for **every**
member, what "today" means (which tasks are due, which dates fire, how habits are
scheduled, what `sent_for` gets stamped) and what "now" is (digest window, per-habit and
per-list reminder windows).

There is no timezone column anywhere in the schema. The code comment calls it a
*"single-household assumption until go-live adds one per household."*

For a user in New York: an 8:00 AM digest arrives at 11:00 AM, and the day rolls over at
3:00 AM their time. For Europe, a whole morning where the server is on the previous day.

**The change:**
- `alter table household_members add column timezone text not null default 'America/Phoenix'`
- Move `localNow()` inside the per-member loop; take the zone from the member row.
- Populate on signup with `Intl.DateTimeFormat().resolvedOptions().timeZone` (one line,
  no user input).
- Phoenix was chosen originally because Arizona has no DST — once this is per-member,
  DST-observing zones need a test.

### 2b. Land the planned schema changes

Whatever is still intended from `notes-roadmap.md` and `task-areas-scope.md`. Additive,
idempotent, expand/contract only — never drop or rename a column while an older client
could still be reading it.

### 2c. Decide offline-write semantics

`offlineCache.js` says it plainly: *"a READ-ONLY safety net — writes still go straight to
Supabase; nothing here queues mutations."* And `sync()` is fire-and-forget — on failure it
toasts and refetches, so **an offline write is silently lost**.

A native app on GRDB gets a durable write queue nearly for free, which means web and iOS
would behave differently on the same account. Decide deliberately:

- bring the web up to a queued-write model, or
- accept the asymmetry and say so in the UI.

Related: conflict resolution is currently last-write-wins per row via full refetch. Once
both clients queue offline writes, guard the update with an `updated_at` comparison so a
stale queued write can't clobber a newer one.

---

## 3. Native iOS / iPadOS / watchOS

**Decision reached:** native SwiftUI for Apple platforms. Keep the React web app. Keep
Supabase unchanged. Not Capacitor, not a WebView wrapper.

**Why:** every deep integration wanted — widgets, Apple Watch, Siri, Live Activities — is
SwiftUI-only and unreachable from web code. A hybrid shell would still require all that
Swift, plus a hand-maintained JSON bridge from a WebView that Swift can't see into.

**The web app is not lost.** Of ~34k lines, only `src/lib` (~7.4k) needs a Swift twin. The
16k of JSX and 7.7k of CSS is view layer that was never shareable under any architecture.

### The duplication problem, and the answer

Logic will exist in two languages. That is the risk that kills this project — see
`habitSchedule.ts`, a hand port that silently drifted until a limit habit's weekly count
was wrong.

**Bind them with shared test vectors, not shared code.** Emit a language-neutral corpus
from the existing suites; both implementations must pass the identical file:

```
vectors/habits.json
  { fn: "currentStreak", habit: {...}, entries: [...], today: "2026-01-05", expect: 500 }
```

Vitest generates and consumes it; XCTest consumes the same file. This is
`habitSchedule.parity.test.ts` generalized into a cross-language contract.

### Build order — logic before pixels

1. **`SalernidexCore`** — pure Swift package, no UI or I/O. Port `habits`, `recurrence`,
   `tasks`, `reminders`, `listItems`, `orgs`. Done when it passes the vector corpus.
2. **`SalernidexData`** — GRDB (not SwiftData) + Supabase sync. Database file in an **App
   Group container** from day one, so widgets and the watch can read it directly.
3. **iPhone app** — Today, Tasks, Lists, People, Habits, Notes.
4. **iPad as a first-class target** — `NavigationSplitView`, drag-and-drop, pointer states,
   keyboard shortcuts (`src/lib/keys.js` already models the shortcut set), Pencil.
5. **Widgets + App Intents** — the payoff: they open the same GRDB file and call the same
   `currentStreak`. Intents defined once give Siri, Shortcuts, Spotlight, Action Button,
   and Apple Intelligence.
6. **Apple Watch** — independent app importing `SalernidexCore`. Habit logging from the
   wrist and a hands-free grocery list are the two features that sell it. Start
   phone-tethered; standalone needs its own Supabase session via a Keychain access group.
7. **Live Activities, WeatherKit** — last, and only with a concrete use.

### First concrete step

Extract the vector corpus from `habits`, `recurrence`, `tasks`, `reminders`. Highest
leverage available: it turns ~3.7k lines of tests into an executable specification, it's
what `SalernidexCore` gets built against, and it makes the existing suite stricter even if
no Swift is ever written.

### Commercial items to design for

- **Push transport.** `push_subscriptions` is web-push-shaped (`endpoint`/`p256dh`/`auth`).
  Native iOS means APNs. Add `transport text not null default 'webpush'` (`webpush` |
  `apns` | `fcm`) plus a nullable `device_token`, make the web-push columns nullable, and
  branch below `claimSend` only. ~50 additive lines now; surgery later.
- **Entitlement lives in Postgres**, written by both StoreKit 2 server notifications and
  Stripe webhooks, read by RLS. The database decides who paid, never the client.
- **Release cadence skew.** Web deploys in seconds; iOS takes review plus adoption. Old
  clients hit the database for months.
- **Parity policy:** anything touching data ships on both platforms; OS integrations are
  iOS-only and not owed to web.
- Sign in with Apple is **not** required — Guideline 4.8 only triggers with third-party
  logins, and auth here is email + password.

---

## Reference — environment layout

Getting this wrong caused the whole push outage. `VITE_*` is compiled into the browser
bundle; nothing secret may carry that prefix.

| Where | Variables |
|---|---|
| **Vercel** (build-time) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` |
| **Supabase function secrets** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `TZ_NAME`, `CRON_SECRET` |
| **Local `.env`** | the three `VITE_*` above |
| **Local `supabase/.env.local`** | the five function secrets, for `supabase secrets set --env-file` |

The public half must be **identical** in Vercel and Supabase. A mismatch is invisible:
subscriptions succeed, the UI says "Ready," and every push is rejected. `enablePush()` now
self-heals by re-subscribing when the key changes, but the values still have to match.

Useful commands:

```bash
supabase secrets set --env-file supabase/.env.local
supabase functions deploy send-reminders --use-api --no-verify-jwt   # no Docker needed
```
