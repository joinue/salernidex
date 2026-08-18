import { describe, it, expect, vi } from 'vitest'
import { copyText, countLabel, toMarkdown } from './bulk'

describe('toMarkdown', () => {
  it('keeps the check state, so a paste carries it', () => {
    expect(
      toMarkdown([
        { text: 'Milk', checked_at: null },
        { text: 'Bread', checked_at: '2026-08-18T10:00:00Z' },
      ]),
    ).toBe('- [ ] Milk\n- [x] Bread')
  })

  it('reads completed_at as well as checked_at', () => {
    // Tasks and list items spell the same fact differently.
    expect(toMarkdown([{ title: 'Fix sink', completed_at: '2026-08-18T10:00:00Z' }])).toBe(
      '- [x] Fix sink',
    )
  })

  it('uses plain bullets for things with no state to carry', () => {
    // `- [ ]` on a note would invent a to-do the user never made.
    expect(toMarkdown([{ title: 'Trip ideas' }], { checkable: false })).toBe('- Trip ideas')
  })

  it('carries the quantity and note, which are why the row was written', () => {
    expect(toMarkdown([{ text: 'Milk', qty: '2 gal', note: 'the oat one' }])).toBe(
      '- [ ] Milk (2 gal · the oat one)',
    )
    expect(toMarkdown([{ text: 'Milk', qty: '2 gal' }])).toBe('- [ ] Milk (2 gal)')
  })

  it('titles the block when asked, so a paste says what it is', () => {
    expect(toMarkdown([{ text: 'Milk' }], { heading: 'Groceries' })).toBe(
      '## Groceries\n- [ ] Milk',
    )
  })

  it('leaves section headings out — they are structure, not items', () => {
    expect(toMarkdown([{ text: 'Produce', is_heading: true }, { text: 'Apples' }])).toBe(
      '- [ ] Apples',
    )
  })

  it('is empty for nothing worth copying', () => {
    expect(toMarkdown([])).toBe('')
    expect(toMarkdown(null)).toBe('')
    expect(toMarkdown([{ text: '  ' }])).toBe('')
    // No body means no heading either — a lone "## Groceries" is a lie.
    expect(toMarkdown([{ text: '' }], { heading: 'Groceries' })).toBe('')
  })
})

describe('copyText', () => {
  it('copies', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await copyText('hi', { nav: { clipboard: { writeText } } })).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hi')
  })

  it('does not claim success where there is no clipboard', async () => {
    expect(await copyText('hi', { nav: {} })).toBe(false)
  })

  it('does not claim success when the write is refused', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    expect(await copyText('hi', { nav: { clipboard: { writeText } } })).toBe(false)
  })

  it('has nothing to copy for an empty selection', async () => {
    const writeText = vi.fn()
    expect(await copyText('', { nav: { clipboard: { writeText } } })).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('countLabel', () => {
  it('pluralises once, here, so no two call sites disagree', () => {
    expect(countLabel(1, 'task')).toBe('1 task')
    expect(countLabel(3, 'task')).toBe('3 tasks')
    expect(countLabel(0, 'item')).toBe('0 items')
  })
})
