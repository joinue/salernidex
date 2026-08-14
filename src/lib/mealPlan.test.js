import { describe, it, expect } from 'vitest'
import {
  addDays,
  dayChipLabel,
  dayLabel,
  daysBetween,
  mealsOn,
  parseIngredients,
  parseISO,
  planWindow,
  suggestedDay,
  toISO,
  windowDays,
} from './mealPlan'

const TODAY = '2026-08-13' // a Thursday
const meal = (text, on_date, extra = {}) => ({
  id: text,
  text,
  on_date,
  is_heading: false,
  checked_at: null,
  ...extra,
})

describe('date helpers', () => {
  it('parses an ISO date at LOCAL midnight, not UTC', () => {
    const d = parseISO('2026-08-13')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(13) // the UTC reading lands on the 12th west of GMT
  })

  it('round-trips through toISO', () => {
    expect(toISO(parseISO(TODAY))).toBe(TODAY)
  })

  it('rolls over month and year ends', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts whole days between dates', () => {
    expect(daysBetween(TODAY, TODAY)).toBe(0)
    expect(daysBetween(TODAY, '2026-08-20')).toBe(7)
    // Spans a US DST boundary — 23- and 25-hour days must still round to whole
    // days rather than truncating to one short.
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7)
    expect(daysBetween('2026-03-08', '2026-03-15')).toBe(7)
  })

  it('builds a window of consecutive days starting today', () => {
    expect(windowDays(TODAY, 3)).toEqual(['2026-08-13', '2026-08-14', '2026-08-15'])
  })
})

describe('dayLabel', () => {
  it('names the near days and dates the far ones', () => {
    expect(dayLabel(TODAY, TODAY, 'en-US')).toBe('Today')
    expect(dayLabel('2026-08-14', TODAY, 'en-US')).toBe('Tomorrow')
    expect(dayLabel('2026-08-16', TODAY, 'en-US')).toBe('Sunday')
    expect(dayLabel('2026-08-19', TODAY, 'en-US')).toBe('Wednesday')
    // Day 7 is the same weekday name as today, so it has to carry a date or
    // "Thursday" would appear twice in one window.
    expect(dayLabel('2026-08-20', TODAY, 'en-US')).toBe('Thu, Aug 20')
  })

  it('keeps chips short', () => {
    expect(dayChipLabel(TODAY, TODAY, 'en-US')).toBe('Today')
    expect(dayChipLabel('2026-08-14', TODAY, 'en-US')).toBe('Tom')
    expect(dayChipLabel('2026-08-16', TODAY, 'en-US')).toBe('Sun 16')
  })
})

describe('planWindow', () => {
  it('files each item into its day and keeps empty days', () => {
    const plan = planWindow([meal('Tacos', TODAY), meal('Curry', '2026-08-15')], TODAY)
    expect(plan.days).toHaveLength(7)
    expect(plan.days[0].items.map((i) => i.text)).toEqual(['Tacos'])
    expect(plan.days[1].items).toEqual([]) // an empty day still renders
    expect(plan.days[2].items.map((i) => i.text)).toEqual(['Curry'])
  })

  it('surfaces past-dated open meals above the window instead of dropping them', () => {
    const plan = planWindow([meal('Leftovers', '2026-08-10')], TODAY)
    expect(plan.earlier.map((i) => i.text)).toEqual(['Leftovers'])
    expect(plan.days.every((d) => d.items.length === 0)).toBe(true)
  })

  it('separates beyond-the-window, unscheduled and made', () => {
    const plan = planWindow(
      [
        meal('Birthday dinner', '2026-09-01'),
        meal('Something Friday', null),
        meal('Chili', '2026-08-12', { checked_at: '2026-08-12T23:00:00Z' }),
      ],
      TODAY,
    )
    expect(plan.later.map((i) => i.text)).toEqual(['Birthday dinner'])
    expect(plan.unscheduled.map((i) => i.text)).toEqual(['Something Friday'])
    expect(plan.done.map((i) => i.text)).toEqual(['Chili'])
    // A made meal is done wherever it sat — it must not also occupy its day.
    expect(plan.earlier).toEqual([])
  })

  it('drops heading rows — the days are the sections', () => {
    const plan = planWindow([meal('Week 1', TODAY, { is_heading: true })], TODAY)
    expect(plan.days[0].items).toEqual([])
  })

  it('sorts earlier oldest-first and done newest-first', () => {
    const plan = planWindow(
      [
        meal('B', '2026-08-11'),
        meal('A', '2026-08-09'),
        meal('old', '2026-08-01', { checked_at: '2026-08-01T00:00:00Z' }),
        meal('new', '2026-08-12', { checked_at: '2026-08-12T00:00:00Z' }),
      ],
      TODAY,
    )
    expect(plan.earlier.map((i) => i.text)).toEqual(['A', 'B'])
    expect(plan.done.map((i) => i.text)).toEqual(['new', 'old'])
  })
})

describe('mealsOn', () => {
  it('returns just that day, open only', () => {
    const items = [
      meal('Tacos', TODAY),
      meal('Curry', TODAY, { checked_at: '2026-08-13T01:00:00Z' }),
      meal('Pasta', '2026-08-14'),
    ]
    expect(mealsOn(items, TODAY).map((i) => i.text)).toEqual(['Tacos'])
  })
})

describe('parseIngredients', () => {
  it('splits on commas, newlines and semicolons', () => {
    expect(parseIngredients('chicken, rice, broccoli')).toEqual(['chicken', 'rice', 'broccoli'])
    expect(parseIngredients('chicken\nrice\nbroccoli')).toEqual(['chicken', 'rice', 'broccoli'])
    expect(parseIngredients('chicken; rice')).toEqual(['chicken', 'rice'])
  })

  it('treats a trailing "and" as a separator', () => {
    expect(parseIngredients('rice, beans and salsa')).toEqual(['rice', 'beans', 'salsa'])
  })

  it('strips bullets and blank entries', () => {
    expect(parseIngredients('- milk\n• eggs\n\n* bread')).toEqual(['milk', 'eggs', 'bread'])
    expect(parseIngredients('milk,,eggs,')).toEqual(['milk', 'eggs'])
  })

  it('leaves quantities alone for the grocery list to peel', () => {
    expect(parseIngredients('2 avocados, 1 lb ground beef')).toEqual([
      '2 avocados',
      '1 lb ground beef',
    ])
  })

  it('is empty for no note', () => {
    expect(parseIngredients(null)).toEqual([])
    expect(parseIngredients('')).toEqual([])
    expect(parseIngredients('   ')).toEqual([])
  })

  it("doesn't split a word that merely contains 'and'", () => {
    expect(parseIngredients('sandwich bread, candy')).toEqual(['sandwich bread', 'candy'])
  })
})

describe('suggestedDay', () => {
  it('offers today when today is free', () => {
    expect(suggestedDay([], TODAY)).toBe(TODAY)
  })

  it('offers the first empty day once today is spoken for', () => {
    const items = [meal('Tacos', TODAY), meal('Curry', '2026-08-14')]
    expect(suggestedDay(items, TODAY)).toBe('2026-08-15')
  })

  it('falls back to today when the whole window is full', () => {
    const items = windowDays(TODAY).map((iso) => meal(`Dinner ${iso}`, iso))
    expect(suggestedDay(items, TODAY)).toBe(TODAY)
  })
})
