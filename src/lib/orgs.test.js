import { describe, it, expect } from 'vitest'
import { orgNameTaken } from './orgs'

const orgs = [{ id: '1', name: 'Acme' }, { id: '2', name: 'Globex' }]

describe('orgNameTaken', () => {
  it('matches case- and space-insensitively', () => {
    expect(orgNameTaken('acme', orgs)).toBe(true)
    expect(orgNameTaken('  ACME ', orgs)).toBe(true)
    expect(orgNameTaken('Initech', orgs)).toBe(false)
  })
  it('ignores the record being edited', () => {
    expect(orgNameTaken('Acme', orgs, '1')).toBe(false) // editing Acme itself
    expect(orgNameTaken('Acme', orgs, '2')).toBe(true) // renaming Globex → Acme collides
  })
  it('an empty name is never "taken"', () => {
    expect(orgNameTaken('', orgs)).toBe(false)
    expect(orgNameTaken('   ', orgs)).toBe(false)
  })
})
