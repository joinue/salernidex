import { describe, expect, it } from 'vitest'
import { migrateBackup } from './backupMigrations'
import { BACKUP_TABLES } from './tables'

// The household a backup is being restored INTO.
const ctx = (over = {}) => ({
  orgs: [],
  areas: [],
  userId: 'user-1',
  stamp: (row) => ({ ...row, household_id: 'hh-1' }),
  ...over,
})

describe('migrateBackup — shape', () => {
  it('returns every table a restore knows about, even from an empty backup', () => {
    const tables = migrateBackup({}, ctx())
    expect(Object.keys(tables).sort()).toEqual([...BACKUP_TABLES].sort())
  })

  it('tolerates a backup missing everything added after it was taken', () => {
    // A v3 backup: no notes, no areas, no habits, no affiliations.
    const tables = migrateBackup({ people: [{ id: 'p1', name: 'Ada' }] }, ctx())
    expect(tables.people).toHaveLength(1)
    expect(tables.notes).toBeUndefined()
    expect(tables.areas).toBeUndefined()
  })
})

describe('migrateBackup — privacy label (migration 0023)', () => {
  it("rewrites 'marc_only' to 'private' on every table that carries the column", () => {
    const tables = migrateBackup(
      {
        people: [{ id: 'p1', privacy_level: 'marc_only' }],
        tasks: [{ id: 't1', privacy_level: 'marc_only' }],
        notes: [{ id: 'n1', privacy_level: 'marc_only' }],
        lists: [{ id: 'l1', privacy_level: 'shared' }],
      },
      ctx(),
    )
    expect(tables.people[0].privacy_level).toBe('private')
    expect(tables.tasks[0].privacy_level).toBe('private')
    expect(tables.notes[0].privacy_level).toBe('private')
    // Anything already current is left exactly as it was.
    expect(tables.lists[0].privacy_level).toBe('shared')
  })
})

// These assert the END of the chain, not the middle: orgNameToId resolves the
// name to an id, and orgIdToAffiliation immediately turns that id into an
// affiliation row and strips it off the person. A v<=6 backup therefore comes
// out the far side shaped like a current one — organizations plus affiliations,
// and nothing org-shaped left on the person.
describe('migrateBackup — org name to id (backups v<=6)', () => {
  const orgIdFor = (tables, personId) =>
    tables.affiliations?.find((a) => a.person_id === personId)?.organization_id

  it('creates one org per distinct name, however many people share it', () => {
    const tables = migrateBackup(
      {
        people: [
          { id: 'p1', name: 'Ada', organization: 'Acme' },
          { id: 'p2', name: 'Grace', organization: 'acme' }, // same org, different case
          { id: 'p3', name: 'Alan', organization: 'Initech' },
        ],
      },
      ctx(),
    )
    expect(tables.organizations).toHaveLength(2)
    // Both Acme people end up linked to the same new row.
    expect(orgIdFor(tables, 'p1')).toBe(orgIdFor(tables, 'p2'))
    expect(orgIdFor(tables, 'p3')).not.toBe(orgIdFor(tables, 'p1'))
    // Neither the free-text column nor the FK survives on the person.
    expect(tables.people[0].organization).toBeUndefined()
    expect(tables.people[0].organization_id).toBeUndefined()
  })

  it('reuses an organization the household already has rather than duplicating it', () => {
    const tables = migrateBackup(
      { people: [{ id: 'p1', organization: 'ACME' }] },
      ctx({ orgs: [{ id: 'org-existing', name: 'Acme' }] }),
    )
    expect(orgIdFor(tables, 'p1')).toBe('org-existing')
    expect(tables.organizations ?? []).toHaveLength(0)
  })

  it('leaves a person with no organization unlinked', () => {
    const tables = migrateBackup({ people: [{ id: 'p1', organization: '  ' }] }, ctx())
    expect(tables.affiliations ?? []).toHaveLength(0)
    expect(tables.people[0].organization_id).toBeUndefined()
  })
})

