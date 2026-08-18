// The attention engine: ONE pure function that decides what needs you today.
// Today's sections, the tab/app badges, and (in 6b) the server-side push
// sender all read from this, so the surfaces can never disagree.
//
// This was lib/reminders.js, which it never really was: it decides what needs
// you, and "reminder" is now a thing the user makes (lib/reminders.js is that —
// the entity and its derived dates). The snooze table and the send-reminders
// Edge Function keep the old word, because for them it's the right one: they
// deliver notifications, which is what a reminder means on that side.
//
// Returns [{ kind, key, urgency, ...payload }]:
//   kind 'task'  — top-level open task due today or overdue        (payload: task)
//                  …or a 'by' deadline landing inside ANYTIME_DAYS (payload: task)
//   kind 'nudge' — someone you meant to stay close to, drifting    (payload: person, state, lastIso)
//                  …or an ORG with a cadence of its own (0042)      (payload: org, state, lastIso)
//                  Exactly one of `person` / `org` is set; read it with the
//                  helper rather than assuming, since both render the same row.
//                  (internal name; the UI says "check in" — never "nudge"/"follow up")
//   kind 'date'  — birthday or key date inside the lead window     (payload: entry from upcomingDates)
//   kind 'reminder' — a reminder you wrote, dated inside that window (payload: reminder)
//                  Nothing to do; it still counts, because knowing is the point
//   kind 'list'  — a list with a due_date that's due today/overdue  (payload: list)
//   kind 'habit' — a habit scheduled today that isn't done yet      (payload: habit)
//   urgency: 'overdue' | 'today' | 'anytime' | 'upcoming' | 'soft'
//     'soft' is the ambient tier (relationship check-ins): shown in Today, but
//     kept out of the red count badge so it can't perpetually inflate it.
//     'anytime' is the same deal for deadlines that haven't arrived yet — a
//     heads-up while you still have room to plan, not something due now.
//   key: stable id, doubles as reminder_snoozes.target_key
//
// Per-member snoozes hide items: until=null means dismissed for good,
// otherwise hidden through that timestamp. FYI items (partner activity) are
// push-only (6b) — in-app, the Recent activity section already covers them.
import { taskBucket, byDue, daysUntilDue, dueState, slackDays } from './tasks'
import { followUp, lastInteraction, lastOrgInteraction, upcomingDates } from './contact'
import { isDueable } from './listKinds'
import { entryMap, habitsDueToday } from './habits'
import { DEFAULT_PREFS } from './notifyPrefs'
import { mutedAreaIds, reachesToday, contactReachesToday } from './areas'

// How far ahead a deadline ('by') task reaches onto Today. A week is the span
// you can actually plan across — far enough to slot the task into a free
// evening, near enough that it isn't just noise. Beyond it the task waits in
// the Tasks page's Anytime section.
export const ANYTIME_DAYS = 7

// Is this task mine to worry about today? A task assigned to someone else in
// the household is theirs — surfacing it here (and in the tab badge, the app
// icon badge and the push notification) is how a shared dashboard becomes
// everyone's noise. Unassigned ("anyone") work still belongs to everybody, so
// it stays. `taskScope: 'all'` opts back into seeing the whole household.
//
// `normalize` is injected rather than imported: stored assignees can still be
// the legacy labels ('me' / 'partner' / 'either') that predate member ids, and
// only lib/household knows how to map those — but this module is pure and is
// also ported server-side in the reminders Edge Function, which has no such
// list. Callers in the app pass household.normalizeAssignee; the default is a
// pass-through, which is correct for uuid-only data. Getting this wrong is not
// subtle: an unmapped 'me' matches nothing and Today comes up empty.
function assignedToMe(task, memberId, scope, normalize) {
  if (scope === 'all' || !memberId) return true
  const a = normalize(task.assignee)
  return !a || a === 'anyone' || a === normalize(memberId)
}

