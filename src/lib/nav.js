// Where you can go, and what the chrome offers on each page. One table, because
// the alternative is what this replaced: the sidebar's twelve destinations
// hardcoded in its JSX, four separate route lists in App.jsx describing the same
// route space, and a five-slot bottom bar that hadn't been revisited since the
// app had five screens. Notes ended up a top-level feature reachable on a phone
// from exactly one button on the Today page.
//
// Everything here is data — ids, labels, groups, slots — so it is testable and
// readable in one screen. Icons are named rather than imported: this module
// stays free of the view layer (see CONVENTIONS "lib/ = pure logic"), and
// components/shell/navIcons.js resolves the names, with a test keeping the two
// in step.

// The bar's two non-destination slots. Strings, so a bar row stays plain data.
export const ACTION = 'action' // the page's own create (＋); long-press = full add menu
export const MENU = 'menu' // ☰ — opens the drawer, which is the complete list

// Every destination the app has. `group` is the sidebar's heading (null = the
// first, unlabelled group); `count` names the quiet volume count it shows;
// `badge` marks the one destination that carries the red attention count.
//
// `pending` means the route doesn't exist yet — it's listed because the bar
// below already places it, and a half-written table is how these drift apart.
export const DESTINATIONS = [
  { id: 'today', label: 'Today', icon: 'Home', badge: true },
  { id: 'tasks', label: 'Tasks', icon: 'CheckSquare', count: 'tasks' },
  { id: 'projects', label: 'Projects', icon: 'Folder', count: 'projects' },
  // Calendar, not Bell: reminders are date-anchored (a birthday, an occasion),
  // and Bell belongs to notifications, which is a different thing arriving in
  // the top right. Two bells would be a coin flip every time.
  { id: 'reminders', label: 'Reminders', icon: 'Calendar', count: 'reminders' },
  { id: 'lists', label: 'Lists', icon: 'List', count: 'lists' },
  { id: 'habits', label: 'Habits', icon: 'Activity' },
  { id: 'notes', label: 'Notes', icon: 'FileText' },
  { id: 'people', label: 'People', icon: 'User', group: 'Contacts' },
  { id: 'relationships', label: 'Relationships', icon: 'Share2', group: 'Contacts' },
  { id: 'orgs', label: 'Organizations', icon: 'Briefcase', group: 'Contacts' },
  { id: 'groups', label: 'Groups', icon: 'Users', group: 'Contacts' },
  // Settings and Import / Export are NOT here, and they're still routes. They
  // live behind the account avatar in the top right, with the theme and Logout —
  // account business rather than places your household's things live. In the
  // drawer they sat at the bottom, which handed the four least-used items (one
  // of them destructive, in red) the easiest spot on the screen to hit.
]

// Reached from Habits rather than the menu, but it needs a bar slot of its own
// or it stays a single button on one page.
export const INSIGHTS = 'habit-insights'

