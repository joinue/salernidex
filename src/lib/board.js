// The household board — what a screen propped on the kitchen counter shows.
//
// Two rules make this different from Today, and they're the whole design:
//
//   1. It is HOUSEHOLD scope, not member scope. Today answers "what do I owe";
//      the board answers "what does this house owe". Nothing here filters by
//      assignee — the assignee is displayed instead, so a glance says who.
//
//   2. NOTHING PRIVATE. Today runs behind a login on a phone in your pocket.
//      The board runs unattended on a screen anyone in the room can read, so
//      "Private — only me" rows are dropped here even though the signed-in
//      member is entitled to see them. `data` from useData has already applied
//      visibility for the *viewer*; this strips the private rows a second time,
//      for the *room*.
//
// Pure, and everything time-derived is passed in, so a board left running for a
// week just re-derives with a new `todayISO` at midnight.

import { isPrivate } from './privacy'
import { taskBucket } from './tasks'
import { isMealPlan, mealsOn } from './mealPlan'
import { upcomingDates } from './contact'

// A board row is only worth the space if it needs doing today. Overdue counts
// — that's exactly what a household display is for.
const ON_TODAY = new Set(['overdue', 'today'])

export const DATES_WITHIN_DAYS = 14

export function boardTasks(tasks = []) {
  return tasks
    .filter(
      (t) =>
        !t.completed_at &&
        !t.is_heading &&
        !t.is_project && // the container lives in Projects; its dated steps still land here
        !isPrivate(t) &&
        ON_TODAY.has(taskBucket(t)),
    )
    .sort((a, b) => {
      // Overdue first, then by date — the oldest thing nobody has done is the
      // most useful line on a kitchen wall.
      const ab = taskBucket(a) === 'overdue' ? 0 : 1
      const bb = taskBucket(b) === 'overdue' ? 0 : 1
      if (ab !== bb) return ab - bb
      return (a.due_date || '') < (b.due_date || '') ? -1 : 1
    })
}

// Tonight's meals, across every meal plan the household keeps. Returns the
// items themselves — the board shows what's for dinner, not which list it
// came from.
export function boardMeals(lists = [], listItems = [], todayISO) {
  const plans = lists.filter((l) => isMealPlan(l) && !isPrivate(l))
  return plans.flatMap((l) =>
    mealsOn(
      listItems.filter((it) => it.list_id === l.id),
      todayISO,
    ),
  )
}

// Open shopping, per grocery list. Lists with nothing on them are dropped —
// an empty card is noise on a display you can't scroll.
export function boardShopping(lists = [], listItems = []) {
  return lists
    .filter((l) => l.kind === 'grocery' && !isPrivate(l))
    .map((l) => ({
      list: l,
      items: listItems.filter((it) => it.list_id === l.id && !it.checked_at && !it.is_heading),
    }))
    .filter((g) => g.items.length > 0)
}

// Birthdays and key dates near enough to act on. Two weeks rather than Today's
// 30: a card you walk past every day should show what still needs a present
// bought, not a wall of things three weeks out.
export function boardDates(people = [], keyDates = [], withinDays = DATES_WITHIN_DAYS) {
  return upcomingDates(
    people.filter((p) => !p.deleted_at && !isPrivate(p)),
    keyDates,
    withinDays,
  )
}

// Habits are the sharpest privacy call on the board, and they don't go through
// privacy_level at all — a habit is personal to its member and opts IN to the
// household with `shared` (migration 0020). So the rule here is that flag and
// nothing else: an unshared habit is private by definition, and "Alcohol-free",
// "Weight" and "Mood" are exactly the rows that must never appear on a screen
// in a shared room, even though they're the signed-in member's own and Today
// shows them happily.
//
// Taking both arrays also makes this household scope like everything else: a
// habit anyone shared belongs on the board, not just the viewer's.
export function boardHabits(mine = [], sharedWithMe = []) {
  return [...mine, ...sharedWithMe].filter((h) => h.shared && !isPrivate(h))
}

// Is there anything at all to show? A board with every card empty should say
// so warmly rather than render five empty headings.
export function boardIsEmpty(board) {
  return (
    board.tasks.length === 0 &&
    board.meals.length === 0 &&
    board.shopping.length === 0 &&
    board.habits.length === 0 &&
    board.dates.length === 0
  )
}

// One pass over everything the board renders. `habits` / `sharedHabits` arrive
// already narrowed to what's scheduled today (habitsScheduledToday needs the
// entry map, which is the caller's to build); boardHabits applies the sharing
// rule on top.
export function buildBoard(
  { tasks, lists, listItems, people, keyDates, habits, sharedHabits },
  todayISO,
) {
  const board = {
    tasks: boardTasks(tasks),
    meals: boardMeals(lists, listItems, todayISO),
    shopping: boardShopping(lists, listItems),
    habits: boardHabits(habits, sharedHabits),
    dates: boardDates(people, keyDates),
  }
  return { ...board, empty: boardIsEmpty(board) }
}
