import { describe, it, expect } from 'vitest'
import { PROJECT_TEMPLATES, BLANK_TEMPLATE, buildProjectRows } from './projectTemplates'

describe('PROJECT_TEMPLATES catalog', () => {
  it('has unique ids and the locked starter set', () => {
    const ids = PROJECT_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['trip', 'home-reno', 'event', 'move', 'holiday', 'job-search'])
  })

  it('holds the line on scaffolding-not-clutter: ≤4 starter tasks each', () => {
    for (const t of PROJECT_TEMPLATES) {
      const starters = t.phases.reduce((n, p) => n + (p.tasks?.length || 0), 0)
      expect(starters).toBeLessThanOrEqual(4)
    }
  })
})

describe('buildProjectRows', () => {
  const trip = PROJECT_TEMPLATES.find((t) => t.id === 'trip')

  it('flags the project and threads privacy through children + lists', () => {
    const { project, children, lists } = buildProjectRows(trip, {
      name: 'Italy',
      privacy_level: 'marc_only',
      start_date: '2026-07-01',
      end_date: '2026-07-10',
    })
    expect(project).toMatchObject({
      title: 'Italy',
      is_project: true,
      project_status: 'active',
      privacy_level: 'marc_only',
      start_date: '2026-07-01',
      end_date: '2026-07-10',
    })
    expect(children.every((c) => c.privacy_level === 'marc_only')).toBe(true)
    expect(lists.every((l) => l.privacy_level === 'marc_only')).toBe(true)
  })

  it('interleaves heading rows and their tasks in manual sort_order', () => {
    const { children } = buildProjectRows(trip, {})
    // First phase: heading "Before you go" then its 3 tasks.
    expect(children[0]).toMatchObject({ title: 'Before you go', is_heading: true, sort_order: 1 })
    expect(children[1]).toMatchObject({ title: 'Book travel', sort_order: 2 })
    expect(children.map((c) => c.sort_order)).toEqual([1, 2, 3, 4, 5])
  })

  it('respects the review step dropping starter tasks', () => {
    const phases = [{ title: 'Plan', tasks: ['Keep this'] }]
    const { children } = buildProjectRows(trip, { phases })
    expect(children.map((c) => c.title)).toEqual(['Plan', 'Keep this'])
  })

  it('a blank template yields just the project, no children/lists', () => {
    const { project, children, lists } = buildProjectRows(BLANK_TEMPLATE, { name: 'Scratch' })
    expect(project.title).toBe('Scratch')
    expect(children).toHaveLength(0)
    expect(lists).toHaveLength(0)
  })

  it('falls back to the template name when none is given', () => {
    expect(buildProjectRows(trip, { name: '   ' }).project.title).toBe('Trip')
  })
})
