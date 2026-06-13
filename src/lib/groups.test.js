import { describe, it, expect } from 'vitest'
import { personMatchesGroup, groupMembers, groupJoinTags, describeGroup } from './groups'

const person = (tags, extra = {}) => ({ tags, ...extra })

describe('personMatchesGroup', () => {
  it('requires ALL of all_tags', () => {
    const g = { all_tags: ['a', 'b'] }
    expect(personMatchesGroup(g, person(['a', 'b', 'c']))).toBe(true)
    expect(personMatchesGroup(g, person(['a']))).toBe(false)
  })
  it('requires at least ONE of any_tags when present', () => {
    const g = { all_tags: ['a'], any_tags: ['x', 'y'] }
    expect(personMatchesGroup(g, person(['a', 'x']))).toBe(true)
    expect(personMatchesGroup(g, person(['a']))).toBe(false)
  })
  it('excludes on ANY none_tags', () => {
    const g = { all_tags: ['a'], none_tags: ['z'] }
    expect(personMatchesGroup(g, person(['a']))).toBe(true)
    expect(personMatchesGroup(g, person(['a', 'z']))).toBe(false)
  })
  it('a rules-less group matches everyone (incl. tagless)', () => {
    expect(personMatchesGroup({}, person([]))).toBe(true)
    expect(personMatchesGroup({}, person(undefined))).toBe(true)
  })
  it('manual groups match by member id, ignoring tags', () => {
    const g = { kind: 'manual', member_ids: ['1', '3'], all_tags: ['ignored'] }
    expect(personMatchesGroup(g, person([], { id: '1' }))).toBe(true)
    expect(personMatchesGroup(g, person(['ignored'], { id: '2' }))).toBe(false)
    expect(personMatchesGroup(g, person([], { id: '3' }))).toBe(true)
  })
})

describe('groupMembers', () => {
  it('returns matches and skips soft-deleted people', () => {
    const g = { all_tags: ['vip'] }
    const people = [
      person(['vip'], { id: '1' }),
      person(['vip'], { id: '2', deleted_at: '2026-01-01' }),
      person(['other'], { id: '3' }),
    ]
    expect(groupMembers(g, people).map((p) => p.id)).toEqual(['1'])
  })
})

describe('groupJoinTags', () => {
  it('returns all_tags plus the first any_tag', () => {
    expect(groupJoinTags({ all_tags: ['a', 'b'], any_tags: ['x', 'y'] })).toEqual(['a', 'b', 'x'])
  })
  it('is empty for a none-only (un-joinable) group', () => {
    expect(groupJoinTags({ none_tags: ['z'] })).toEqual([])
  })
  it('is empty for a manual group (joined on the group, not via tags)', () => {
    expect(groupJoinTags({ kind: 'manual', member_ids: ['1'], all_tags: ['a'] })).toEqual([])
  })
})

describe('describeGroup', () => {
  it('renders the rule, or a friendly empty', () => {
    expect(describeGroup({ all_tags: ['a', 'b'] })).toBe('a AND b')
    expect(describeGroup({})).toBe('No rules yet — matches everyone')
  })
  it('labels manual groups as hand-picked', () => {
    expect(describeGroup({ kind: 'manual', member_ids: ['1', '2'] })).toBe('Hand-picked')
  })
})
