import { isConfigured } from './supabase'
import { nextOccurrence } from './recurrence'

// Demo mode: active whenever Supabase isn't configured (or forced via
// VITE_DEMO=true). Everything runs in-memory with sample data — nothing
// is saved between reloads.
export const demoMode = !isConfigured || import.meta.env.VITE_DEMO === 'true'

const now = new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const pad = (n) => String(n).padStart(2, '0')
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
const base = { deleted_at: null, created_at: now, updated_at: now, privacy_level: 'shared', birthday: null, address: '', keep_in_touch_days: null, tier: null, family_id: null, created_by: 'm-1' }

export const demoPeople = [
  {
    ...base,
    id: 'p-elena',
    tier: 'close',
    keep_in_touch_days: 90,
    name: 'Elena Vasquez',
    organization: 'Tucson Compass',
    role: 'Program Director',
    email: 'elena@tucsoncompass.org',
    phone: '(520) 555-0142',
    birthday: '1984-03-14',
    address: '2240 E Broadway Blvd, Tucson, AZ 85719',
    tags: ['Tucson Compass partner'],
    notes: 'Runs the workforce navigation program. Prefers email; responds fast. Interested in a PACE facility tour for her cohort.',
  },
  {
    ...base,
    created_by: 'm-2', // added by partner — only they can permanently delete
    id: 'p-david',
    tier: 'network',
    keep_in_touch_days: 30,
    name: 'David Chen',
    organization: 'Desert Materials Lab',
    role: 'Metallography Lab Manager',
    email: 'dchen@desertmaterials.com',
    phone: '(520) 555-0177',
    tags: ['PACE customer'],
    notes: 'Bought a grinder/polisher line in 2025. Asks detailed consumables questions — loop in support early.',
  },
  {
    ...base,
    id: 'p-rita',
    tier: 'close',
    keep_in_touch_days: 90,
    name: 'Rita Delgado',
    organization: 'Midtown Neighborhood Association',
    role: 'Board President',
    email: 'rita.delgado@midtownna.org',
    phone: '(520) 555-0118',
    birthday: '1962-11-02',
    tags: ['MNA board'],
    notes: 'Leads the monthly board meeting, first Tuesdays. Strong on zoning issues.',
  },
  {
    ...base,
    id: 'p-sam',
    name: 'Sam Whitfield',
    organization: 'Pima County',
    role: 'Ward 6 Council Aide',
    email: 'sam.whitfield@pima.gov',
    phone: '(520) 555-0163',
    tags: ['Ward 6 contact', 'Pima County'],
    notes: 'Go-to for constituent services and street/lighting requests. Met at the Ward 6 open house.',
  },
  {
    ...base,
    created_by: 'm-2', // added by partner — only they can permanently delete
    id: 'p-priya',
    keep_in_touch_days: 180,
    name: 'Priya Natarajan',
    organization: 'University of Arizona',
    role: 'Materials Science Professor',
    email: 'priyan@arizona.edu',
    phone: '(520) 555-0190',
    tags: ['PACE customer', 'UA'],
    notes: 'Teaching lab uses PACE equipment. Potential student internship pipeline.',
  },
  {
    ...base,
    id: 'p-tom',
    tier: 'network',
    keep_in_touch_days: 30,
    name: 'Tom Garrity',
    organization: 'Garrity & Sons Machining',
    role: 'Owner',
    email: 'tom@garritymachining.com',
    phone: '(520) 555-0125',
    tags: ['PACE customer'],
    notes: 'Small shop, long-time customer. Calls rather than emails.',
  },
  {
    ...base,
    id: 'p-maria',
    name: 'Maria Fuentes',
    organization: 'Tucson Compass',
    role: 'Volunteer Coordinator',
    email: 'maria@tucsoncompass.org',
    phone: '(520) 555-0151',
    tags: ['Tucson Compass partner'],
    notes: 'Coordinates volunteer events. Best reached Tue–Thu.',
  },
  {
    ...base,
    id: 'p-jack',
    name: 'Jack Osterman',
    organization: 'Midtown Neighborhood Association',
    role: 'Treasurer',
    email: 'jack.o@midtownna.org',
    phone: '(520) 555-0109',
    tags: ['MNA board'],
    notes: 'Handles dues and the annual budget. Retired accountant.',
  },
  {
    ...base,
    id: 'p-lupe',
    name: 'Lupe Ortiz',
    organization: 'Pima County',
    role: 'Economic Development Specialist',
    email: 'lupe.ortiz@pima.gov',
    phone: '(520) 555-0136',
    tags: ['Pima County'],
    notes: 'Point of contact for the small business incentive program.',
  },
  {
    ...base,
    id: 'p-nina',
    tier: 'inner',
    family_id: 'f-park',
    keep_in_touch_days: 180,
    name: 'Nina Park',
    organization: '',
    role: 'Neighbor',
    email: '',
    phone: '(520) 555-0171',
    birthday: soonBirthday,
    address: 'Two doors down — 1314 E 5th St',
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
    organization: 'Tucson Unified School District',
    role: 'Teacher',
    email: 'theo.park@tusd1.org',
    phone: '(520) 555-0172',
    birthday: '1988-09-30',
    address: 'Two doors down — 1314 E 5th St',
    tags: ['Neighbor'],
    privacy_level: 'family_shared',
    notes: "Nina's husband. Grills on Sundays — standing invite. Coaches Little League in spring.",
  },
  {
    ...base,
    id: 'p-marco',
    name: 'Marco Reyes',
    organization: 'Reyes Home Services',
    role: 'Plumber',
    email: 'marco@reyeshome.com',
    phone: '(520) 555-0188',
    tags: ['Contractor'],
    privacy_level: 'family_shared',
    notes: 'Did the water heater in 2024. Reliable, texts back fast.',
  },
]

