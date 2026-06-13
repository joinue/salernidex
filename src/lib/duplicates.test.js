import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizePhone, normalizeName, findDuplicates } from './duplicates'

describe('normalizers', () => {
  it('email: trims + lowercases', () => {
    expect(normalizeEmail('  Marc@Example.COM ')).toBe('marc@example.com')
  })
  it('phone: collapses formatting and a US country code to the last 10 digits', () => {
    expect(normalizePhone('+1 (555) 010-2020')).toBe('5550102020')
    expect(normalizePhone('555-010-2020')).toBe('5550102020')
    expect(normalizePhone('15550102020')).toBe('5550102020')
    expect(normalizePhone('')).toBe('')
  })
  it('name: strips punctuation + case', () => {
    expect(normalizeName("J.R. O'Brien")).toBe('jr obrien')
    expect(normalizeName('JR OBrien')).toBe('jr obrien')
  })
})

describe('findDuplicates', () => {
  const people = [
    { id: '1', name: 'Marc Salerno', email: 'marc@x.com', phone: '555-111-2222' },
    { id: '2', name: 'Marc Salerno', email: 'other@x.com', phone: '999-000-1111' },
    { id: '3', name: 'Rita Park', email: '', phone: '' },
    { id: '4', name: 'Gone', email: 'marc@x.com', deleted_at: '2026-01-01' },
  ]
  it('flags a shared email as a STRONG match', () => {
    const m = findDuplicates({ name: 'Someone', email: 'MARC@x.com' }, people)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ person: { id: '1' }, confidence: 'strong' })
    expect(m[0].reasons).toContain('same email')
  })
  it('an identical name alone is only LIKELY', () => {
    const m = findDuplicates({ name: 'rita park' }, people)
    expect(m[0]).toMatchObject({ person: { id: '3' }, confidence: 'likely' })
  })
  it('sorts strong matches ahead of likely ones', () => {
    // shares phone with #1 (strong) and name with #2 (likely)
    const m = findDuplicates({ name: 'Marc Salerno', phone: '5551112222' }, people)
    expect(m.map((x) => x.confidence)).toEqual(['strong', 'likely'])
    expect(m[0].person.id).toBe('1')
  })
  it('ignores soft-deleted people and the record being edited', () => {
    expect(findDuplicates({ email: 'marc@x.com' }, people)).toHaveLength(1) // #4 excluded
    expect(findDuplicates({ email: 'marc@x.com' }, people, '1')).toHaveLength(0) // self excluded
  })
})
