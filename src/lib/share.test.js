import { describe, it, expect, vi } from 'vitest'
import { canShare, entityPath, shareItem, sharePayload, shareTitle, shareUrl } from './share'

const ORIGIN = 'https://joindoot.com'

describe('entityPath', () => {
  it('addresses the singular detail route, not the index', () => {
    // #/tasks/<id> lands on the index with a row highlighted; #/task/<id> is
    // that one task on a page of its own, which is what somebody following a
    // link out of a text message came for.
    expect(entityPath('task', 't1')).toBe('task/t1')
    expect(entityPath('list', 'l1')).toBe('list/l1')
    expect(entityPath('note', 'n1')).toBe('note/n1')
    expect(entityPath('person', 'p1')).toBe('person/p1')
  })

  it('has no path for a thing with no detail screen', () => {
    expect(entityPath('reminder', 'r1')).toBe(null)
    expect(entityPath('task', null)).toBe(null)
  })
})

describe('shareUrl', () => {
  it('builds a hash link onto the origin', () => {
    expect(shareUrl('task', 't1', ORIGIN)).toBe('https://joindoot.com/#/task/t1')
  })

  it('does not double the slash on an origin that has one', () => {
    expect(shareUrl('list', 'l1', 'https://joindoot.com/')).toBe('https://joindoot.com/#/list/l1')
  })

  it('refuses without an origin', () => {
    expect(shareUrl('task', 't1', '')).toBe(null)
  })
})

describe('shareTitle', () => {
  it('finds the name whichever column it lives in', () => {
    expect(shareTitle('task', { title: 'Fix the sink' })).toBe('Fix the sink')
    expect(shareTitle('list', { name: 'Groceries' })).toBe('Groceries')
    expect(shareTitle('note', { title: '  Trip  ' })).toBe('Trip')
  })

  it('names an untitled note, which is a real thing to send', () => {
    expect(shareTitle('note', { title: '' })).toBe('Untitled note')
  })

  it('has no name for an untitled anything else', () => {
    expect(shareTitle('task', { title: '' })).toBe(null)
    expect(shareTitle('task', null)).toBe(null)
  })
})

describe('canShare', () => {
  it('allows a shared row', () => {
    expect(canShare('task', { id: 't1', privacy_level: 'shared' })).toBe(true)
    expect(canShare('list', { id: 'l1' })).toBe(true)
  })

  it('refuses a private row, because the link could not work', () => {
    // Not a leak — the recipient's own read is filtered by lib/privacy and
    // again by RLS. It is refused because they would land on "not found",
    // which reads as the app being broken rather than the item being yours.
    expect(canShare('task', { id: 't1', privacy_level: 'private' })).toBe(false)
  })

  it('refuses a thing with nowhere to land', () => {
    expect(canShare('reminder', { id: 'r1' })).toBe(false)
    expect(canShare('task', null)).toBe(false)
  })
})

describe('sharePayload', () => {
  it('carries the title and the url in the text, since targets disagree', () => {
    expect(sharePayload('task', { id: 't1', title: 'Fix the sink' }, ORIGIN)).toEqual({
      title: 'Fix the sink',
      text: 'Fix the sink\nhttps://joindoot.com/#/task/t1',
      url: 'https://joindoot.com/#/task/t1',
    })
  })

  it('sends a bare url when there is no name to send', () => {
    expect(sharePayload('task', { id: 't1', title: '' }, ORIGIN)).toEqual({
      title: undefined,
      text: 'https://joindoot.com/#/task/t1',
      url: 'https://joindoot.com/#/task/t1',
    })
  })

  it('is null for anything canShare refused', () => {
    expect(sharePayload('task', { id: 't1', privacy_level: 'private' }, ORIGIN)).toBe(null)
  })
})

describe('shareItem', () => {
  const row = { id: 't1', title: 'Fix the sink' }

  it('hands it to the share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const res = await shareItem('task', row, { origin: ORIGIN, nav: { share } })
    expect(res).toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${ORIGIN}/#/task/t1` }))
  })

  it('copies instead when the platform has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const res = await shareItem('task', row, { origin: ORIGIN, nav: { clipboard: { writeText } } })
    expect(res).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/#/task/t1`)
  })

  it('says nothing happened when the user backs out of the sheet', async () => {
    // Closing the sheet is a decision, not a failure — falling through to a
    // surprise clipboard write would override it.
    const writeText = vi.fn()
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }))
    const res = await shareItem('task', row, {
      origin: ORIGIN,
      nav: { share, clipboard: { writeText } },
    })
    expect(res).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when the sheet itself fails', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const res = await shareItem('task', row, {
      origin: ORIGIN,
      nav: { share, clipboard: { writeText } },
    })
    expect(res).toBe('copied')
    expect(writeText).toHaveBeenCalled()
  })

  it('refuses a private row without touching either', async () => {
    const share = vi.fn()
    const writeText = vi.fn()
    const res = await shareItem(
      'task',
      { ...row, privacy_level: 'private' },
      { origin: ORIGIN, nav: { share, clipboard: { writeText } } },
    )
    expect(res).toBe('blocked')
    expect(share).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('reports a failure when there is no way to hand it over at all', async () => {
    expect(await shareItem('task', row, { origin: ORIGIN, nav: {} })).toBe('failed')
  })
})
