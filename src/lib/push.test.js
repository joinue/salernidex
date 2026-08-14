import { describe, it, expect } from 'vitest'
import { testPushMessage } from './push'

// The point of a real test push is that it can FAIL, and say so. A message that
// reads like success when nothing was delivered would put us back where we
// started — the August 2026 outage was invisible for a week precisely because
// every surface reported "Ready".
describe('testPushMessage', () => {
  it('confirms a clean delivery', () => {
    expect(testPushMessage({ sent: 1, total: 1, results: [{ ok: true }] })).toMatch(
      /arrive on this device/i,
    )
    expect(testPushMessage({ sent: 3, total: 3, results: [] })).toMatch(/all 3 of your devices/i)
  })

  it('says a key mismatch is a key mismatch', () => {
    const msg = testPushMessage({
      sent: 0,
      total: 1,
      results: [{ ok: false, reason: 'key-mismatch' }],
    })
    expect(msg).toMatch(/different VAPID keys/i)
    expect(msg).not.toMatch(/\bSent\b/)
  })

  it('tells the user to re-register when the subscription had expired', () => {
    expect(
      testPushMessage({ sent: 0, total: 1, results: [{ ok: false, reason: 'expired' }] }),
    ).toMatch(/off and on again/i)
    // Partial: some devices got it, the dead ones were pruned.
    expect(
      testPushMessage({
        sent: 1,
        total: 2,
        results: [{ ok: true }, { ok: false, reason: 'expired' }],
      }),
    ).toMatch(/Sent to 1 of 2.*1 stale registration was dropped/i)
  })

  it('distinguishes a rate limit, which is temporary, from a failure that is not', () => {
    expect(
      testPushMessage({ sent: 0, total: 1, results: [{ ok: false, reason: 'rate-limited' }] }),
    ).toMatch(/try again in a minute/i)
  })

  it('handles a device that was never registered server-side', () => {
    expect(testPushMessage({ sent: 0, total: 0, results: [] })).toMatch(/no push registration/i)
    expect(testPushMessage()).toMatch(/no push registration/i) // defensive: no result at all
  })

  it('falls back to a count rather than claiming success on an unknown failure', () => {
    const msg = testPushMessage({
      sent: 1,
      total: 2,
      results: [{ ok: true }, { ok: false, reason: 'error-500' }],
    })
    expect(msg).toMatch(/1 of 2/)
    expect(msg).toMatch(/failed/i)
  })
})
