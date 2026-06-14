// Grocery aisle categorization. A grocery list groups its items by aisle so the
// shopping order matches the store, not the order things were tossed in.
// categorize() guesses an aisle from the item text via a keyword map; the guess
// is stored on list_items.category and the user can override it per item.
// Pure + data-driven, so it's easy to test and extend.

// Aisles in a sensible shopping order (perimeter first, then center, then
// non-food). 'Other' is the catch-all and always sorts last.
export const AISLES = [
  'Produce',
  'Bakery',
  'Deli',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Frozen',
  'Pantry',
  'Snacks',
  'Beverages',
  'Household',
  'Personal Care',
  'Other',
]

export const OTHER = 'Other'

// keyword → aisle. Lowercase; matched with a leading word boundary so plurals
// work ("apple" → "apples") without "ham" lighting up inside "graham".
const KEYWORDS = {
  Produce: [
    'apple',
    'banana',
    'lettuce',
    'spinach',
    'tomato',
    'onion',
    'garlic',
    'potato',
    'carrot',
    'pepper',
    'broccoli',
    'avocado',
    'lemon',
    'lime',
    'berry',
    'berries',
    'grape',
    'cucumber',
    'celery',
    'mushroom',
    'kale',
    'cilantro',
    'herb',
    'salad',
    'fruit',
    'veggie',
    'vegetable',
  ],
  Bakery: [
    'bread',
    'bagel',
    'baguette',
    'roll',
    'bun',
    'tortilla',
    'muffin',
    'croissant',
    'pita',
    'cake',
    'pastry',
  ],
  Deli: ['deli', 'salami', 'prosciutto', 'hummus', 'lunch meat'],
  'Meat & Seafood': [
    'chicken',
    'beef',
    'pork',
    'steak',
    'bacon',
    'sausage',
    'turkey',
    'fish',
    'salmon',
    'shrimp',
    'tuna',
    'ground meat',
  ],
  'Dairy & Eggs': ['milk', 'cheese', 'butter', 'yogurt', 'egg', 'cream', 'sour cream', 'cottage'],
  Frozen: ['frozen', 'ice cream', 'popsicle', 'pizza'],
  Pantry: [
    'rice',
    'pasta',
    'flour',
    'sugar',
    'oil',
    'vinegar',
    'sauce',
    'bean',
    'soup',
    'cereal',
    'oatmeal',
    'oats',
    'peanut butter',
    'jam',
    'honey',
    'spice',
    'salt',
    'broth',
    'stock',
    'canned',
    'ketchup',
    'mustard',
    'mayo',
    'noodle',
  ],
  Snacks: [
    'chip',
    'cracker',
    'cookie',
    'candy',
    'chocolate',
    'popcorn',
    'pretzel',
    'nut',
    'granola',
    'snack',
  ],
  Beverages: [
    'water',
    'juice',
    'soda',
    'coffee',
    'tea',
    'beer',
    'wine',
    'cola',
    'seltzer',
    'drink',
  ],
  Household: [
    'paper towel',
    'toilet paper',
    'dish soap',
    'detergent',
    'trash bag',
    'foil',
    'wrap',
    'sponge',
    'cleaner',
    'bleach',
    'napkin',
    'battery',
    'light bulb',
  ],
  'Personal Care': [
    'shampoo',
    'soap',
    'toothpaste',
    'toothbrush',
    'deodorant',
    'razor',
    'lotion',
    'sunscreen',
    'tampon',
    'floss',
    'conditioner',
    'vitamin',
  ],
}

// Specific aisles before generic ones so "ice cream" → Frozen (not Dairy via
// "cream"), "peanut butter" → Pantry (not Dairy via "butter").
const PRECEDENCE = [
  'Frozen',
  'Bakery',
  'Deli',
  'Personal Care',
  'Household',
  'Meat & Seafood',
  'Snacks',
  'Beverages',
  'Pantry',
  'Dairy & Eggs',
  'Produce',
]

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hits = (text, kw) => new RegExp('\\b' + escapeRegExp(kw)).test(text)

// Best-guess aisle for an item's text. Returns OTHER when nothing matches.
export function categorize(text) {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return OTHER
  for (const aisle of PRECEDENCE) {
    if ((KEYWORDS[aisle] || []).some((kw) => hits(t, kw))) return aisle
  }
  return OTHER
}

// Group items into aisles in canonical shopping order, skipping empty aisles.
// An item's stored category wins; anything missing/unknown falls to Other.
// Returns [{ aisle, items }].
export function groupByAisle(items) {
  const byAisle = new Map()
  for (const it of items) {
    const aisle = it.category && AISLES.includes(it.category) ? it.category : OTHER
    if (!byAisle.has(aisle)) byAisle.set(aisle, [])
    byAisle.get(aisle).push(it)
  }
  return AISLES.filter((a) => byAisle.has(a)).map((a) => ({ aisle: a, items: byAisle.get(a) }))
}
