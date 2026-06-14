import { describe, it, expect } from 'vitest'
import { HABIT_TEMPLATES } from './habitTemplates'

// Mirror of HabitForm's COLORS palette — templates must stay on-brand.
const PALETTE = [
  '#34c759',
  '#0a84ff',
  '#ff9f0a',
  '#bf5af2',
  '#ff375f',
  '#5ac8fa',
  '#ffd60a',
  '#8e8e93',
]

describe('HABIT_TEMPLATES', () => {
  it('has unique ids', () => {
    const ids = HABIT_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every template has an icon and a named habit partial', () => {
    for (const t of HABIT_TEMPLATES) {
      expect(t.habit?.icon, t.id).toBeTruthy()
      expect(t.habit?.name?.trim(), t.id).toBeTruthy()
    }
  })

  it('uses only valid polarity / measure', () => {
    for (const { id, habit } of HABIT_TEMPLATES) {
      expect(['build', 'limit', 'track'], id).toContain(habit.polarity)
      expect(['binary', 'count'], id).toContain(habit.measure)
    }
  })

  it('uses only palette colors', () => {
    for (const { id, habit } of HABIT_TEMPLATES) {
      expect(PALETTE, id).toContain(habit.color)
    }
  })

  it('schedules by weekly_target XOR specific days, never both', () => {
    for (const { id, habit } of HABIT_TEMPLATES) {
      const weekly = habit.weekly_target != null
      const hasDays = Array.isArray(habit.active_days) && habit.active_days.length > 0
      expect(weekly && hasDays, `${id} sets both weekly_target and active_days`).toBe(false)
    }
  })

  it('limit habits define a numeric ceiling (binary limits cap at 0)', () => {
    for (const { id, habit } of HABIT_TEMPLATES) {
      if (habit.polarity !== 'limit') continue
      expect(typeof habit.target, id).toBe('number')
      if (habit.measure === 'binary') expect(habit.target, id).toBe(0)
    }
  })

  it('count/build templates with a target keep it numeric', () => {
    for (const { id, habit } of HABIT_TEMPLATES) {
      if (habit.target != null) expect(typeof habit.target, id).toBe('number')
    }
  })
})