export const demoOrgs = [
  {
    ...base,
    id: 'o-pace',
    name: 'PACE Technologies',
    type: 'Company',
    description: 'Metallographic equipment and consumables. Home base.',
    key_contacts: [],
    tags: ['work'],
  },
  {
    ...base,
    id: 'o-mna',
    name: 'Midtown Neighborhood Association',
    type: 'Community',
    description: 'Neighborhood association. Board meets first Tuesday of the month.',
    key_contacts: [],
    tags: ['civic'],
  },
  {
    ...base,
    id: 'o-compass',
    name: 'Tucson Compass',
    type: 'Nonprofit',
    description: 'Workforce navigation nonprofit; partnership on facility tours and internships.',
    key_contacts: [],
    tags: ['civic'],
  },
  {
    ...base,
    id: 'o-pima',
    name: 'Pima County',
    type: 'Government',
    description: 'County government contacts — Ward 6 and economic development.',
    key_contacts: [],
    tags: ['civic'],
  },
  {
    ...base,
    id: 'o-reyes',
    name: 'Reyes Home Services',
    type: 'Vendor',
    description: 'Plumbing & handyman work around the house. Marco is our guy.',
    key_contacts: [],
    tags: ['home'],
  },
]

// Contact family units (distinct from the household/tenant model).
export const demoFamilies = [
  { id: 'f-park', name: 'The Parks', notes: 'Neighbors at 1314 E 5th St.', created_at: now, updated_at: now },
]