describe('migrateBackup — org id to affiliation (backups v<=9)', () => {
  it('turns the org link and title into a primary affiliation', () => {
    const tables = migrateBackup(
      { people: [{ id: 'p1', name: 'Ada', organization_id: 'org-1', role: ' Engineer ' }] },
      ctx(),
    )
    expect(tables.affiliations).toHaveLength(1)
    expect(tables.affiliations[0]).toMatchObject({
      person_id: 'p1',
      organization_id: 'org-1',
      role: 'Engineer',
      is_primary: true,
      created_by: 'user-1',
    })
    // The title moved; leaving a copy behind is the two-homes-for-one-fact
    // problem migration 0033 exists to remove.
    expect(tables.people[0].role).toBeNull()
    expect(tables.people[0].organization_id).toBeUndefined()
  })

  it('leaves a backup that already carries affiliations untouched', () => {
    const affiliations = [{ id: 'a1', person_id: 'p1', organization_id: 'org-1' }]
    const tables = migrateBackup(
      { people: [{ id: 'p1', organization_id: 'org-1', role: 'Engineer' }], affiliations },
      ctx(),
    )
    expect(tables.affiliations).toBe(affiliations)
    expect(tables.people[0].role).toBe('Engineer')
  })
})

describe('migrateBackup — colliding areas (backups v11)', () => {
  it('folds an incoming area into the existing one and repoints what it held', () => {
    const mine = { id: 'area-mine', name: 'Work', created_by: 'user-1' }
    const tables = migrateBackup(
      {
        areas: [{ id: 'area-theirs', name: 'work', created_by: 'user-1' }],
        tasks: [{ id: 't1', area_id: 'area-theirs' }],
        notes: [{ id: 'n1', area_id: 'area-theirs' }],
        lists: [{ id: 'l1', area_id: null }],
      },
      ctx({ areas: [mine] }),
    )
    // The duplicate never gets inserted — the unique (household, creator, name)
    // constraint would have aborted the whole restore.
    expect(tables.areas).toHaveLength(0)
    // Everything filed under it now points at the area that survived.
    expect(tables.tasks[0].area_id).toBe('area-mine')
    expect(tables.notes[0].area_id).toBe('area-mine')
    expect(tables.lists[0].area_id).toBeNull()
  })

  it('keeps an area whose name nobody has taken', () => {
    const tables = migrateBackup(
      {
        areas: [{ id: 'area-theirs', name: 'Band', created_by: 'user-1' }],
        tasks: [{ id: 't1', area_id: 'area-theirs' }],
      },
      ctx({ areas: [{ id: 'area-mine', name: 'Work', created_by: 'user-1' }] }),
    )
    expect(tables.areas).toHaveLength(1)
    expect(tables.tasks[0].area_id).toBe('area-theirs')
  })

  it('treats the same name from a different creator as a different area', () => {
    // The constraint is (household_id, created_by, lower(name)) — two members
    // are each entitled to their own "Work".
    const tables = migrateBackup(
      { areas: [{ id: 'area-theirs', name: 'Work', created_by: 'user-2' }] },
      ctx({ areas: [{ id: 'area-mine', name: 'Work', created_by: 'user-1' }] }),
    )
    expect(tables.areas).toHaveLength(1)
    expect(tables.areas[0].id).toBe('area-theirs')
  })
})

describe('migrateBackup — the chain', () => {
  it('carries a v6-era backup all the way to the current shape in one pass', () => {
    // Old enough to need the org-name migration AND the affiliation one, which
    // only works if the second runs on what the first produced.
    const tables = migrateBackup(
      { people: [{ id: 'p1', name: 'Ada', organization: 'Acme', role: 'Engineer' }] },
      ctx(),
    )
    const orgId = tables.organizations[0].id
    expect(tables.affiliations).toHaveLength(1)
    expect(tables.affiliations[0]).toMatchObject({ person_id: 'p1', organization_id: orgId })
    expect(tables.people[0].role).toBeNull()
  })
})