// ── The bottom bar ────────────────────────────────────────────────────────────
// Five slots, every page: [ home · sibling · ＋ · neighbour · ☰ ].
//
// Slots 1, 3 and 5 never change. The other two do — and the rule that makes
// that bearable is that a destination keeps ONE slot everywhere it appears, so
// Lists is always the fourth thing and Tasks is always the second. Mixing 3- and
// 5-item bars was the other option and it fails this: with three items they sit
// at 17/50/83% and with five at 10/30/50/70/90, so only the centre holds still
// and you end up reading the bar before every tap.
//
// It works because a destination never appears on its own page, which is what
// lets Tasks and Projects share slot 2 without ever colliding.
//
// Slot 1 is Today even ON Today, where it renders as the current page rather
// than a link — otherwise the row has a hole in it, and Today loses the only
// "you are here" mark a contextual bar can offer.
export const BAR = {
  today: ['today', 'tasks', ACTION, 'lists', MENU],
  tasks: ['today', 'projects', ACTION, 'reminders', MENU],
  projects: ['today', 'tasks', ACTION, 'lists', MENU],
  reminders: ['today', 'tasks', ACTION, 'lists', MENU],
  lists: ['today', 'tasks', ACTION, 'reminders', MENU],
  notes: ['today', 'tasks', ACTION, 'lists', MENU],
  habits: ['today', 'tasks', ACTION, INSIGHTS, MENU],
  // The contacts pages carry each other: from Groups you want People and
  // Organizations, and Relationships lives in the drawer — it's the one of the
  // four you don't hop to mid-task, and a slot has to be earned.
  people: ['today', 'notes', ACTION, 'groups', MENU],
  groups: ['today', 'people', ACTION, 'orgs', MENU],
  orgs: ['today', 'people', ACTION, 'groups', MENU],
  // Relationships keeps a bar of its own even though it never occupies a slot
  // on anyone else's — those are different claims, and conflating them is how
  // this page nearly became a trap: it's the one top-level screen that renders
  // a PageHeader with no back button, so a drawer arrival with no bar would
  // have left the OS gesture as the only way out.
  relationships: ['today', 'people', ACTION, 'groups', MENU],
}

// Pages that deliberately have no bottom bar.
//
// Detail screens are the interesting half. A project page used to show a bar
// offering Today / People / Habits / Tasks / Lists over a screen that has
// nothing to do with any of them, and its top-left Back competed with nothing
// while three other ways back already existed (the bar's own slot 1 would have
// been a fourth). So: NavBar owns the top, the page owns the middle, and the
// bottom belongs to the page it's about. `note` was already doing this.
//
// The rest are menu destinations — you arrive from the drawer and leave the way
// you came. Giving them a bar would mean inventing a mode for the centre slot,
// since there is nothing to create on any of them.
//
// Every route in here must therefore offer a back of its own. That isn't a
// stylistic rule: a page with no bar and no back is reachable and not leavable.
export const BARLESS_ROUTES = [
  'person',
  'org',
  'group',
  'task',
  'project',
  'list',
  'note',
  'habit',
  'habit-insights',
  'activity',
  'import',
  'settings',
  // Its own back is the NavBar in AreasView, per the rule above.
  'areas',
  'privacy',
  'terms',
]

// ── Routes ───────────────────────────────────────────────────────────────────
// Hash routing: #/ (today), #/activity, #/people, #/person/<id>, #/tasks,
// #/task/<id>, #/project/<id>, #/lists, #/list/<id>, #/orgs, #/org/<id>,
// #/groups, #/group/<id>, #/relationships, #/import. An index page can take an
// id to say which row you came for: #/tasks/<id> lands with that row expanded
// and scrolled to, #/reminders/<id> with that reminder marked. Followed from
// Today, the activity feed and Quick Find — the pages that show a thing as one
// line and need somewhere to send you for the rest of it. #/task/<id> is the
// singular, and a different destination: that one task on a page of its own.

// Detail pages get iOS-style edge-swipe back (mobile).
export const DETAIL_ROUTES = [
  'person',
  'org',
  'group',
  'task',
  'project',
  'list',
  'note',
  'habit',
  'habit-insights',
  'activity',
  'settings',
  'areas',
  'privacy',
  'terms',
]

// Routes the area lens scopes (0040). Everything your household DOES lives
// here; everything it KNOWS deliberately doesn't.
//
// The Contacts group is absent on purpose and it is the load-bearing omission:
// a colleague who becomes a friend is not 40% work, they're both, so a person
// must never vanish because you're in Work mode. Non-exclusive by nature ⇒ tags
// and Groups, which the app already has a whole page for. Search is absent for
// a different reason — searching MEANS you don't know where the thing is, so
// scoping it is how a search returns nothing and the data looks lost.
//
// 0042 gave contacts a `context_area_id` and did NOT change this list, which is
// the whole design rather than an oversight. A context is additive: it unlocks
// the business field set on a record and lets that contact's check-in be muted
// with its area. It never decides whether the contact appears. If `people` ever
// shows up in this array, the sentence above stopped being true.
//
// See docs/scopes/areas-and-tags.md §3.2.
export const AREA_SCOPED_ROUTES = ['today', 'tasks', 'projects', 'reminders', 'lists', 'notes']

