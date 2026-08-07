import { isConfigured } from './supabase'
import { nextOccurrence } from './recurrence'

// Demo mode: active whenever Supabase isn't configured (or forced via
// VITE_DEMO=true), OR at runtime when someone taps "Explore the demo" on the
// auth screen (App passes session.demo through). Everything runs in-memory
// with sample data — nothing is saved between reloads. Company and
// neighborhood names here are fictional (a clean showcase, not real contacts).
export const demoMode = !isConfigured || import.meta.env.VITE_DEMO === 'true'

const now = new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const pad = (n) => String(n).padStart(2, '0')
// Local yyyy-mm-dd, n days ago — for habit_entries (a DATE column).
const isoDay = (n) => {
  const d = new Date(Date.now() - n * 86400000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const habitDays = (habitId, n, valueFn) =>
  Array.from({ length: n }, (_, i) => ({
    id: `he-${habitId}-${i}`,
    habit_id: habitId,
    date: isoDay(i),
    value: valueFn(i),
  }))
const dateIn = (n) => {
  const d = new Date(Date.now() + n * 86400000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// A birthday ~5 days out (fixed birth year) so the Today "Dates" section
// always has something inside the default 7-day heads-up window, whatever
// today's date is.
const soonBirthday = (() => {
  const d = new Date(Date.now() + 5 * 86400000)
  return `1990-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const base = {
  deleted_at: null,
  created_at: now,
  updated_at: now,
  privacy_level: 'shared',
  birthday: null,
  address: '',
  keep_in_touch_days: null,
  tier: null,
  family_id: null,
  created_by: 'm-1',
}

export const demoPeople = [
  {
    ...base,
    id: 'p-elena',
    tier: 'close',
    keep_in_touch_days: 90,
    name: 'Elena Vasquez',
    email: 'elena@riversidecompass.org',
    phone: '(555) 555-0142',
    emails: [{ label: 'Home', value: 'elena.vasquez@gmail.com' }],
    phones: [{ label: 'Work', value: '(555) 555-0190' }],
    socials: [
      { platform: 'linkedin', value: 'elena-vasquez' },
      { platform: 'instagram', value: '@elena.builds' },
    ],
    birthday: '1984-03-14',
    address: '2240 Riverside Ave, Riverside',
    tags: ['Riverside Compass partner'],
    notes:
      'Runs the workforce navigation program. Prefers email; responds fast. Interested in a Northwind facility tour for her cohort.',
  },
  {
    ...base,
    created_by: 'm-2', // added by partner — only they can permanently delete
    id: 'p-david',
    tier: 'network',
    keep_in_touch_days: 30,
    name: 'David Chen',
    email: 'dchen@summitmaterials.com',
    phone: '(555) 555-0177',
    tags: ['Northwind customer'],
    notes:
      'Bought a grinder/polisher line in 2025. Asks detailed consumables questions — loop in support early.',
  },
  {
    ...base,
    id: 'p-rita',
    tier: 'close',
    keep_in_touch_days: 90,
    name: 'Rita Delgado',
    email: 'rita.delgado@oaklinena.org',
    phone: '(555) 555-0118',
    birthday: '1962-11-02',
    tags: ['ONA board'],
    notes: 'Leads the monthly board meeting, first Tuesdays. Strong on zoning issues.',
  },
  {
    ...base,
    id: 'p-sam',
    name: 'Sam Whitfield',
    email: 'sam.whitfield@lakeside.gov',
    phone: '(555) 555-0163',
    tags: ['District 4 contact', 'Lakeside County'],
    notes:
      'Go-to for constituent services and street/lighting requests. Met at the District 4 open house.',
  },
  {
    ...base,
    created_by: 'm-2', // added by partner — only they can permanently delete
    id: 'p-priya',
    keep_in_touch_days: 180,
    name: 'Priya Natarajan',
    email: 'priyan@riverbend.edu',
    phone: '(555) 555-0190',
    tags: ['Northwind customer', 'University'],
    notes: 'Teaching lab uses Northwind equipment. Potential student internship pipeline.',
  },
  {
    ...base,
    id: 'p-tom',
    tier: 'network',
    keep_in_touch_days: 30,
    name: 'Tom Garrity',
    email: 'tom@garritymachining.com',
    phone: '(555) 555-0125',
    tags: ['Northwind customer'],
    notes: 'Small shop, long-time customer. Calls rather than emails.',
  },
  {
    ...base,
    id: 'p-maria',
    name: 'Maria Fuentes',
    email: 'maria@riversidecompass.org',
    phone: '(555) 555-0151',
    tags: ['Riverside Compass partner'],
    notes: 'Coordinates volunteer events. Best reached Tue–Thu.',
  },
  {
    ...base,
    id: 'p-jack',
    name: 'Jack Osterman',
    email: 'jack.o@oaklinena.org',
    phone: '(555) 555-0109',
    tags: ['ONA board'],
    notes: 'Handles dues and the annual budget. Retired accountant.',
  },
  {
    ...base,
    id: 'p-lupe',
    name: 'Lupe Ortiz',
    email: 'lupe.ortiz@lakeside.gov',
    phone: '(555) 555-0136',
    tags: ['Lakeside County'],
    notes: 'Point of contact for the small business incentive program.',
  },
  {
    ...base,
    id: 'p-nina',
    tier: 'inner',
    family_id: 'f-park',
    keep_in_touch_days: 180,
    name: 'Nina Park',
    // No affiliation at all — the one case where people.role still carries the
    // descriptor on its own (see lib/orgs.js personSummary).
    role: 'Neighbor',
    email: '',
    phone: '(555) 555-0171',
    birthday: soonBirthday,
    address: 'Two doors down — 1314 Maple St',
    tags: ['Neighbor'],
    privacy_level: 'family_shared',
    notes: 'Two doors down. Has our spare key. Dog: Biscuit.',
  },
  {
    ...base,
    id: 'p-theo',
    tier: 'inner',
    family_id: 'f-park',
    name: 'Theo Park',
    email: 'theo.park@oaklineschools.org',
    phone: '(555) 555-0172',
    birthday: '1988-09-30',
    address: 'Two doors down — 1314 Maple St',
    tags: ['Neighbor'],
    privacy_level: 'family_shared',
    notes: "Nina's husband. Grills on Sundays — standing invite. Coaches Little League in spring.",
  },
  {
    ...base,
    id: 'p-marco',
    name: 'Marco Reyes',
    email: 'marco@reyeshome.com',
    phone: '(555) 555-0188',
    tags: ['Contractor'],
    privacy_level: 'family_shared',
    notes: 'Did the water heater in 2024. Reliable, texts back fast.',
  },
]

export const demoOrgs = [
  {
    ...base,
    id: 'o-pace',
    name: 'Northwind Instruments',
    type: 'Company',
    description: 'Lab instruments and consumables. Home base.',
    key_contacts: [],
    tags: ['work'],
  },
  {
    ...base,
    id: 'o-mna',
    name: 'Oakline Neighborhood Association',
    type: 'Community',
    description: 'Neighborhood association. Board meets first Tuesday of the month.',
    key_contacts: [],
    tags: ['civic'],
  },
  {
    ...base,
    id: 'o-compass',
    name: 'Riverside Compass',
    type: 'Nonprofit',
    description: 'Workforce navigation nonprofit; partnership on facility tours and internships.',
    key_contacts: [],
    tags: ['civic'],
  },
  {
    ...base,
    id: 'o-pima',
    name: 'Lakeside County',
    type: 'Government',
    description: 'County government contacts — District 4 and economic development.',
    key_contacts: [],
    tags: ['civic'],
  },
  {
    ...base,
    id: 'o-reyes',
    name: 'Reyes Home Services',
    type: 'Contractor',
    description: 'Plumbing & handyman work around the house. Marco is our guy.',
    // A counterparty org is a complete contact on its own — you call the shop,
    // not necessarily the person.
    phone: '(555) 555-0187',
    email: 'dispatch@reyeshome.com',
    website: 'reyeshome.com',
    address: '480 Foundry Rd, Oakline',
    key_contacts: [],
    tags: ['home'],
  },
  {
    ...base,
    id: 'o-summit',
    name: 'Summit Materials Lab',
    type: 'Company',
    description: 'Materials testing lab — customer for consumables and polishing pads.',
    key_contacts: [],
    tags: ['work'],
  },
  {
    ...base,
    id: 'o-riverbend',
    name: 'Riverbend University',
    type: 'School / Education',
    description: 'University research contacts; met at the materials conference.',
    key_contacts: [],
    tags: ['work'],
  },
  {
    ...base,
    id: 'o-garrity',
    name: 'Garrity & Sons Machining',
    type: 'Company',
    description: 'Machine shop — referred to Summit for testing.',
    key_contacts: [],
    tags: ['work'],
  },
  {
    ...base,
    id: 'o-oakline-sd',
    name: 'Oakline School District',
    type: 'School / Education',
    description: 'Local school district.',
    phone: '(555) 555-0100',
    website: 'oaklineschools.org',
    key_contacts: [],
    tags: ['civic'],
  },
  {
    ...base,
    id: 'o-lakeside-dental',
    name: 'Lakeside Family Dental',
    type: 'Healthcare',
    description: "Everyone's dentist. Cleanings every six months.",
    // Deliberately has no people attached: an org you deal with is a complete
    // record on its own, which is the whole point of giving orgs contact fields.
    phone: '(555) 555-0155',
    email: 'front.desk@lakesidedental.com',
    website: 'lakesidedental.com',
    address: '77 Lakeshore Dr, Oakline',
    key_contacts: [],
    tags: ['home'],
  },
]

// Person ↔ organization links (0033). Note the two shapes side by side: Marco's
// link to Reyes Home Services is a Contractor, so "Plumber at Reyes Home
// Services" reads under his name; David's link to Summit Materials Lab is a
// Company, so his row says "Metallography Lab Manager" and leaves the employer
// to his profile. Elena carries both — the nonprofit she works at (biography)
// and the neighborhood board she sits on.
export const demoAffiliations = [
  {
    id: 'af-elena-compass',
    person_id: 'p-elena',
    organization_id: 'o-compass',
    role: 'Program Director',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-elena-mna',
    person_id: 'p-elena',
    organization_id: 'o-mna',
    role: 'Board member',
    is_primary: false,
    show_in_summary: null,
    started_on: '2023-01-01',
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-david-summit',
    person_id: 'p-david',
    organization_id: 'o-summit',
    role: 'Metallography Lab Manager',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-2',
  },
  {
    id: 'af-rita-mna',
    person_id: 'p-rita',
    organization_id: 'o-mna',
    role: 'Board President',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-sam-pima',
    person_id: 'p-sam',
    organization_id: 'o-pima',
    role: 'District 4 Council Aide',
    is_primary: true,
    // Overridden on purpose: Lakeside County is typed Government (biography by
    // default), but Sam IS the county to us — that's why we have his number.
    show_in_summary: true,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-priya-riverbend',
    person_id: 'p-priya',
    organization_id: 'o-riverbend',
    role: 'Materials Science Professor',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-2',
  },
  {
    id: 'af-tom-garrity',
    person_id: 'p-tom',
    organization_id: 'o-garrity',
    role: 'Owner',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-maria-compass',
    person_id: 'p-maria',
    organization_id: 'o-compass',
    role: 'Volunteer Coordinator',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-jack-mna',
    person_id: 'p-jack',
    organization_id: 'o-mna',
    role: 'Treasurer',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-lupe-pima',
    person_id: 'p-lupe',
    organization_id: 'o-pima',
    role: 'Economic Development Specialist',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-theo-oakline',
    person_id: 'p-theo',
    organization_id: 'o-oakline-sd',
    role: 'Teacher',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-marco-reyes',
    person_id: 'p-marco',
    organization_id: 'o-reyes',
    role: 'Plumber',
    is_primary: true,
    show_in_summary: null,
    started_on: null,
    ended_on: null,
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
  {
    id: 'af-tom-summit-former',
    person_id: 'p-tom',
    organization_id: 'o-summit',
    role: 'Shop Foreman',
    is_primary: false,
    show_in_summary: null,
    started_on: '2016-04-01',
    ended_on: '2021-08-31', // history: shows as Former, never labels him
    created_at: now,
    updated_at: now,
    created_by: 'm-1',
  },
]

// Contact family units (distinct from the household/tenant model).
export const demoFamilies = [
  {
    id: 'f-park',
    name: 'The Parks',
    notes: 'Neighbors at 1314 Maple St.',
    created_at: now,
    updated_at: now,
  },
]

// Dates that matter beyond birthdays, all inside the default 7-day heads-up
// window so the Today "Dates" merge always demos. Rita's retirement party is
// a one-off.
const annivDate = (() => {
  const d = new Date(Date.now() + 6 * 86400000)
  return `2015-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()
export const demoKeyDates = [
  {
    id: 'kd-park-anniv',
    person_id: 'p-nina',
    label: 'Wedding anniversary',
    date: annivDate,
    annual: true,
    created_at: now,
  },
  {
    id: 'kd-rita-retire',
    person_id: 'p-rita',
    label: 'Retirement party',
    date: dateIn(2),
    annual: false,
    created_at: now,
  },
]

export const demoGroups = [
  {
    id: 'g-dinner',
    name: 'Dinner Crew',
    kind: 'manual',
    member_ids: ['p-elena', 'p-david', 'p-rita', 'p-sam'],
    all_tags: [],
    any_tags: [],
    none_tags: [],
    created_at: now,
    updated_at: now,
  },
  {
    id: 'g-pace',
    name: 'Northwind Customers',
    kind: 'smart',
    all_tags: ['Northwind customer'],
    any_tags: [],
    none_tags: [],
    created_at: now,
    updated_at: now,
  },
  {
    id: 'g-civic',
    name: 'Civic Network',
    all_tags: [],
    any_tags: ['ONA board', 'Riverside Compass partner', 'District 4 contact', 'Lakeside County'],
    none_tags: [],
    created_at: now,
    updated_at: now,
  },
  {
    id: 'g-civic-non-gov',
    name: 'Civic — outside government',
    all_tags: [],
    any_tags: ['ONA board', 'Riverside Compass partner'],
    none_tags: ['Lakeside County'],
    created_at: now,
    updated_at: now,
  },
]

// Personal habits for the demo member (m-1) — a full, lived-in board covering
// all three polarities, binary + count measures, weekday scheduling, an
// abstinence ("days free") habit, plain trackers, and an archived one. Entries
// run ~6 weeks back so the history strip is full and 30-day stats are real;
// a deterministic wobble keeps them from looking robotic.
const habitBase = { member_id: 'm-1', created_at: daysAgo(42), updated_at: now }
export const demoHabits = [
  {
    ...habitBase,
    id: 'h-workout',
    name: 'Workouts',
    icon: '🏋️',
    polarity: 'build',
    measure: 'count',
    unit: 'sessions',
    target: 1,
    track_streak: true,
    active_days: [1, 3, 5], // Mon / Wed / Fri
    color: '#34c759',
    show_on_today: true,
  },
  {
    ...habitBase,
    id: 'h-water',
    name: 'Water',
    icon: '💧',
    polarity: 'build',
    measure: 'count',
    unit: 'glasses',
    target: 8,
    track_streak: true,
    active_days: [],
    color: '#0a84ff',
    show_on_today: true,
  },
  {
    ...habitBase,
    id: 'h-steps',
    name: 'Walk 8k steps',
    polarity: 'build',
    measure: 'count',
    unit: 'steps',
    target: 8000,
    track_streak: true,
    active_days: [],
    color: '#30d158',
  },
  {
    ...habitBase,
    id: 'h-run',
    name: 'Run',
    polarity: 'build',
    measure: 'binary',
    target: 1,
    track_streak: true,
    weekly_target: 3, // 3× per week, any days
    active_days: [],
    color: '#ff6b35',
    show_on_today: true,
  },
  {
    ...habitBase,
    id: 'h-read',
    name: 'Read 10 pages',
    icon: '📖',
    polarity: 'build',
    measure: 'binary',
    target: 1,
    track_streak: true,
    active_days: [],
    color: '#bf5af2',
  },
  {
    ...habitBase,
    id: 'h-meditate',
    name: 'Meditate',
    icon: '🧘',
    polarity: 'build',
    measure: 'binary',
    target: 1,
    track_streak: true,
    active_days: [],
    color: '#5e5ce6',
    show_on_today: true,
  },
  {
    ...habitBase,
    id: 'h-stretch',
    name: 'Stretch',
    polarity: 'build',
    measure: 'binary',
    target: 1,
    track_streak: true,
    active_days: [1, 2, 3, 4, 5], // weekdays
    color: '#64d2ff',
  },
  {
    ...habitBase,
    id: 'h-drinks',
    name: 'Drinks',
    polarity: 'limit',
    measure: 'count',
    unit: 'drinks',
    target: 2,
    track_streak: true,
    active_days: [],
    color: '#ff9f0a',
    show_on_today: true,
  },
  {
    ...habitBase,
    id: 'h-sugar',
    name: 'Sweets',
    polarity: 'limit',
    measure: 'count',
    unit: 'treats',
    target: 1,
    track_streak: true,
    active_days: [],
    color: '#ff6482',
  },
  {
    ...habitBase,
    id: 'h-screen',
    name: 'Screen time',
    polarity: 'limit',
    measure: 'count',
    unit: 'hrs',
    target: 3,
    track_streak: true,
    active_days: [],
    color: '#ac8e68',
  },
  {
    // Abstinence: no entries needed — every clean day is a success, so the
    // streak runs from created_at. 26 days "alcohol-free".
    ...habitBase,
    id: 'h-nosmoke',
    name: 'Alcohol-free',
    polarity: 'limit',
    measure: 'binary',
    target: 0,
    track_streak: true,
    active_days: [],
    color: '#ff375f',
    created_at: daysAgo(26),
  },
  {
    ...habitBase,
    id: 'h-weight',
    name: 'Weight',
    polarity: 'track',
    measure: 'count',
    unit: 'lbs',
    target: null,
    track_streak: false,
    active_days: [],
    color: '#8e8e93',
  },
  {
    ...habitBase,
    id: 'h-mood',
    name: 'Mood (1–5)',
    polarity: 'track',
    measure: 'count',
    target: null,
    track_streak: false,
    active_days: [],
    color: '#ffd60a',
  },
  {
    // Archived — demonstrates the "Show archived" section.
    ...habitBase,
    id: 'h-floss',
    name: 'Floss',
    polarity: 'build',
    measure: 'binary',
    target: 1,
    track_streak: true,
    active_days: [],
    color: '#bcbcc0',
    archived_at: daysAgo(8),
  },
  // Partner's habits, shared with the household → show read-only in "Shared
  // with you". Owned by m-2 so they don't mix into the demo member's own list.
  {
    member_id: 'm-2',
    created_at: daysAgo(35),
    updated_at: now,
    id: 'h-partner-run',
    name: 'Morning Run',
    icon: '🏃',
    polarity: 'build',
    measure: 'binary',
    target: 1,
    track_streak: true,
    weekly_target: 4,
    active_days: [],
    color: '#ff6b35',
    shared: true,
  },
  {
    member_id: 'm-2',
    created_at: daysAgo(35),
    updated_at: now,
    id: 'h-partner-water',
    name: 'Drink More Water',
    icon: '💧',
    polarity: 'build',
    measure: 'count',
    unit: 'glasses',
    target: 8,
    track_streak: true,
    active_days: [],
    color: '#0a84ff',
    shared: true,
  },
]

export const demoHabitEntries = [
  ...habitDays('h-workout', 45, () => 1), // every scheduled M/W/F hit
  ...habitDays('h-water', 42, (i) => (i === 0 ? 5 : i % 11 === 0 ? 4 : 8)), // today in progress
  ...habitDays('h-steps', 42, (i) => 6200 + ((i * 1373) % 6200)), // 6.2k–12.4k, ~half hit goal
  ...habitDays('h-read', 40, (i) => (i === 2 || i === 14 ? 0 : 1)),
  ...habitDays('h-meditate', 42, (i) => (i % 7 === 3 ? 0 : 1)), // a weekly slip
  ...habitDays('h-stretch', 40, (i) => (i % 5 === 0 ? 0 : 1)),
  ...habitDays('h-drinks', 42, (i) => (i === 9 ? 3 : i % 6 === 0 ? 0 : i % 4 === 0 ? 2 : 1)), // one slip 9 days ago
  ...habitDays('h-sugar', 40, (i) => (i % 5 === 0 ? 2 : i % 2 === 0 ? 0 : 1)),
  ...habitDays('h-screen', 40, (i) => 1 + ((i * 7) % 5)), // 1–5 hrs, some over the 3h cap
  ...habitDays('h-weight', 45, (i) => Math.round((178 - (45 - i) * 0.08) * 10) / 10),
  ...habitDays('h-mood', 40, (i) => 3 + ((i * 3) % 3)), // 3–5
  // Weekly "Run" — runs land ~3×/week (Mon/Wed/Sat-ish across the window).
  ...habitDays('h-run', 28, (i) =>
    [1, 3, 6, 8, 10, 13, 15, 17, 20, 22, 24, 27].includes(i) ? 1 : 0,
  ),
  // A logged rest day on Read 5 days ago (overrides that day's entry above).
  { id: 'he-read-rest', habit_id: 'h-read', date: isoDay(5), value: 0, skipped: true },
  // A note on a workout day, to show per-entry notes + the heatmap marker.
  {
    id: 'he-workout-note',
    habit_id: 'h-workout',
    date: isoDay(7),
    value: 1,
    note: 'New deadlift PR 💪',
  },
  // A 4-day vacation on Stretch (a long-weekend trip), rested so the streak is
  // protected — shows as hatched rest days on the heatmap (overrides above).
  ...[12, 13, 14, 15].map((i) => ({
    id: `he-stretch-vac-${i}`,
    habit_id: 'h-stretch',
    date: isoDay(i),
    value: 0,
    skipped: true,
  })),
  // Partner's shared-habit history, so their streaks render in "Shared with you".
  ...habitDays('h-partner-run', 35, (i) =>
    [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25, 28, 30, 32].includes(i) ? 1 : 0,
  ),
  ...habitDays('h-partner-water', 35, (i) => (i % 9 === 0 ? 5 : 8)),
]

export const demoRelationships = [
  {
    id: 'r1',
    person_a_id: 'p-elena',
    person_b_id: 'p-maria',
    relationship_type: 'works_with',
    notes: 'Both at Riverside Compass',
    created_at: now,
  },
  {
    id: 'r2',
    person_a_id: 'p-rita',
    person_b_id: 'p-jack',
    relationship_type: 'works_with',
    notes: 'ONA board',
    created_at: now,
  },
  {
    id: 'r3',
    person_a_id: 'p-sam',
    person_b_id: 'p-lupe',
    relationship_type: 'knows',
    notes: 'Both Lakeside County',
    created_at: now,
  },
  {
    id: 'r4',
    person_a_id: 'p-david',
    person_b_id: 'p-priya',
    relationship_type: 'knows',
    notes: 'Met at materials conference',
    created_at: now,
  },
  {
    id: 'r5',
    person_a_id: 'p-elena',
    person_b_id: 'p-rita',
    relationship_type: 'connected_to',
    notes: 'Coalition meeting intro',
    created_at: now,
  },
  {
    id: 'r6',
    person_a_id: 'p-sam',
    person_b_id: 'p-rita',
    relationship_type: 'knows',
    notes: 'District 4 liaison to ONA',
    created_at: now,
  },
  {
    id: 'r7',
    person_a_id: 'p-tom',
    person_b_id: 'p-david',
    relationship_type: 'knows',
    notes: 'Referred Tom to Summit Materials for testing',
    created_at: now,
  },
  {
    id: 'r8',
    person_a_id: 'p-elena',
    person_b_id: 'p-lupe',
    relationship_type: 'connected_to',
    notes: 'Workforce grant program',
    created_at: now,
  },
]

// Touchpoint history. Spread across time so cadence/overdue signals and the
// activity timelines look real. occurred_at drives "last contacted".
export const demoInteractions = [
  // Elena — cadence 90d, last touch ~20d ago → on track
  {
    id: 'i1',
    person_id: 'p-elena',
    type: 'meeting',
    occurred_at: daysAgo(52),
    note: 'Coffee at the corner café. Walked through the facility-tour idea for her cohort.',
    created_at: daysAgo(52),
  },
  {
    id: 'i2',
    person_id: 'p-elena',
    type: 'email',
    occurred_at: daysAgo(34),
    note: 'Sent tour dates + parking info.',
    created_at: daysAgo(34),
  },
  {
    id: 'i3',
    person_id: 'p-elena',
    type: 'call',
    occurred_at: daysAgo(20),
    note: 'Confirmed 12 attendees for the tour.',
    created_at: daysAgo(20),
  },
  // David — cadence 30d, last touch ~45d ago → overdue
  {
    id: 'i4',
    person_id: 'p-david',
    type: 'email',
    occurred_at: daysAgo(45),
    note: 'Quoted replacement polishing pads.',
    created_at: daysAgo(45),
  },
  {
    id: 'i5',
    person_id: 'p-david',
    type: 'call',
    occurred_at: daysAgo(78),
    note: 'Consumables question — looped in support.',
    created_at: daysAgo(78),
  },
  // Rita — cadence 90d, last touch ~120d ago → overdue
  {
    id: 'i6',
    person_id: 'p-rita',
    type: 'meeting',
    occurred_at: daysAgo(120),
    note: 'ONA board meeting — zoning discussion.',
    created_at: daysAgo(120),
  },
  // Priya — cadence 180d, last touch ~12d ago → on track
  {
    id: 'i7',
    person_id: 'p-priya',
    type: 'email',
    occurred_at: daysAgo(12),
    note: 'Internship pipeline — sent her the intake form.',
    created_at: daysAgo(12),
  },
  // Nina — cadence 180d, last touch ~210d ago → overdue (neighbor we should check on)
  {
    id: 'i8',
    person_id: 'p-nina',
    type: 'text',
    occurred_at: daysAgo(210),
    note: 'Thanked her for watching the house.',
    created_at: daysAgo(210),
  },
  // Sam — no cadence, but recent activity
  {
    id: 'i9',
    person_id: 'p-sam',
    type: 'call',
    occurred_at: daysAgo(6),
    note: 'Streetlight request for Maple St submitted.',
    created_at: daysAgo(6),
  },
  // Maria — no cadence
  {
    id: 'i10',
    person_id: 'p-maria',
    type: 'meeting',
    occurred_at: daysAgo(28),
    note: 'Volunteer event planning.',
    created_at: daysAgo(28),
  },
  // Tom — cadence 30d, NOTHING logged → "never contacted" signal
]

// Tasks: a weekly chore, a monthly-on-the-Nth bill (overdue), a first-Monday
// recurring chore, a dated to-do, a project with subtasks (one done →
// progress), an undated "someday", and a completed item.
const taskBase = {
  notes: '',
  privacy_level: 'family_shared',
  tags: [],
  due_time: null,
  due_kind: 'on',
  start_date: null,
  priority: 0,
  completed_at: null,
  created_at: now,
  updated_at: now,
}
const todayWeekday = new Date().getDay()
const yesterdayDom = new Date(Date.now() - 86400000).getDate()
const firstMondayRule = { freq: 'monthly', interval: 1, setpos: 1, weekday: 1, anchor: dateIn(0) }
export const demoTasks = [
  {
    ...taskBase,
    id: 't-trash',
    title: 'Take out trash & recycling',
    assignee: 'partner',
    tags: ['home'],
    due_date: dateIn(0),
    due_time: '20:00', // bins out by 8pm for the morning pickup
    recurrence: { freq: 'weekly', interval: 1, weekdays: [todayWeekday], anchor: dateIn(0) },
    parent_id: null,
  },
  {
    ...taskBase,
    id: 't-waterbill',
    title: 'Pay water bill',
    assignee: 'me',
    due_date: dateIn(-1),
    recurrence: { freq: 'monthly', interval: 1, monthday: yesterdayDom, anchor: dateIn(-1) },
    parent_id: null,
  },
  {
    ...taskBase,
    id: 't-smoke',
    title: 'Test smoke alarms',
    assignee: 'either',
    due_date: nextOccurrence(firstMondayRule, dateIn(0), { inclusive: true }),
    recurrence: firstMondayRule,
    parent_id: null,
  },
  {
    ...taskBase,
    id: 't-call-david',
    title: 'Call David about the polisher quote',
    assignee: 'me',
    tags: ['work', 'waiting on'],
    due_date: dateIn(-2),
    priority: 3, // high — he's waiting on us
    recurrence: null,
    parent_id: null,
    privacy_level: 'shared',
    notes: 'He asked about consumables pricing.',
  },
  // Deadlines, not appointments: do them whenever there's a gap, just not after
  // the date. The near one reaches Today (inside ANYTIME_DAYS); the far one
  // waits in the Tasks page's Anytime section until its week comes round.
  {
    ...taskBase,
    id: 't-registration',
    title: 'Renew the car registration',
    assignee: 'me',
    tags: ['admin'],
    due_date: dateIn(5),
    due_kind: 'by',
    recurrence: null,
    parent_id: null,
  },
  {
    ...taskBase,
    id: 't-gutters',
    title: 'Clear the gutters before the rain',
    assignee: 'either',
    tags: ['home'],
    due_date: dateIn(19),
    due_kind: 'by',
    recurrence: null,
    parent_id: null,
  },
  {
    ...taskBase,
    id: 't-nina-bday',
    title: "Plan Nina's birthday gift",
    assignee: 'either',
    tags: ['gifts'],
    start_date: dateIn(3), // deferred — surfaces in 3 days, hidden from Today until then
    due_date: dateIn(7),
    recurrence: null,
    parent_id: null,
  },
  {
    ...taskBase,
    id: 't-faucet',
    title: 'Fix the leaky bathroom faucet',
    assignee: 'me',
    due_date: dateIn(3),
    recurrence: null,
    parent_id: null,
    is_project: true,
    notes: 'Master bath — drips overnight. Marco quoted $180 if we want him to do it.',
  },
  // headings group the subtasks that follow them (Things-style sections)
  {
    ...taskBase,
    id: 't-faucet-h1',
    title: 'Get parts',
    assignee: 'me',
    due_date: null,
    recurrence: null,
    parent_id: 't-faucet',
    is_heading: true,
    sort_order: 1,
  },
  {
    ...taskBase,
    id: 't-faucet-1',
    title: 'Buy replacement cartridge',
    assignee: 'me',
    due_date: null,
    recurrence: null,
    parent_id: 't-faucet',
    completed_at: daysAgo(1),
    sort_order: 2,
  },
  {
    ...taskBase,
    id: 't-faucet-h2',
    title: 'The fix',
    assignee: 'me',
    due_date: null,
    recurrence: null,
    parent_id: 't-faucet',
    is_heading: true,
    sort_order: 3,
  },
  {
    ...taskBase,
    id: 't-faucet-2',
    title: 'Shut off water supply',
    assignee: 'me',
    due_date: null,
    recurrence: null,
    parent_id: 't-faucet',
    sort_order: 4,
  },
  {
    ...taskBase,
    id: 't-faucet-3',
    title: 'Replace cartridge & test',
    assignee: 'me',
    due_date: null,
    recurrence: null,
    parent_id: 't-faucet',
    sort_order: 5,
  },
  {
    ...taskBase,
    id: 't-hvac',
    title: 'Schedule HVAC tune-up',
    assignee: 'either',
    due_date: null,
    recurrence: null,
    parent_id: null,
    privacy_level: 'shared',
  },
  {
    ...taskBase,
    id: 't-cards',
    title: 'Mail thank-you cards',
    assignee: 'either',
    due_date: null,
    recurrence: null,
    parent_id: null,
    completed_at: daysAgo(1),
  },
  // ── Projects ───────────────────────────────────────────────────────────
  // An ACTIVE project: a date range, a scoped packing list (l-trip below), a
  // linked travel companion, and one dated step that surfaces on Today with a
  // "↳ Italy trip" breadcrumb (the project itself never shows there).
  {
    ...taskBase,
    id: 't-trip',
    title: 'Italy trip',
    assignee: 'either',
    due_date: null,
    start_date: dateIn(20),
    end_date: dateIn(28),
    recurrence: null,
    parent_id: null,
    is_project: true,
    project_status: 'active',
    notes: 'Rome → Florence. Confirmation #s and the rental agreement live here.',
  },
  {
    ...taskBase,
    id: 't-trip-h1',
    title: 'Before you go',
    assignee: 'either',
    due_date: null,
    recurrence: null,
    parent_id: 't-trip',
    is_heading: true,
    sort_order: 1,
  },
  {
    ...taskBase,
    id: 't-trip-1',
    title: 'Confirm the rental car',
    assignee: 'me',
    due_date: dateIn(0), // today → shows on Today with the project breadcrumb
    recurrence: null,
    parent_id: 't-trip',
    sort_order: 2,
  },
  {
    ...taskBase,
    id: 't-trip-2',
    title: 'Refill prescriptions',
    assignee: 'partner',
    due_date: null,
    recurrence: null,
    parent_id: 't-trip',
    sort_order: 3,
  },
  // A SOMEDAY project — parked in the index's Someday bucket until you start it.
  {
    ...taskBase,
    id: 't-kitchen',
    title: 'Kitchen refresh',
    assignee: 'either',
    due_date: null,
    recurrence: null,
    parent_id: null,
    is_project: true,
    project_status: 'someday',
    notes: 'New backsplash + paint. Someday — gathering ideas.',
  },
  {
    ...taskBase,
    id: 't-kitchen-1',
    title: 'Collect paint swatches',
    assignee: 'either',
    due_date: null,
    recurrence: null,
    parent_id: 't-kitchen',
    sort_order: 1,
  },
]

// Shared household lists.
export const demoLists = [
  {
    id: 'l-grocery',
    name: 'Groceries',
    icon: '🛒',
    kind: 'grocery', // items auto-group into aisles
    privacy_level: 'family_shared',
    due_date: dateIn(0), // due today → shows in Today's Lists section
    reminder_enabled: false,
    reminder_time: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'l-hardware',
    name: 'Hardware store',
    icon: '🔧',
    privacy_level: 'family_shared',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'l-trip',
    name: 'Packing',
    icon: '🧳',
    privacy_level: 'family_shared',
    project_id: 't-trip', // scoped to the Italy trip project; still shows in Lists
    created_at: now,
    updated_at: now,
  },
]
export const demoListItems = [
  {
    id: 'li1',
    list_id: 'l-grocery',
    text: 'Coffee beans',
    qty: '2',
    note: 'dark roast',
    category: 'Beverages',
    assignee: 'm-1',
    checked_at: null,
    created_at: daysAgo(1),
  },
  {
    id: 'li2',
    list_id: 'l-grocery',
    text: 'Oat milk',
    note: 'the oat one, not soy',
    category: 'Dairy & Eggs',
    assignee: 'm-2',
    checked_at: null,
    created_at: daysAgo(1),
  },
  {
    id: 'li3',
    list_id: 'l-grocery',
    text: 'Eggs',
    category: 'Dairy & Eggs',
    checked_at: null,
    created_at: daysAgo(1),
  },
  {
    id: 'li4',
    list_id: 'l-grocery',
    text: 'Bananas',
    category: 'Produce',
    checked_at: daysAgo(0),
    created_at: daysAgo(2),
  },
  {
    id: 'li5',
    list_id: 'l-grocery',
    text: 'Dish soap',
    category: 'Household',
    checked_at: daysAgo(0),
    created_at: daysAgo(2),
  },
  {
    id: 'li6',
    list_id: 'l-hardware',
    text: 'Faucet cartridge',
    checked_at: null,
    created_at: daysAgo(1),
  },
  {
    id: 'li7',
    list_id: 'l-hardware',
    text: 'Furnace filter (16x25)',
    checked_at: null,
    created_at: daysAgo(1),
  },
  // Packing list, split into hand-made sections (is_heading rows; the items
  // after each in sort_order belong to it).
  {
    id: 'lh-clothes',
    list_id: 'l-trip',
    text: 'Clothes',
    is_heading: true,
    sort_order: 1,
    checked_at: null,
    created_at: daysAgo(3),
  },
  {
    id: 'li8',
    list_id: 'l-trip',
    text: 'Hiking boots',
    sort_order: 2,
    checked_at: null,
    created_at: daysAgo(3),
  },
  {
    id: 'lh-toiletries',
    list_id: 'l-trip',
    text: 'Toiletries',
    is_heading: true,
    sort_order: 3,
    checked_at: null,
    created_at: daysAgo(3),
  },
  {
    id: 'li9',
    list_id: 'l-trip',
    text: 'Sunscreen',
    sort_order: 4,
    checked_at: null,
    created_at: daysAgo(3),
  },
  {
    id: 'li10',
    list_id: 'l-trip',
    text: 'Phone charger',
    checked_at: daysAgo(0),
    created_at: daysAgo(3),
  },
]

// Notebook: a few sample notes. Bodies are sanitized HTML; @-mentions are chip
// spans (data-type/data-id) mirrored into `mentions` for entity-page backlinks.
const mentionChip = (type, id, label) =>
  `<span class="mention" data-type="${type}" data-id="${id}" contenteditable="false">@${label}</span>`
export const demoNotes = [
  {
    id: 'n-italy',
    title: 'Italy trip — planning',
    body:
      `<div>Notes for the Italy trip. Booked through ${mentionChip('organization', 'o-summit', 'Summit Travel Co.')}.</div>` +
      `<div><br></div>` +
      `<div>Ask ${mentionChip('person', 'p-elena', 'Elena Vasquez')} for the Florence restaurant list.</div>` +
      `<div>Everything else is tracked on ${mentionChip('project', 't-trip', 'Italy trip')} and ${mentionChip('list', 'l-trip', 'Packing')}.</div>` +
      `<ul><li>Confirm train Rome → Florence</li><li>Travel insurance</li><li>Notify bank of travel dates</li></ul>`,
    tags: ['travel', 'planning'],
    mentions: [
      { type: 'organization', id: 'o-summit' },
      { type: 'person', id: 'p-elena' },
      { type: 'project', id: 't-trip' },
      { type: 'list', id: 'l-trip' },
    ],
    privacy_level: 'shared',
    pinned: true,
    created_by: 'm-1',
    created_at: daysAgo(4),
    updated_at: daysAgo(1),
  },
  {
    id: 'n-civic',
    title: 'Neighborhood meeting',
    body:
      `<div>Recap from the ${mentionChip('group', 'g-civic', 'Civic Association')} meeting.</div>` +
      `<ul class="checklist"><li class="checklist-item" data-checked="true">Share minutes</li><li class="checklist-item" data-checked="false">Follow up with ${mentionChip('person', 'p-david', 'David Okafor')} re: budget</li></ul>`,
    tags: ['civic'],
    mentions: [
      { type: 'group', id: 'g-civic' },
      { type: 'person', id: 'p-david' },
    ],
    privacy_level: 'shared',
    pinned: false,
    created_by: 'm-1',
    created_at: daysAgo(6),
    updated_at: daysAgo(3),
  },
  {
    id: 'n-gift',
    title: 'Gift ideas',
    body: `<div>Birthday ideas for ${mentionChip('person', 'p-rita', 'Rita Hollis')} — she mentioned wanting a good kettle.</div>`,
    tags: ['gifts'],
    mentions: [{ type: 'person', id: 'p-rita' }],
    // Private: created by the partner (m-2), so it must NOT show for "me" (m-1).
    privacy_level: 'private',
    pinned: false,
    created_by: 'm-2',
    created_at: daysAgo(2),
    updated_at: daysAgo(2),
  },
]

// Completion history — past check-offs of the recurring chores, so "last done"
// + accountability has something to show.
export const demoCompletions = [
  {
    id: 'c1',
    task_id: 't-trash',
    completed_at: daysAgo(7),
    completed_by: 'partner',
    created_at: daysAgo(7),
  },
  {
    id: 'c2',
    task_id: 't-trash',
    completed_at: daysAgo(14),
    completed_by: 'partner',
    created_at: daysAgo(14),
  },
  {
    id: 'c3',
    task_id: 't-trash',
    completed_at: daysAgo(21),
    completed_by: 'me',
    created_at: daysAgo(21),
  },
  {
    id: 'c4',
    task_id: 't-waterbill',
    completed_at: daysAgo(31),
    completed_by: 'me',
    created_at: daysAgo(31),
  },
  {
    id: 'c5',
    task_id: 't-cards',
    completed_at: daysAgo(1),
    completed_by: null,
    created_at: daysAgo(1),
  },
]

// People/orgs attached to projects — the rolodex↔tasks bridge. The faucet
// project links the plumber we'd call and his company.
export const demoTaskLinks = [
  {
    id: 'tk1',
    task_id: 't-faucet',
    entity_type: 'person',
    entity_id: 'p-marco',
    role: 'plumber',
    created_at: now,
  },
  {
    id: 'tk2',
    task_id: 't-faucet',
    entity_type: 'organization',
    entity_id: 'o-reyes',
    role: 'contractor',
    created_at: now,
  },
  {
    id: 'tk3',
    task_id: 't-trip',
    entity_type: 'person',
    entity_id: 'p-maria',
    role: 'travel companion',
    created_at: now,
  },
]
