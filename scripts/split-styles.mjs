// One-shot migration: split the monolithic src/styles.css into src/styles/.
//
// The split is by *contiguous* runs of the original file, so concatenating the
// results in @import order reproduces the original byte-for-byte (the script
// asserts this). That matters: CSS is order-dependent, and a re-ordered split
// would silently change which rule wins.
//
// Kept in the repo as the record of how the split was derived, not as something
// to run again.
import fs from 'fs'
import path from 'path'

const SRC = 'src/styles.css'
const OUT = 'src/styles'

// [startLine (1-based, inclusive), relative path]. Ends where the next begins.
const SPLITS = [
  [1, 'tokens.css'],
  [134, 'base.css'],
  [290, 'shell/install-hint.css'],
  [316, 'shell/badges.css'],
  [370, 'primitives/switch.css'],
  [407, 'primitives/tier-chips.css'],
  [434, 'shell/layout.css'],
  [482, 'shell/sidebar.css'],
  [594, 'primitives/page-header.css'],
  [823, 'primitives/typography.css'],
  [873, 'features/people-index.css'],
  [1031, 'primitives/search-field.css'],
  [1067, 'primitives/segmented.css'],
  [1117, 'primitives/filter-pills.css'],
  [1229, 'primitives/list.css'],
  [1337, 'primitives/avatar.css'],
  [1476, 'primitives/chips.css'],
  [1606, 'features/habits.css'],
  [2372, 'primitives/swipe-row.css'],
  [2503, 'features/entity-detail.css'],
  [2588, 'features/lists.css'],
  [2940, 'features/tasks.css'],
  [3479, 'primitives/forms.css'],
  [3732, 'primitives/modal.css'],
  [3764, 'primitives/confirm-dialog.css'],
  [3883, 'primitives/pull-to-refresh.css'],
  [3943, 'primitives/banners.css'],
  [4094, 'features/auth.css'],
  [4566, 'features/legal.css'],
  [4647, 'features/relationships.css'],
  [4668, 'features/import-export.css'],
  [4692, 'shell/tabbar.css'],
  [4774, 'primitives/sheet.css'],
  [4874, 'responsive.css'],
  [5009, 'primitives/assignee-picker.css'],
  [5072, 'primitives/reorderable.css'],
  [5105, 'features/project-headings.css'],
  [5148, 'primitives/disclosure.css'],
  [5173, 'primitives/toast.css'],
  [5246, 'shell/view-transitions.css'],
  [5298, 'features/quick-find.css'],
  [5573, 'features/people-map.css'],
  [5815, 'features/projects.css'],
]

const lines = fs.readFileSync(SRC, 'utf8').split('\n')
const chunks = SPLITS.map(([start, file], i) => {
  const end = i + 1 < SPLITS.length ? SPLITS[i + 1][0] - 1 : lines.length
  return { file, body: lines.slice(start - 1, end).join('\n') }
})

// Round-trip guard: the concatenated bodies must equal the original.
const rejoined = chunks.map((c) => c.body).join('\n')
if (rejoined !== lines.join('\n')) {
  console.error('Split is lossy — aborting.')
  process.exit(1)
}

for (const { file, body } of chunks) {
  const dest = path.join(OUT, file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, body.replace(/^\n+/, '').replace(/\n+$/, '') + '\n')
}

const index = `/* Salernidex stylesheet index.

   @import order is the cascade, so it is deliberate and mirrors the original
   single-file order: tokens, then base, then primitives, then features, with
   the responsive overrides sitting exactly where they did before.

   Adding styles: a shared control goes in primitives/ (and needs a component in
   components/ui/ to match); a screen's own styling goes in features/. Nothing
   here should hardcode a color, radius, easing, z-index or chrome offset —
   those all live in tokens.css. */

${chunks.map((c) => `@import './${c.file}';`).join('\n')}
`
fs.writeFileSync(path.join(OUT, 'index.css'), index)
console.log(`Wrote ${chunks.length} files + index.css`)