// `habits` is absent, and that is a scope decision rather than an oversight.
// habits.area_id exists (0040) but nothing sets it — there is no picker in
// HabitForm, because nobody has forty habits and the page was never a bloated
// mess. Listing it here would put a switcher on a page where every habit is
// unfiled, so picking any area would empty it. Add the route the same day the
// picker lands, not before. See docs/scopes/areas-and-tags.md §3.2.

// NO_FAB_ROUTES and NO_TABBAR_ROUTES used to live here. Both are gone, and
// their absence is the point: the create button moved into the bar's middle
// slot, so "has a bar" and "has a create" became the same question, and
// BARLESS_ROUTES answers it once. Two lists that had to agree with a third are
// two lists that can disagree.

// Stale bookmarks / typo'd hashes land on Today, not a blank screen.
export const KNOWN_ROUTES = [
  'today',
  'board',
  'activity',
  'tasks',
  'task',
  'projects',
  'project',
  'reminders',
  'lists',
  'list',
  'notes',
  'note',
  'people',
  'person',
  'orgs',
  'org',
  'groups',
  'group',
  'relationships',
  'habits',
  'habit',
  'habit-insights',
  'import',
  'settings',
  // Managing the lens (0040). Reachable but deliberately not a DESTINATION
  // above: you come here to tidy areas up, not to work in one. Its front door
  // is Settings — and, once the switcher lands, that switcher's overflow.
  'areas',
  'privacy',
  'terms',
]

// ── Surviving the auth detour ────────────────────────────────────────────────
// A link texted between household members points at one thing — #/list/<id> —
// and the person tapping it may not have a session on that device yet.
//
// Signing in with a password keeps the hash, so that path already worked. The
// one that doesn't is any flow that RETURNS to the app on a URL of its own:
// password reset redirects to `window.location.origin`, and Supabase's own
// email links come back with `#access_token=…`. Either way the destination is
// gone by the time there's a session to show it with, and the person who tapped
// a link to the grocery list lands on Today with no idea what they missed.
//
// So the destination is stashed before it can be lost and restored after. This
// is the pure half — "is this hash a link to one specific thing?" — with the
// stashing in App, which is where the session actually changes.
//
// An id is required, and that is the whole test: a link to a *thing* is worth
// restoring, while a bare route is not worth overriding wherever sign-in would
// otherwise have landed you.
export function deepLinkPath(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '')
  // Auth tokens arrive as a query-ish fragment (`access_token=…&type=recovery`).
  // Never a route, and splitting one on '/' would produce nonsense.
  if (!raw || raw.includes('=')) return null
  const [name, id] = raw.split('/')
  if (!id || !KNOWN_ROUTES.includes(name)) return null
  return `${name}/${id}`
}

// The sidebar's groups, in order, with their destinations. Derived rather than
// listed so a new destination can't be added to the model and then quietly
// missed by the surface that renders it.
export function destinationGroups() {
  const order = []
  const byGroup = new Map()
  for (const d of DESTINATIONS) {
    const key = d.group || ''
    if (!byGroup.has(key)) {
      byGroup.set(key, [])
      order.push(key)
    }
    byGroup.get(key).push(d)
  }
  return order.map((label) => ({ label: label || null, items: byGroup.get(label) }))
}

// The bar for a route, or null when the route deliberately has none. Unknown
// routes fall back to Today's bar, matching how an unknown hash falls to Today.
export function barFor(route) {
  if (!route || BARLESS_ROUTES.includes(route)) return null
  return BAR[route] || BAR.today
}
