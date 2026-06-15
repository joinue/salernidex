import { describe, it, expect } from 'vitest'
import {
  notesMentioning,
  sortNotes,
  mentionCandidates,
  isNoteEmpty,
  linkifyHtml,
  sanitizeNoteHtml,
  extractMentions,
  htmlToText,
  noteTitle,
  noteSnippet,
} from './notes'

// Pure, DOM-free helpers — always run.
describe('notesMentioning', () => {
  const notes = [
    { id: 'a', mentions: [{ type: 'person', id: 'p1' }] },
    {
      id: 'b',
      mentions: [
        { type: 'organization', id: 'o1' },
        { type: 'person', id: 'p1' },
      ],
    },
    { id: 'c', mentions: [] },
    { id: 'd' }, // no mentions field at all
  ]
  it('finds notes mentioning a given entity', () => {
    expect(notesMentioning(notes, 'person', 'p1').map((n) => n.id)).toEqual(['a', 'b'])
    expect(notesMentioning(notes, 'organization', 'o1').map((n) => n.id)).toEqual(['b'])
  })
  it('returns empty when nothing matches or inputs are bad', () => {
    expect(notesMentioning(notes, 'group', 'g1')).toEqual([])
    expect(notesMentioning(null, 'person', 'p1')).toEqual([])
    expect(notesMentioning(notes, 'person', undefined)).toEqual([])
  })
})

describe('sortNotes', () => {
  it('pins first, then most-recently-updated', () => {
    const notes = [
      { id: 'old', pinned: false, updated_at: '2026-01-01' },
      { id: 'new', pinned: false, updated_at: '2026-06-01' },
      { id: 'pin', pinned: true, updated_at: '2025-01-01' },
    ]
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['pin', 'new', 'old'])
  })
  it('does not mutate the input', () => {
    const notes = [{ id: 'a', updated_at: '1' }]
    sortNotes(notes)
    expect(notes).toHaveLength(1)
  })
})

describe('mentionCandidates', () => {
  const data = {
    people: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: '' },
    ],
    orgs: [{ id: 'o1', name: 'Acme' }],
    groups: [{ id: 'g1', name: 'Book Club' }],
    tasks: [
      { id: 't1', title: 'Renew', is_project: false },
      { id: 't2', title: 'Reno', is_project: true },
      { id: 'h1', title: 'Heading', is_heading: true },
      { id: 't3', title: '' },
    ],
    lists: [{ id: 'l1', name: 'Groceries' }],
  }
  it('flattens entities into typed candidates, skipping empty names + headings', () => {
    const c = mentionCandidates(data)
    expect(c).toContainEqual({ type: 'person', id: 'p1', label: 'Ann', sub: 'Contact' })
    expect(c).toContainEqual({ type: 'organization', id: 'o1', label: 'Acme', sub: 'Org' })
    expect(c).toContainEqual({ type: 'group', id: 'g1', label: 'Book Club', sub: 'Group' })
    expect(c).toContainEqual({ type: 'project', id: 't2', label: 'Reno', sub: 'Project' })
    expect(c).toContainEqual({ type: 'task', id: 't1', label: 'Renew', sub: 'Task' })
    expect(c).toContainEqual({ type: 'list', id: 'l1', label: 'Groceries', sub: 'List' })
    expect(c.map((x) => x.id)).not.toContain('p2') // empty name
    expect(c.map((x) => x.id)).not.toContain('h1') // heading
    expect(c.map((x) => x.id)).not.toContain('t3') // empty title
  })
  it('tolerates missing collections', () => {
    expect(mentionCandidates({})).toEqual([])
  })
})

describe('isNoteEmpty', () => {
  it('treats a blank title + body as empty', () => {
    expect(isNoteEmpty({ title: '', body: '' })).toBe(true)
    expect(isNoteEmpty({ title: '   ', body: '<div><br></div>' })).toBe(true)
    expect(isNoteEmpty(null)).toBe(true)
  })
  it('counts title, text, image, divider, or a mention as content', () => {
    expect(isNoteEmpty({ title: 'Hi', body: '' })).toBe(false)
    expect(isNoteEmpty({ body: '<div>text</div>' })).toBe(false)
    expect(isNoteEmpty({ body: '<img src="data:image/png;base64,x">' })).toBe(false)
    expect(isNoteEmpty({ body: '<hr>' })).toBe(false)
    expect(
      isNoteEmpty({ body: '<span class="mention" data-type="person" data-id="p1">@A</span>' }),
    ).toBe(false)
  })
})

