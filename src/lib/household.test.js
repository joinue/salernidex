import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeAssignee, assigneeLabel, assigneeOptions, members } from './household'

// household.js reads localStorage; stub it (node env has none) and seed a
// two-member household so the legacy assignee mapping is exercised.
beforeEach(() => {
  const store = {}
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  }
  localStorage.setItem('salernidex-household', JSON.stringify({
    name: 'Test', join_code: 'ABC-DEF', current_member_id: 'm-1',
    members: [{ id: 'm-1', name: 'Marc' }, { id: 'm-2', name: 'Rita' }],
  }))
})

describe('normalizeAssignee — the stored-id contract', () => {
  it('maps the "anyone" sentinels', () => {
    expect(normalizeAssignee('anyone')).toBe('anyone')
    expect(normalizeAssignee('either')).toBe('anyone')
    expect(normalizeAssignee(null)).toBe('anyone')
    expect(normalizeAssignee(undefined)).toBe('anyone')
  })
  it('maps legacy me/partner to the first two member ids', () => {
    expect(normalizeAssignee('me')).toBe('m-1')
    expect(normalizeAssignee('partner')).toBe('m-2')
  })
  it('passes a real member id straight through', () => {
    expect(normalizeAssignee('m-2')).toBe('m-2')
  })
})

describe('assigneeLabel / options', () => {
  it('labels ids by member name, anyone as Anyone', () => {
    expect(assigneeLabel('anyone')).toBe('Anyone')
    expect(assigneeLabel('m-1')).toBe('Marc')
    expect(assigneeLabel('me')).toBe('Marc') // legacy still resolves
    expect(assigneeLabel('ghost')).toBe('Anyone') // unknown id degrades safely
  })
  it('options lead with Anyone then members', () => {
    expect(assigneeOptions()).toEqual([
      { value: 'anyone', label: 'Anyone' },
      { value: 'm-1', label: 'Marc' },
      { value: 'm-2', label: 'Rita' },
    ])
    expect(members()).toHaveLength(2)
  })
})
