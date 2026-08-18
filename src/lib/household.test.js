import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  actorLabel,
  normalizeAssignee,
  assigneeLabel,
  assigneeOptions,
  defaultAssignee,
  members,
  newJoinCode,
} from './household'
import { normalizeJoinCode } from './joinCode'

// household.js reads localStorage; stub it (node env has none) and seed a
// two-member household so the legacy assignee mapping is exercised.
beforeEach(() => {
  const store = {}
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v)
    },
    removeItem: (k) => {
      delete store[k]
    },
  }
  localStorage.setItem(
    'salernidex-household',
    JSON.stringify({
      name: 'Test',
      join_code: 'ABC-DEF',
      current_member_id: 'm-1',
      members: [
        { id: 'm-1', name: 'Marc' },
        { id: 'm-2', name: 'Rita' },
      ],
    }),
  )
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
      { value: 'm-1', label: 'Marc', avatar_url: null },
      { value: 'm-2', label: 'Rita', avatar_url: null },
    ])
    expect(members()).toHaveLength(2)
  })
})

// actorLabel resolves "who did this?" across BOTH id spaces, because the
// columns disagree: created_by/checked_by hold an auth user id, completed_by
// holds a member id. Getting this wrong is what left list activity anonymous.
describe('actorLabel — who did it', () => {
  beforeEach(() => {
    localStorage.setItem(
      'salernidex-household',
      JSON.stringify({
        name: 'Test',
        join_code: 'ABC-DEF',
        current_member_id: 'm-1',
        members: [
          { id: 'm-1', name: 'Marc', user_id: 'auth-marc' },
          { id: 'm-2', name: 'Rita', user_id: 'auth-rita' },
        ],
      }),
    )
  })

  it('resolves an auth user id — the shape created_by/checked_by store', () => {
    expect(actorLabel('auth-rita')).toBe('Rita')
  })
  it('resolves a member id too — the shape completed_by and demo data store', () => {
    expect(actorLabel('m-2')).toBe('Rita')
  })
  it('returns null rather than "Anyone" when nobody did it', () => {
    // The distinction that matters: an unattributed action is not an action by
    // Anyone, so the caller omits the credit instead of printing a fiction.
    expect(actorLabel(null)).toBe(null)
    expect(actorLabel(undefined)).toBe(null)
    expect(actorLabel('auth-stranger')).toBe(null)
    expect(assigneeLabel('auth-stranger')).toBe('Anyone') // ...unlike assignment
  })
})

describe('defaultAssignee — who a new task starts out belonging to', () => {
  it('is the signed-in member once the household has more than one', () => {
    expect(defaultAssignee()).toBe('m-1')
  })
  it('follows "I\'m this" rather than the first member', () => {
    localStorage.setItem(
      'salernidex-household',
      JSON.stringify({
        name: 'Test',
        join_code: 'ABC-DEF',
        current_member_id: 'm-2',
        members: [
          { id: 'm-1', name: 'Marc' },
          { id: 'm-2', name: 'Rita' },
        ],
      }),
    )
    expect(defaultAssignee()).toBe('m-2')
  })
  it('stays "anyone" in a solo household — no one to distinguish from', () => {
    localStorage.setItem(
      'salernidex-household',
      JSON.stringify({
        name: 'Test',
        join_code: 'ABC-DEF',
        current_member_id: 'm-1',
        members: [{ id: 'm-1', name: 'Marc' }],
      }),
    )
    expect(defaultAssignee()).toBe('anyone')
  })
})

// The join code is the only credential guarding a household — join_household()
// admits whoever presents it. These assert the properties that make it one.
describe('newJoinCode', () => {
  const raw = () => normalizeJoinCode(newJoinCode())

  it('is 12 chars, matching the DB default’s strength', () => {
    expect(raw()).toHaveLength(12)
  })

  it('uses only the ambiguity-free alphabet (no O/0, I/1, L)', () => {
    const codes = Array.from({ length: 500 }, raw).join('')
    expect(codes).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })

  it('formats in hyphenated groups of three', () => {
    expect(newJoinCode()).toMatch(/^[A-Z2-9]{3}(-[A-Z2-9]{3}){3}$/)
  })

  it('does not repeat across a large sample', () => {
    const n = 5000
    expect(new Set(Array.from({ length: n }, raw)).size).toBe(n)
  })

  // Guards the actual regression: the old generator drew 6 chars from
  // Math.random(). If someone swaps the CSPRNG back out, entropy collapses
  // quietly and nothing else in the suite would notice.
  it('draws from the CSPRNG, not Math.random()', () => {
    const spy = vi.spyOn(Math, 'random')
    newJoinCode()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