export function buildAttention(
  data,
  prefs = DEFAULT_PREFS,
  snoozes = [],
  memberId = null,
  now = Date.now(),
  // No `areaId` here on purpose. The badge must not follow the lens — your work
  // tasks still need you while you're looking at Home, and a count that changed
  // every time you flipped the switcher would stop meaning anything — and Today
  // needs the excluded items rather than a list with them already removed. So
  // the lens is applied by the caller; this returns everything that needs you.
  { taskScope = 'mine', normalizeAssignee = (v) => v } = {},
) {
  const {
    people = [],
    orgs = [],
    tasks = [],
    interactions = [],
    keyDates = [],
    reminders = [],
    lists = [],
    habits = [],
    habitEntries = [],
    areas = [],
  } = data
  // Muted areas are needed before the loops now, not just at the filter below:
  // a contact known through a silenced area drops out here, at the source, so
  // its check-in and its dates go with it. Doing it in the tail filter would
  // work for the item but not for the ORDER — checkIns sorts longest-quiet
  // first, and a silenced contact leading that sort would push a real one down.
  const muted = mutedAreaIds(areas)
  const active = people.filter((p) => !p.deleted_at && contactReachesToday(p, muted))
  // Orgs hard-delete rather than soft-delete, so there's no deleted_at to test.
  const activeOrgs = orgs.filter((o) => contactReachesToday(o, muted))

  const hidden = new Set(
    snoozes
      .filter((s) => !memberId || s.member_id === memberId)
      .filter((s) => s.until === null || new Date(s.until).getTime() > now)
      .map((s) => s.target_key),
  )

  const items = []

  if (prefs.tasks) {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    for (const t of tasks) {
      if (t.completed_at || t.is_heading) continue
      // A project lives in the Projects index, not the To-do list — but its
      // dated steps should still nudge you on the right day. So we skip the
      // project container itself and instead surface a subtask when its parent
      // is a project AND it carries its own due date (loose subtasks of a plain
      // task stay checklist detail, never Today rows). Top-level non-project
      // tasks behave exactly as before.
      if (t.is_project) continue
      const parent = t.parent_id ? byId.get(t.parent_id) : null
      if (t.parent_id && !(parent && parent.is_project && t.due_date)) continue
      // A project's step inherits the project's owner when it has none of its
      // own — otherwise every subtask of someone else's project would still
      // read as unassigned and land on your dashboard.
      if (!assignedToMe(t.assignee ? t : parent || t, memberId, taskScope, normalizeAssignee))
        continue
      const bucket = taskBucket(t)
      // A deadline earns a spot once it's close enough to plan around. Without
      // this it would stay invisible until the morning it was due — the one day
      // it is no longer flexible, which is precisely backwards.
      if (bucket === 'anytime' && slackDays(t) > ANYTIME_DAYS) continue
      if (bucket !== 'overdue' && bucket !== 'today' && bucket !== 'anytime') continue
      const project = parent && parent.is_project ? parent : null
      items.push({ kind: 'task', key: `task:${t.id}`, urgency: bucket, task: t, project })
    }
    // Soonest first, then earliest time of day, then higher priority (byDue).
    items.sort((a, b) => byDue(a.task, b.task))
  }

  // A list with a due_date that's reached today (or slipped past) earns a spot —
  // the whole list is the actionable thing ("get the groceries by Fri"), so it
  // rides alongside tasks instead of duplicating into one.
  if (prefs.lists) {
    for (const l of lists) {
      // A kind that can't carry a due date can't be due. The form hides the
      // field, but a row written before 0037/0038 — or by an older client —
      // could still hold one, and a collection nagging you is nonsense.
      if (!isDueable(l)) continue
      const bucket = dueState(l.due_date)
      if (bucket !== 'overdue' && bucket !== 'today') continue
      items.push({ kind: 'list', key: `list:${l.id}`, urgency: bucket, list: l })
    }
  }

  // A habit scheduled today that you haven't done yet. Ambient like a check-in,
  // so it rides the 'soft' tier: it belongs to today, but a daily ritual you
  // already know about must not sit in the red count every morning until you
  // log it — that's exactly the badge-never-reaches-zero failure 'soft' exists
  // to prevent. The key matches the Edge Function's `habit:<id>` targetKey, so
  // snoozing one here also silences its push.
  if (prefs.habits) {
    const map = entryMap(habitEntries)
    for (const h of habitsDueToday(habits, map, new Date(now))) {
      items.push({ kind: 'habit', key: `habit:${h.id}`, urgency: 'soft', habit: h })
    }
  }

  if (prefs.nudges) {
    const checkIns = []
    for (const p of active) {
      const last = lastInteraction(p.id, interactions)
      const f = followUp(p, last?.occurred_at)
      if (!f || f.state === 'ok') continue
      checkIns.push({
        kind: 'nudge',
        key: `nudge:${p.id}`,
        // Ambient, never-expiring relationship nudge — soft, not a deadline, so
        // it stays out of the red badge (see badgeCount) while still showing here.
        urgency: 'soft',
        person: p,
        state: f.state,
        lastIso: last?.occurred_at || null,
      })
    }
    // Organizations with a cadence of their own (0042). The client company is
    // the thing you actually manage, and its contact person may change twice a
    // year — so the account has to be followable-up with, not just whoever
    // happens to be your contact there this quarter.
    //
    // Same kind and same 'soft' tier as a person's, because it IS the same
    // thing; the key is namespaced so a snooze on one can't silence the other.
    for (const o of activeOrgs) {
      const last = lastOrgInteraction(o.id, interactions)
      const f = followUp(o, last?.occurred_at)
      if (!f || f.state === 'ok') continue
      checkIns.push({
        kind: 'nudge',
        key: `nudge:org:${o.id}`,
        urgency: 'soft',
        org: o,
        state: f.state,
        lastIso: last?.occurred_at || null,
      })
    }
    // people you've never caught up with first, then longest-quiet first
    checkIns.sort((a, b) => ((a.lastIso || '') < (b.lastIso || '') ? -1 : 1))
    items.push(...checkIns)
  }

  if (prefs.dates) {
    for (const entry of upcomingDates(active, keyDates, prefs.dates_lead_days)) {
      const key =
        entry.kind === 'birthday' ? `date:b-${entry.person.id}` : `date:${entry.keyDate.id}`
      items.push({
        kind: 'date',
        key,
        urgency: entry.daysUntil === 0 ? 'today' : 'upcoming',
        entry,
      })
    }
    // Reminders you wrote, alongside the dates read off your contacts — Today
    // shows them in one section, because "what's coming up" is one question.
    //
    // Same 'today' | 'overdue' urgency a task gets, and deliberately so: an
    // unacknowledged reminder belongs in the badge. Nothing needs doing, but
    // something needs *knowing*, and that's exactly what the badge is for. The
    // one difference from a task is that it can never be late — see
    // TodayView's copy.
    for (const r of reminders) {
      if (r.completed_at || !r.due_date) continue
      if (!assignedToMe(r, memberId, taskScope, normalizeAssignee)) continue
      const d = daysUntilDue(r.due_date)
      if (d === null || d > (prefs.dates_lead_days ?? 7)) continue
      items.push({
        kind: 'reminder',
        key: `reminder:${r.id}`,
        urgency: d < 0 ? 'overdue' : d === 0 ? 'today' : 'upcoming',
        reminder: r,
      })
    }
  }

  // show_on_today, applied to every caller: Today, the nav badge, the app-icon
  // badge and the push sweep. STANDING — "this part of my life doesn't belong
  // on a Saturday" — as opposed to the lens, which is momentary and belongs to
  // whoever is doing the looking. It has to run here, or work you deliberately
  // silenced still buzzes the phone. Since 0042 that includes the check-ins and
  // dates of contacts you know through a silenced area (applied at `active`).
  //
  // The LENS is deliberately NOT applied here. It was, and that was wrong: a
  // caller scoping to an area also needs the items it EXCLUDED, to offer them
  // in a "No area" section — and a filter that has already dropped them can't
  // hand them back. TodayView partitions with canBeFiled/attentionAreaId below.
  //
  // (Contact-derived items were already dropped at `active` above, since their
  // area lives on the contact rather than on the item.)
  return items.filter((i) => !hidden.has(i.key) && reachesToday(itemRow(i), muted))
}

