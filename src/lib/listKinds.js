// What kind of list this is, and what that implies — in one table.
//
// There are four now, and before this file the answer to "does this kind have
// checkboxes / a due date / a default icon" was a ternary chain copied into
// five components, each of which had to be found and extended by hand every
// time a kind was added. The chain in ListsView and the two in ProjectDetail
// had already drifted: they still resolved 'meal_plan' to 📝.
//
// So the table is the source of truth and the predicates below are how the rest
// of the app asks. Adding a fifth kind is one entry here plus a migration.
//
//   standard    a checklist. Sections, check-off, the original.
//   grocery     a checklist that files itself into aisles (0019).
//   meal_plan   items indexed by day rather than order (0037).
//   collection  things you're keeping, not doing (0038).
//
// 'collection' is the odd one and the reason this file exists. A list of
// favourite restaurants is not a checklist — you never "complete" a restaurant
// — but it isn't a note either: it's rows you add to, reorder, and annotate.
// So it keeps every list affordance EXCEPT the two that imply doing: no
// checkbox, and no due date.

export const STANDARD = 'standard'
export const GROCERY = 'grocery'
export const MEAL_PLAN = 'meal_plan'
export const COLLECTION = 'collection'

// Order matters: this drives the Type picker in ListForm.
export const LIST_KINDS = [
  {
    value: STANDARD,
    label: 'Standard',
    icon: '📝',
    hint: 'A plain checklist you can split into sections.',
    // Can its items be checked off? The one axis a collection differs on.
    checkable: true,
    // Can the LIST carry a due date + reminder? A meal plan is seven separate
    // days and a collection is never due, so "get it all by Friday" is
    // meaningless on both.
    dueable: true,
    // Do open items count toward the "N left" the Lists nav and index show?
    counts: true,
    addPlaceholder: 'Add an item…',
  },
  {
    value: GROCERY,
    label: 'Grocery',
    icon: '🛒',
    hint: 'Items sort into aisles automatically.',
    checkable: true,
    dueable: true,
    counts: true,
    addPlaceholder: 'Add an item…',
  },
  {
    value: MEAL_PLAN,
    label: 'Meals',
    icon: '🍽️',
    hint: "Meals laid out by day. Write the ingredients in a meal's note and send them to a grocery list.",
    checkable: true,
    dueable: false,
    counts: true,
    addPlaceholder: 'Add a meal…',
  },
  {
    value: COLLECTION,
    label: 'Collection',
    icon: '⭐',
    hint: "Things you're keeping rather than doing: favourite restaurants, wines you liked, films to remember. No checkboxes.",
    checkable: false,
    dueable: false,
    // A collection is never "done", so counting its rows as outstanding work
    // would park a permanent 40 on the Lists tab that nothing can ever clear.
    counts: false,
    addPlaceholder: 'Add to the list…',
  },
]

const BY_VALUE = Object.fromEntries(LIST_KINDS.map((k) => [k.value, k]))

// Unknown or missing kind resolves to standard — a row written by a newer
// client than this one must render as something rather than crash.
export function kindOf(list) {
  return BY_VALUE[list?.kind] || BY_VALUE[STANDARD]
}

export const isGrocery = (list) => list?.kind === GROCERY
export const isMealPlan = (list) => list?.kind === MEAL_PLAN
export const isCollection = (list) => list?.kind === COLLECTION

export const isCheckable = (list) => kindOf(list).checkable
export const isDueable = (list) => kindOf(list).dueable
export const countsAsOpen = (list) => kindOf(list).counts

// The list's own emoji, or its kind's default.
export const listIcon = (list) => list?.icon || kindOf(list).icon

// One item is outstanding if its list counts at all, it isn't a section
// heading, and it hasn't been checked.
//
// The index already got this right via listItems.openCountsByList; the sidebar
// badge did not — it counted every unchecked row in the household, headings
// included. Both now answer the same question, and a collection answers zero.
export function isOpenItem(item, list) {
  return countsAsOpen(list) && !item.is_heading && !item.checked_at
}