describe('sortNotes modes', () => {
  const notes = [
    { id: 'a', updated_at: '2026-01-01', created_at: '2026-03-01' },
    { id: 'b', updated_at: '2026-06-01', created_at: '2026-01-01' },
  ]
  it('created sorts by created_at, edited by updated_at', () => {
    expect(sortNotes(notes, 'created').map((n) => n.id)).toEqual(['a', 'b'])
    expect(sortNotes(notes, 'edited').map((n) => n.id)).toEqual(['b', 'a'])
  })
})

// DOM-dependent helpers — exercised wherever a DOM (browser / jsdom) is present.
// The project's vitest environment is 'node', so these are gated rather than
// pulling in a DOM dependency just for tests.
const hasDOM = typeof DOMParser !== 'undefined'
describe.runIf(hasDOM)('sanitizeNoteHtml', () => {
  it('strips scripts, event handlers, and javascript: urls', () => {
    const dirty =
      '<div onclick="steal()">hi<script>evil()</script></div><a href="javascript:bad()">x</a>'
    const clean = sanitizeNoteHtml(dirty)
    expect(clean).not.toMatch(/script/i)
    expect(clean).not.toMatch(/onclick/i)
    expect(clean).not.toMatch(/javascript:/i)
    expect(clean).toContain('hi')
  })
  it('keeps allowed formatting and unwraps disallowed tags', () => {
    expect(sanitizeNoteHtml('<b>bold</b>')).toBe('<b>bold</b>')
    // <font> is not allowed but its text survives
    expect(htmlToText(sanitizeNoteHtml('<font color="red">keep</font>'))).toBe('keep')
  })
  it('preserves checklist markers across a round-trip', () => {
    const html =
      '<ul class="checklist"><li class="checklist-item" data-checked="true">done</li>' +
      '<li class="checklist-item" data-checked="false">todo</li></ul>'
    const clean = sanitizeNoteHtml(html)
    expect(clean).toContain('class="checklist"')
    expect(clean).toContain('class="checklist-item"')
    expect(clean).toContain('data-checked="true"')
  })
  it('preserves a well-formed mention chip and normalizes its attrs', () => {
    const html =
      '<span class="mention" data-type="person" data-id="p1" style="color:red" onclick="x">@Ann</span>'
    const clean = sanitizeNoteHtml(html)
    expect(clean).toContain('data-type="person"')
    expect(clean).toContain('data-id="p1"')
    expect(clean).toContain('@Ann')
    expect(clean).not.toMatch(/style|onclick/i)
  })
})

describe.runIf(hasDOM)('links + images', () => {
  it('allows safe links and strips javascript: ones (keeping the text)', () => {
    const ok = sanitizeNoteHtml('<a href="https://x.com">x</a>')
    expect(ok).toContain('href="https://x.com"')
    expect(ok).toContain('rel="noopener noreferrer"')
    const bad = sanitizeNoteHtml('<a href="javascript:evil()">x</a>')
    expect(bad).not.toMatch(/javascript:/i)
    expect(bad).toContain('x')
  })
  it('keeps data:image / https img but drops unsafe srcs', () => {
    expect(sanitizeNoteHtml('<img src="data:image/png;base64,AAA" alt="p">')).toContain(
      'data:image/png',
    )
    expect(sanitizeNoteHtml('<img src="https://x.com/a.png">')).toContain('https://x.com/a.png')
    expect(sanitizeNoteHtml('<img src="javascript:x">')).not.toMatch(/<img/i)
  })
  it('linkifies bare urls without double-wrapping existing links', () => {
    expect(linkifyHtml('see https://x.com now')).toContain('<a href="https://x.com"')
    expect(linkifyHtml('<a href="https://x.com">x</a>')).toBe('<a href="https://x.com">x</a>')
  })
})

describe.runIf(hasDOM)('extractMentions', () => {
  it('returns deduped [{type,id}] in document order', () => {
    const html =
      '<span class="mention" data-type="person" data-id="p1">@A</span> and ' +
      '<span class="mention" data-type="group" data-id="g1">@G</span> and again ' +
      '<span class="mention" data-type="person" data-id="p1">@A</span>'
    expect(extractMentions(html)).toEqual([
      { type: 'person', id: 'p1' },
      { type: 'group', id: 'g1' },
    ])
  })
})

describe.runIf(hasDOM)('noteTitle / noteSnippet', () => {
  it('falls back to the first body line for the title', () => {
    expect(noteTitle({ title: '', body: '<div>First line</div><div>Second</div>' })).toBe(
      'First line',
    )
    expect(noteTitle({ title: 'Explicit', body: '<div>x</div>' })).toBe('Explicit')
    expect(noteTitle({ body: '' })).toBe('New note')
  })
  it('snippet drops the implicit-title line', () => {
    expect(noteSnippet({ title: '', body: '<div>Title</div><div>Body text</div>' })).toBe(
      'Body text',
    )
  })
})
