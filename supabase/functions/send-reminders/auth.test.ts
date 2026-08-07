import { describe, it, expect } from 'vitest'
import { isAuthorized, bearerToken, timingSafeEqual } from './auth.ts'

const CRON = 'cron-secret-value'
const SERVICE = 'service-role-key-value'

describe('bearerToken', () => {
  it('extracts a well-formed Bearer token', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123')
    expect(bearerToken('bearer abc123')).toBe('abc123') // scheme is case-insensitive
    expect(bearerToken('  Bearer   abc123  ')).toBe('abc123')
  })

  it('rejects anything that is not a lone Bearer credential', () => {
    expect(bearerToken(null)).toBe('')
    expect(bearerToken('')).toBe('')
    expect(bearerToken('abc123')).toBe('') // no scheme
    expect(bearerToken('Basic abc123')).toBe('')
    expect(bearerToken('Bearer')).toBe('')
    expect(bearerToken('Bearer ')).toBe('')
    expect(bearerToken('Bearer a b')).toBe('') // two tokens is not one credential
  })
})

describe('isAuthorized', () => {
  it('accepts either configured secret, exactly', () => {
    expect(isAuthorized(`Bearer ${CRON}`, CRON, SERVICE)).toBe(true)
    expect(isAuthorized(`Bearer ${SERVICE}`, CRON, SERVICE)).toBe(true)
  })

  it('rejects the secret buried in a longer header', () => {
    // The old `auth.includes(secret)` check accepted every one of these.
    expect(isAuthorized(`Bearer x${CRON}`, CRON, SERVICE)).toBe(false)
    expect(isAuthorized(`Bearer ${CRON}x`, CRON, SERVICE)).toBe(false)
    expect(isAuthorized(`Bearer not-${CRON}-really`, CRON, SERVICE)).toBe(false)
    expect(isAuthorized(`Basic ${CRON}`, CRON, SERVICE)).toBe(false)
    expect(isAuthorized(CRON, CRON, SERVICE)).toBe(false) // no scheme at all
  })

  it('rejects a wrong or partial token', () => {
    expect(isAuthorized('Bearer wrong', CRON, SERVICE)).toBe(false)
    expect(isAuthorized(`Bearer ${CRON.slice(0, -1)}`, CRON, SERVICE)).toBe(false)
    expect(isAuthorized('Bearer ', CRON, SERVICE)).toBe(false)
    expect(isAuthorized(null, CRON, SERVICE)).toBe(false)
  })

  it('never authorizes when the secrets are unset — a misconfigured deploy is closed, not open', () => {
    expect(isAuthorized('Bearer anything', undefined, undefined)).toBe(false)
    expect(isAuthorized('Bearer ', '', '')).toBe(false)
    expect(isAuthorized('Bearer ', undefined, undefined)).toBe(false)
    // An empty configured secret must not be matchable by an empty token.
    expect(isAuthorized('Bearer x', '', '')).toBe(false)
  })

  it('still works when only one of the two secrets is configured', () => {
    expect(isAuthorized(`Bearer ${CRON}`, CRON, undefined)).toBe(true)
    expect(isAuthorized(`Bearer ${SERVICE}`, undefined, SERVICE)).toBe(true)
    expect(isAuthorized(`Bearer ${SERVICE}`, CRON, undefined)).toBe(false)
  })
})

describe('timingSafeEqual', () => {
  it('matches identical strings and rejects everything else', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'ab')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
  })
})
