import { describe, it, expect } from 'vitest'
import { normalizeJoinCode, formatJoinCode } from './joinCode'

describe('normalizeJoinCode', () => {
  it('uppercases and strips separators so typed == pasted == stored', () => {
    expect(normalizeJoinCode('a3f9c20b')).toBe('A3F9C20B')
    expect(normalizeJoinCode('ABC-DEF')).toBe('ABCDEF')
    expect(normalizeJoinCode('abc def')).toBe('ABCDEF')
    expect(normalizeJoinCode(' A3F9-C20B ')).toBe('A3F9C20B')
  })
  it('the lowercase-hex default and a phone-typed (auto-capitalized) copy normalize equal', () => {
    expect(normalizeJoinCode('a3f9c20b1e4d')).toBe(normalizeJoinCode('A3F9C20B1E4D'))
  })
  it('is safe on empty/nullish', () => {
    expect(normalizeJoinCode('')).toBe('')
    expect(normalizeJoinCode(null)).toBe('')
    expect(normalizeJoinCode(undefined)).toBe('')
  })
})

describe('formatJoinCode', () => {
  it('groups in threes for readable sharing', () => {
    expect(formatJoinCode('abcdef')).toBe('ABC-DEF')
    expect(formatJoinCode('a3f9c20b')).toBe('A3F-9C2-0B')
  })
})
