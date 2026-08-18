// Bringing an old JSON backup up to the current schema.
//
// A backup is a file on someone's disk, so it outlives the schema it was taken
// from — a restore has to cope with every shape the app has ever exported. That
// logic used to live inline in useData.restoreBackup, where it had grown to
// about 130 lines of accumulated history in the middle of a React hook and
// could only be exercised by running a real restore.
//
// It is pure data-in/data-out, so it lives here instead: each version bump is
// one named function in MIGRATIONS, applied in order, and adding the next one
// means appending to that array rather than reading the whole chain.
//
// Every migration is (tables, ctx) => tables and must tolerate a missing table
// — an old backup simply doesn't have the keys that were added after it.

// The set of tables a backup carries, and the order a restore upserts them in,
// both come from the one table registry — see lib/tables.js.
import { BACKUP_TABLES } from './tables'

// Tables carrying a privacy_level column, for the 0023 rename below.
const PRIVACY_TABLES = ['people', 'organizations', 'tasks', 'lists', 'notes']
// Tables carrying an area_id, for the area remap below.
const AREA_FILED_TABLES = ['tasks', 'lists', 'notes', 'habits']

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// Migration 0023 renamed the privacy enum's 'marc_only' to 'private'. A backup
// taken before it would fail against the renamed enum.
function renamePrivacyLabel(tables) {
  for (const t of PRIVACY_TABLES) {
    if (!Array.isArray(tables[t])) continue
    tables[t] = tables[t].map((row) =>
      row?.privacy_level === 'marc_only' ? { ...row, privacy_level: 'private' } : row,
    )
  }
  return tables
}

// Backups v<=6 stored people.organization as a name string. Map it to
// organization_id, find-or-creating orgs (seeded from both the backup's
// organizations and the current ones) so they restore as real rows.
function orgNameToId(tables, { orgs, stamp }) {
  if (!Array.isArray(tables.people)) return tables
  if (!tables.people.some((p) => p.organization && !p.organization_id)) return tables

  const incomingOrgs = Array.isArray(tables.organizations) ? tables.organizations : []
  const byName = new Map()
  for (const o of [...orgs, ...incomingOrgs]) {
    const k = (o.name || '').trim().toLowerCase()
    if (k && !byName.has(k)) byName.set(k, o)
  }
  const created = []
  const resolveOrg = (name) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return null
    const key = trimmed.toLowerCase()
    let o = byName.get(key)
    if (!o) {
      o = stamp({
        created_at: now(),
        updated_at: now(),
        key_contacts: [],
        name: trimmed,
        id: uuid(),
      })
      byName.set(key, o)
      created.push(o)
    }
    return o.id
  }
  tables.people = tables.people.map(({ organization, ...rest }) =>
    rest.organization_id ? rest : { ...rest, organization_id: resolveOrg(organization) },
  )
  if (created.length) tables.organizations = [...incomingOrgs, ...created]
  return tables
}

// Backups v<=9 attached the org as people.organization_id, with the title in
// people.role. Turn each into the affiliation row it became in 0033, and strip
// both fields off the person so the restore can't reintroduce the dropped
// column. Skipped when the backup already carries affiliations.
function orgIdToAffiliation(tables, { userId }) {
  if (!Array.isArray(tables.people) || Array.isArray(tables.affiliations)) return tables

  const migrated = []
  tables.people = tables.people.map(({ organization_id, ...rest }) => {
    if (!organization_id) return rest
    migrated.push({
      id: uuid(),
      person_id: rest.id,
      organization_id,
      role: (rest.role || '').trim() || null,
      is_primary: true,
      show_in_summary: null,
      started_on: null,
      ended_on: null,
      created_by: rest.created_by ?? userId,
      created_at: rest.created_at || now(),
      updated_at: now(),
    })
    return { ...rest, role: null }
  })
  if (migrated.length) tables.affiliations = migrated
  return tables
}

// Areas (v11) restore by id, so a backup taken from this household round-trips
// with every area_id still pointing at the right row and nothing to remap.
// Restoring into a DIFFERENT household is where it bites: areas carry a unique
// (household_id, created_by, lower(name)), so an incoming "Work" that collides
// with an existing "Work" would abort the whole restore on a constraint
// violation. Fold the incoming one into the existing row instead, and rewrite
// every area_id that referenced it — the same find-or-merge shape v7 uses for
// organizations, keyed on the constraint's own columns.
function foldCollidingAreas(tables, { areas }) {
  if (!Array.isArray(tables.areas) || !tables.areas.length) return tables

  const key = (a) => `${a.created_by || ''}|${(a.name || '').trim().toLowerCase()}`
  const existing = new Map(areas.map((a) => [key(a), a.id]))
  const remap = new Map()
  tables.areas = tables.areas.filter((a) => {
    const hit = existing.get(key(a))
    if (hit && hit !== a.id) {
      remap.set(a.id, hit)
      return false
    }
    return true
  })
  if (!remap.size) return tables

  for (const t of AREA_FILED_TABLES) {
    if (!Array.isArray(tables[t])) continue
    tables[t] = tables[t].map((row) =>
      row?.area_id && remap.has(row.area_id) ? { ...row, area_id: remap.get(row.area_id) } : row,
    )
  }
  return tables
}

// Oldest first. Each one takes the shape the previous left behind.
const MIGRATIONS = [renamePrivacyLabel, orgNameToId, orgIdToAffiliation, foldCollidingAreas]

// Bring `backup` up to the current schema, returning a plain
// { [table]: rows } object holding only the tables a restore knows about.
//
// ctx: { orgs, areas, userId, stamp } — the household's CURRENT organizations
// and areas (both needed to merge incoming rows against what's already here),
// the auth user id for rows that need an owner, and useData's household stamp.
export function migrateBackup(backup, ctx) {
  let tables = Object.fromEntries(BACKUP_TABLES.map((t) => [t, backup?.[t]]))
  for (const migrate of MIGRATIONS) tables = migrate(tables, ctx)
  return tables
}