// Dates that matter beyond birthdays, all inside the default 7-day heads-up
// window so the Today "Dates" merge always demos. Rita's retirement party is
// a one-off.
const annivDate = (() => {
  const d = new Date(Date.now() + 6 * 86400000)
  return `2015-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()
export const demoKeyDates = [
  { id: 'kd-park-anniv', person_id: 'p-nina', label: 'Wedding anniversary', date: annivDate, annual: true, created_at: now },
  { id: 'kd-rita-retire', person_id: 'p-rita', label: 'Retirement party', date: dateIn(2), annual: false, created_at: now },
]

export const demoGroups = [
  {
    id: 'g-pace',
    name: 'PACE Customers',
    all_tags: ['PACE customer'],
    any_tags: [],
    none_tags: [],
    created_at: now,
    updated_at: now,
  },
  {
    id: 'g-civic',
    name: 'Civic Network',
    all_tags: [],
    any_tags: ['MNA board', 'Tucson Compass partner', 'Ward 6 contact', 'Pima County'],
    none_tags: [],
    created_at: now,
    updated_at: now,
  },
  {
    id: 'g-civic-non-gov',
    name: 'Civic — outside government',
    all_tags: [],
    any_tags: ['MNA board', 'Tucson Compass partner'],
    none_tags: ['Pima County'],
    created_at: now,
    updated_at: now,
  },
]

export const demoRelationships = [
  { id: 'r1', person_a_id: 'p-elena', person_b_id: 'p-maria', relationship_type: 'works_with', notes: 'Both at Tucson Compass', created_at: now },
  { id: 'r2', person_a_id: 'p-rita', person_b_id: 'p-jack', relationship_type: 'works_with', notes: 'MNA board', created_at: now },
  { id: 'r3', person_a_id: 'p-sam', person_b_id: 'p-lupe', relationship_type: 'knows', notes: 'Both Pima County', created_at: now },
  { id: 'r4', person_a_id: 'p-david', person_b_id: 'p-priya', relationship_type: 'knows', notes: 'Met at materials conference', created_at: now },
  { id: 'r5', person_a_id: 'p-elena', person_b_id: 'p-rita', relationship_type: 'connected_to', notes: 'Coalition meeting intro', created_at: now },
  { id: 'r6', person_a_id: 'p-sam', person_b_id: 'p-rita', relationship_type: 'knows', notes: 'Ward 6 liaison to MNA', created_at: now },
  { id: 'r7', person_a_id: 'p-tom', person_b_id: 'p-david', relationship_type: 'knows', notes: 'Referred Tom to Desert Materials for testing', created_at: now },
  { id: 'r8', person_a_id: 'p-elena', person_b_id: 'p-lupe', relationship_type: 'connected_to', notes: 'Workforce grant program', created_at: now },
]

// Touchpoint history. Spread across time so cadence/overdue signals and the
// activity timelines look real. occurred_at drives "last contacted".
export const demoInteractions = [
  // Elena — cadence 90d, last touch ~20d ago → on track
  { id: 'i1', person_id: 'p-elena', type: 'meeting', occurred_at: daysAgo(52), note: 'Coffee at Exo. Walked through the facility-tour idea for her cohort.', created_at: daysAgo(52) },
  { id: 'i2', person_id: 'p-elena', type: 'email', occurred_at: daysAgo(34), note: 'Sent tour dates + parking info.', created_at: daysAgo(34) },
  { id: 'i3', person_id: 'p-elena', type: 'call', occurred_at: daysAgo(20), note: 'Confirmed 12 attendees for the tour.', created_at: daysAgo(20) },
  // David — cadence 30d, last touch ~45d ago → overdue
  { id: 'i4', person_id: 'p-david', type: 'email', occurred_at: daysAgo(45), note: 'Quoted replacement polishing pads.', created_at: daysAgo(45) },
  { id: 'i5', person_id: 'p-david', type: 'call', occurred_at: daysAgo(78), note: 'Consumables question — looped in support.', created_at: daysAgo(78) },
  // Rita — cadence 90d, last touch ~120d ago → overdue
  { id: 'i6', person_id: 'p-rita', type: 'meeting', occurred_at: daysAgo(120), note: 'MNA board meeting — zoning discussion.', created_at: daysAgo(120) },
  // Priya — cadence 180d, last touch ~12d ago → on track
  { id: 'i7', person_id: 'p-priya', type: 'email', occurred_at: daysAgo(12), note: 'Internship pipeline — sent her the intake form.', created_at: daysAgo(12) },
  // Nina — cadence 180d, last touch ~210d ago → overdue (neighbor we should check on)
  { id: 'i8', person_id: 'p-nina', type: 'text', occurred_at: daysAgo(210), note: 'Thanked her for watching the house.', created_at: daysAgo(210) },
  // Sam — no cadence, but recent activity
  { id: 'i9', person_id: 'p-sam', type: 'call', occurred_at: daysAgo(6), note: 'Streetlight request for 5th St submitted.', created_at: daysAgo(6) },
  // Maria — no cadence
  { id: 'i10', person_id: 'p-maria', type: 'meeting', occurred_at: daysAgo(28), note: 'Volunteer event planning.', created_at: daysAgo(28) },
  // Tom — cadence 30d, NOTHING logged → "never contacted" signal
]

// Tasks: a weekly chore, a monthly-on-the-Nth bill (overdue), a first-Monday
// recurring chore, a dated to-do, a project with subtasks (one done →
// progress), an undated "someday", and a completed item.
const taskBase = { notes: '', privacy_level: 'family_shared', completed_at: null, created_at: now, updated_at: now }
const todayWeekday = new Date().getDay()
const yesterdayDom = new Date(Date.now() - 86400000).getDate()
const firstMondayRule = { freq: 'monthly', interval: 1, setpos: 1, weekday: 1, anchor: dateIn(0) }
export const demoTasks = [
  { ...taskBase, id: 't-trash', title: 'Take out trash & recycling', assignee: 'partner', due_date: dateIn(0), recurrence: { freq: 'weekly', interval: 1, weekdays: [todayWeekday], anchor: dateIn(0) }, parent_id: null },
  { ...taskBase, id: 't-waterbill', title: 'Pay water bill', assignee: 'me', due_date: dateIn(-1), recurrence: { freq: 'monthly', interval: 1, monthday: yesterdayDom, anchor: dateIn(-1) }, parent_id: null },
  { ...taskBase, id: 't-smoke', title: 'Test smoke alarms', assignee: 'either', due_date: nextOccurrence(firstMondayRule, dateIn(0), { inclusive: true }), recurrence: firstMondayRule, parent_id: null },
  { ...taskBase, id: 't-call-david', title: 'Call David about the polisher quote', assignee: 'me', due_date: dateIn(-2), recurrence: null, parent_id: null, privacy_level: 'shared', notes: 'He asked about consumables pricing.' },
  { ...taskBase, id: 't-nina-bday', title: "Plan Nina's birthday gift", assignee: 'either', due_date: dateIn(7), recurrence: null, parent_id: null },
  { ...taskBase, id: 't-faucet', title: 'Fix the leaky bathroom faucet', assignee: 'me', due_date: dateIn(3), recurrence: null, parent_id: null, is_project: true, notes: 'Master bath — drips overnight. Marco quoted $180 if we want him to do it.' },
  { ...taskBase, id: 't-faucet-1', title: 'Buy replacement cartridge', assignee: 'me', due_date: null, recurrence: null, parent_id: 't-faucet', completed_at: daysAgo(1) },
  { ...taskBase, id: 't-faucet-2', title: 'Shut off water supply', assignee: 'me', due_date: null, recurrence: null, parent_id: 't-faucet' },
  { ...taskBase, id: 't-faucet-3', title: 'Replace cartridge & test', assignee: 'me', due_date: null, recurrence: null, parent_id: 't-faucet' },
  { ...taskBase, id: 't-hvac', title: 'Schedule HVAC tune-up', assignee: 'either', due_date: null, recurrence: null, parent_id: null, privacy_level: 'shared' },
  { ...taskBase, id: 't-cards', title: 'Mail thank-you cards', assignee: 'either', due_date: null, recurrence: null, parent_id: null, completed_at: daysAgo(1) },
]

// Shared household lists.
export const demoLists = [
  { id: 'l-grocery', name: 'Groceries', icon: '🛒', privacy_level: 'family_shared', created_at: now, updated_at: now },
  { id: 'l-hardware', name: 'Hardware store', icon: '🔧', privacy_level: 'family_shared', created_at: now, updated_at: now },
  { id: 'l-trip', name: 'Packing — Sedona trip', icon: '🧳', privacy_level: 'family_shared', created_at: now, updated_at: now },
]
export const demoListItems = [
  { id: 'li1', list_id: 'l-grocery', text: 'Coffee beans', checked_at: null, created_at: daysAgo(1) },
  { id: 'li2', list_id: 'l-grocery', text: 'Oat milk', checked_at: null, created_at: daysAgo(1) },
  { id: 'li3', list_id: 'l-grocery', text: 'Eggs', checked_at: null, created_at: daysAgo(1) },
  { id: 'li4', list_id: 'l-grocery', text: 'Bananas', checked_at: daysAgo(0), created_at: daysAgo(2) },
  { id: 'li5', list_id: 'l-grocery', text: 'Dish soap', checked_at: daysAgo(0), created_at: daysAgo(2) },
  { id: 'li6', list_id: 'l-hardware', text: 'Faucet cartridge', checked_at: null, created_at: daysAgo(1) },
  { id: 'li7', list_id: 'l-hardware', text: 'Furnace filter (16x25)', checked_at: null, created_at: daysAgo(1) },
  { id: 'li8', list_id: 'l-trip', text: 'Hiking boots', checked_at: null, created_at: daysAgo(3) },
  { id: 'li9', list_id: 'l-trip', text: 'Sunscreen', checked_at: null, created_at: daysAgo(3) },
  { id: 'li10', list_id: 'l-trip', text: 'Phone charger', checked_at: daysAgo(0), created_at: daysAgo(3) },
]

// Completion history — past check-offs of the recurring chores, so "last done"
// + accountability has something to show.
export const demoCompletions = [
  { id: 'c1', task_id: 't-trash', completed_at: daysAgo(7), completed_by: 'partner', created_at: daysAgo(7) },
  { id: 'c2', task_id: 't-trash', completed_at: daysAgo(14), completed_by: 'partner', created_at: daysAgo(14) },
  { id: 'c3', task_id: 't-trash', completed_at: daysAgo(21), completed_by: 'me', created_at: daysAgo(21) },
  { id: 'c4', task_id: 't-waterbill', completed_at: daysAgo(31), completed_by: 'me', created_at: daysAgo(31) },
  { id: 'c5', task_id: 't-cards', completed_at: daysAgo(1), completed_by: null, created_at: daysAgo(1) },
]

// People/orgs attached to projects — the rolodex↔tasks bridge. The faucet
// project links the plumber we'd call and his company.
export const demoTaskLinks = [
  { id: 'tk1', task_id: 't-faucet', entity_type: 'person', entity_id: 'p-marco', role: 'plumber', created_at: now },
  { id: 'tk2', task_id: 't-faucet', entity_type: 'organization', entity_id: 'o-reyes', role: 'contractor', created_at: now },
]
