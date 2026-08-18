// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_APP_PREFS,
  getAppPrefs,
  setAppPrefs,
  hydrateAppPrefs,
  getAllAppPrefs,
  setAllAppPrefs,
} from './appPrefs'

// These exist because of one bug, and it's worth naming: hydrateAppPrefs used to
// REPLACE the stored prefs with `{ ...DEFAULT_APP_PREFS, ...serverRow }`. Since
// the server row only carries the columns member_preferences has, every
// localStorage-only pref was reset every time the row echoed back off realtime —
// which is to say, immediately after you changed anything. It read as the UI
// undoing your choice a beat after you made it.

const ME = 'm-1'

beforeEach(() => localStorage.clear())

describe('getAppPrefs / setAppPrefs', () => {
  it('starts from the defaults', () => {
    expect(getAppPrefs(ME)).toEqual(DEFAULT_APP_PREFS)
  })

  it('patches one key without disturbing the rest', () => {
    setAppPrefs(ME, { area: 'a-work' })
    expect(getAppPrefs(ME).area).toBe('a-work')
    expect(getAppPrefs(ME).todayScope).toBe(DEFAULT_APP_PREFS.todayScope)
  })

  it('keeps members apart', () => {
    setAppPrefs(ME, { area: 'a-work' })
    expect(getAppPrefs('m-2').area).toBe('all')
  })
})

describe('hydrateAppPrefs', () => {
  it('applies what the server knows', () => {
    setAppPrefs(ME, { taskFilter: 'all' })
    hydrateAppPrefs(ME, { taskFilter: 'm-2' })
    expect(getAppPrefs(ME).taskFilter).toBe('m-2')
  })

  // The regression. `todayScope` and `notesSort` have no column in
  // member_preferences, so a server row never mentions them — and they were
  // being reset to defaults on every hydrate.
  it('leaves prefs the server row does not carry alone', () => {
    setAppPrefs(ME, { todayScope: 'all', notesSort: 'title' })
    hydrateAppPrefs(ME, { taskFilter: 'm-2', showCompleted: true })
    const prefs = getAppPrefs(ME)
    expect(prefs.todayScope).toBe('all')
    expect(prefs.notesSort).toBe('title')
    expect(prefs.taskFilter).toBe('m-2')
  })

  // The specific symptom: pick an area, your own write echoes back off the
  // member_preferences realtime subscription, and the lens snaps to "All".
  it('does not reset the area lens when the echo omits it', () => {
    setAppPrefs(ME, { area: 'a-work' })
    hydrateAppPrefs(ME, { taskFilter: 'all' })
    expect(getAppPrefs(ME).area).toBe('a-work')
  })

  it('still lets the server move the lens — that is what makes it sync', () => {
    setAppPrefs(ME, { area: 'a-work' })
    hydrateAppPrefs(ME, { area: 'a-home' })
    expect(getAppPrefs(ME).area).toBe('a-home')
  })

  it('fills in any key neither side has set', () => {
    hydrateAppPrefs(ME, { taskFilter: 'm-2' })
    expect(getAppPrefs(ME).peopleSort).toBe(DEFAULT_APP_PREFS.peopleSort)
  })
})

describe('backup round-trip', () => {
  it('carries the whole per-member map', () => {
    setAppPrefs(ME, { area: 'a-work' })
    const snapshot = getAllAppPrefs()
    localStorage.clear()
    setAllAppPrefs(snapshot)
    expect(getAppPrefs(ME).area).toBe('a-work')
  })

  it('ignores a junk restore rather than wiping what is there', () => {
    setAppPrefs(ME, { area: 'a-work' })
    setAllAppPrefs(null)
    expect(getAppPrefs(ME).area).toBe('a-work')
  })
})