// Which area an attention item belongs to, or null.
//
// Contact-derived items (`nudge`, `date`) read the CONTACT's context area
// (0042), which lives on context_area_id rather than area_id — see lib/areas.js
// for why the two are named apart.
export function attentionAreaId(item) {
  const contact = itemContact(item)
  if (contact) return contact.context_area_id ?? null
  return itemRow(item)?.area_id ?? null
}

// Could this item have been filed into an area at all?
//
// The distinction is unfiled vs UNFILEABLE, and it decides what a "No area"
// section may hide. A task with no area is unfiled — you could file it, and a
// nudge to do so is useful. Habits are unfileable in practice — the column
// exists but nothing sets it, which is why `habits` is absent from
// AREA_SCOPED_ROUTES.
//
// Contact-derived items are the interesting case, and they are answered PER
// ITEM rather than per kind. Before 0042 the answer was a flat no, because
// contacts had no area and a birthday genuinely couldn't be filed. Now a contact
// may name a context, so:
//
//   • contact WITH a context  → fileable; the lens scopes it like anything else,
//     which is what lets a client's follow-up stay out of Home
//   • contact WITHOUT one     → unfileable, exactly as before: it shows under
//     every lens, and never gets swept into the "No area" section
//
// The second half is load-bearing. Answering `true` for the whole kind would
// have moved every birthday in a personal household — none of which has a
// context, and none of which ever will — into a collapsed section the moment the
// user picked any lens. Same failure this comment has always warned about; the
// change is that the answer now depends on the data instead of the kind.
export function canBeFiled(item) {
  if (item.kind === 'task' || item.kind === 'list' || item.kind === 'reminder') return true
  return !!itemContact(item)?.context_area_id
}

// The contact an item was read off, for the two kinds that have one. A nudge
// carries its person — or, since 0042, its org — directly; a date carries the
// entry that upcomingDates built.
function itemContact(item) {
  if (item.kind === 'nudge') return item.person || item.org || null
  if (item.kind === 'date') return item.entry?.person || null
  return null
}

// Which row an item's own area_id lives on, for the kinds that carry one. Tasks,
// reminders (tasks too) and lists have it; habits have the column but nothing
// sets it yet.
function itemRow(item) {
  return item.task || item.reminder || item.list || item.habit || null
}

// Tab + app-icon badge: only what's actionable right now. Soft items (ambient
// relationship check-ins) are deliberately excluded — a count badge that never
// drops to zero loses its meaning and trains the eye to ignore it.
export function badgeCount(items) {
  return items.filter((i) => i.urgency === 'overdue' || i.urgency === 'today').length
}
