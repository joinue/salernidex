// Starter habit templates — a curated catalog to kill the blank-form cold start.
//
// A template is just a *partial habit*: the same field shape HabitForm collects,
// minus an id (so it saves as a new habit, fully editable first). The picker and
// the empty-state chip rail both read from this one list. `habit.icon` is the
// emoji glyph carried straight onto the created habit (falls back to a colored
// letter-dot if cleared).
//
// Deliberately excluded: anything a phone or wearable auto-tracks better than a
// human logs by hand (steps, screen time, sleep, active calories). Templates are
// only for habits people genuinely log themselves. Build and limit habits are
// both represented, plus a mix of binary/count and daily/weekly, so the catalog
// also teaches the model implicitly. Names are phrased as goals ("Drink More
// Water") since the template name becomes the habit's name on create.
//
// `color`s are drawn from HabitForm's COLORS palette so templates never
// introduce an off-brand color.

export const HABIT_TEMPLATES = [
  {
    id: 'water',
    habit: {
      icon: '💧',
      name: 'Drink More Water',
      polarity: 'build',
      measure: 'count',
      unit: 'glasses',
      target: 8,
      color: '#0a84ff',
      active_days: [],
    },
  },
  {
    id: 'workout',
    habit: {
      icon: '🏋️',
      name: 'Workout Consistently',
      polarity: 'build',
      measure: 'binary',
      weekly_target: 3,
      color: '#34c759',
      active_days: [],
    },
  },
  {
    id: 'read',
    habit: {
      icon: '📖',
      name: 'Read More',
      polarity: 'build',
      measure: 'binary',
      color: '#bf5af2',
      active_days: [],
    },
  },
  {
    id: 'meditate',
    habit: {
      icon: '🧘',
      name: 'Meditate',
      polarity: 'build',
      measure: 'binary',
      color: '#5ac8fa',
      active_days: [],
    },
  },
  {
    id: 'stretch',
    habit: {
      icon: '🤸',
      name: 'Stretch',
      polarity: 'build',
      measure: 'binary',
      color: '#ff9f0a',
      active_days: [],
    },
  },
  {
    id: 'journal',
    habit: {
      icon: '📓',
      name: 'Journal',
      polarity: 'build',
      measure: 'binary',
      color: '#ffd60a',
      active_days: [],
    },
  },
  {
    id: 'vitamins',
    habit: {
      icon: '💊',
      name: 'Take Vitamins',
      polarity: 'build',
      measure: 'binary',
      color: '#ff375f',
      active_days: [],
    },
  },
  {
    id: 'floss',
    habit: {
      icon: '🦷',
      name: 'Floss',
      polarity: 'build',
      measure: 'binary',
      color: '#5ac8fa',
      active_days: [],
    },
  },
  {
    id: 'smoke-free',
    habit: {
      icon: '🚭',
      name: 'Stop Smoking',
      polarity: 'limit',
      measure: 'binary',
      target: 0,
      color: '#ff375f',
      active_days: [],
    },
  },
  {
    id: 'alcohol',
    habit: {
      icon: '🍷',
      name: 'Drink Less',
      polarity: 'limit',
      measure: 'count',
      unit: 'drinks',
      target: 0,
      color: '#bf5af2',
      active_days: [],
    },
  },
]
