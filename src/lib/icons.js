// Emoji catalog for habit/list icons. Grouped so the picker can show a compact
// "quick" row by default and expand to the full, searchable grid on demand.
// Each item is [glyph, 'space separated keywords'] — keywords feed search so a
// user can type "water" and land on 💧 without scanning every category.

export const ICON_GROUPS = [
  {
    name: 'Health',
    items: [
      ['💧', 'water drink hydrate'],
      ['🏋️', 'gym lift weights strength workout'],
      ['🏃', 'run running cardio jog'],
      ['🚶', 'walk steps stroll'],
      ['🤸', 'stretch gymnastics mobility'],
      ['🧘', 'meditate yoga calm mindful'],
      ['💪', 'muscle strong fitness'],
      ['🥗', 'salad healthy eat veggies'],
      ['🍎', 'apple fruit healthy eat'],
      ['🍆', 'eggplant aubergine veggie'],
      ['🍑', 'peach fruit'],
      ['😴', 'sleep rest bed nap'],
      ['💊', 'pill medication vitamin meds'],
      ['🦷', 'teeth floss dental brush'],
      ['🧴', 'skincare lotion sunscreen'],
      ['🚭', 'no smoking quit cigarette'],
      ['🍷', 'wine alcohol drink limit'],
      ['🚰', 'tap water hydrate'],
      ['⚖️', 'weight scale weigh'],
      ['🩺', 'health checkup doctor'],
      ['💩', 'poop bathroom bowel toilet'],
    ],
  },
  {
    name: 'Mind & growth',
    items: [
      ['📖', 'read book reading study'],
      ['📓', 'journal notebook diary write'],
      ['✍️', 'write writing journal'],
      ['🎯', 'goal target focus aim'],
      ['🧠', 'brain learn think mind'],
      ['🗣️', 'language speak practice talk'],
      ['🎓', 'study learn school course'],
      ['💡', 'idea learn insight'],
      ['🧩', 'puzzle focus brain'],
      ['📝', 'note write task plan'],
    ],
  },
  {
    name: 'Hobbies',
    items: [
      ['🎸', 'guitar music practice instrument'],
      ['🎹', 'piano music keyboard'],
      ['🎨', 'paint art draw creative'],
      ['📷', 'photo camera photography'],
      ['🎮', 'game gaming play'],
      ['♟️', 'chess strategy game'],
      ['🧶', 'knit yarn craft'],
      ['🎬', 'movie film watch'],
      ['🎧', 'music listen podcast audio'],
      ['🪴', 'plant garden water grow'],
      ['🐕', 'dog pet walk'],
      ['🐈', 'cat pet'],
    ],
  },
  {
    name: 'Home & chores',
    items: [
      ['🧹', 'clean sweep chores tidy'],
      ['🧺', 'laundry wash clothes'],
      ['🍽️', 'dishes meal cook dinner'],
      ['🛏️', 'bed make tidy'],
      ['🗑️', 'trash garbage bin'],
      ['🧼', 'wash clean soap'],
      ['🏠', 'home house'],
      ['🛒', 'groceries shopping cart'],
      ['🛍️', 'shopping bags buy'],
      ['🔧', 'fix repair tools diy'],
      ['🧳', 'pack travel suitcase'],
      ['🎁', 'gift present'],
    ],
  },
  {
    name: 'Work & money',
    items: [
      ['💼', 'work job business'],
      ['💻', 'computer code work laptop'],
      ['📧', 'email inbox mail'],
      ['📞', 'call phone'],
      ['📅', 'calendar schedule plan'],
      ['💰', 'money save budget cash'],
      ['💵', 'money budget cash'],
      ['📊', 'budget chart finance track'],
      ['🏦', 'bank save money'],
      ['⏰', 'time wake early alarm'],
    ],
  },
  {
    name: 'Mindset',
    items: [
      ['☀️', 'morning sun wake daily'],
      ['🌙', 'night evening moon'],
      ['🙏', 'gratitude pray thanks'],
      ['❤️', 'love heart relationship'],
      ['😊', 'mood happy smile'],
      ['🔥', 'streak fire hot motivation'],
      ['⭐', 'star favorite reward'],
      ['✅', 'done check complete'],
      ['🌱', 'grow sprout new habit'],
      ['🧊', 'cold shower ice'],
    ],
  },
]

// The compact set shown before the user taps "See more". Pulled from the
// groups above so there is one source of truth for the glyphs themselves.
export const QUICK_ICONS = [
  '💧', '🏋️', '📖', '🧘', '🏃', '🥗', '😴', '💊',
  '🎯', '📓', '🎸', '🧹', '🛒', '💰', '☀️', '🔥',
]

// Flat list with keywords, used to filter when the user searches.
export const ALL_ICONS = ICON_GROUPS.flatMap((g) =>
  g.items.map(([glyph, keywords]) => ({ glyph, keywords, group: g.name })),
)
