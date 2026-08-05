// One-shot migration: raw markup -> the ui/ primitives, for the three patterns
// that were mechanically regular across the app.
//
//   <div className="section-label">X</div>  ->  <SectionLabel>X</SectionLabel>
//   <p className="empty">X</p>              ->  <EmptyState>X</EmptyState>
//   <p className="empty dots">X</p>         ->  <EmptyState loading>X</EmptyState>
//   <p className="empty-inline">X</p>       ->  <EmptyState inline>X</EmptyState>
//
// Only single-line, single-child occurrences are rewritten; anything with
// nested markup is left for a human, and the script reports what it skipped.
// Kept as the record of the migration, not to be run again.
import fs from 'fs'
import path from 'path'

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.jsx$/.test(p) ? [p] : []
  })

const uiPath = (from, name) => {
  let rel = path.relative(path.dirname(from), `src/components/ui/${name}`)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

const addImport = (src, from, name) => {
  if (new RegExp(`^import ${name} from`, 'm').test(src)) return src
  const lines = src.split('\n')
  const last = lines.reduce(
    (acc, l, i) =>
      l.startsWith("} from '") || (l.startsWith('import ') && /'$/.test(l.trim())) ? i : acc,
    -1,
  )
  lines.splice(last + 1, 0, `import ${name} from '${uiPath(from, name)}'`)
  return lines.join('\n')
}

const skipped = []
let changed = 0

for (const file of walk('src')) {
  if (file.includes('/components/ui/')) continue
  const before = fs.readFileSync(file, 'utf8')
  let src = before
  const needs = new Set()

  src = src.replace(
    /<div className="section-label">([^<>{}]*(?:\{[^{}]*\}[^<>{}]*)*)<\/div>/g,
    (whole, inner) => {
      if (inner.includes('\n')) return whole
      needs.add('SectionLabel')
      return `<SectionLabel>${inner}</SectionLabel>`
    },
  )

  src = src.replace(
    /<p className="empty( dots| empty-inline)?">([^<>]*(?:\{[^{}]*\}[^<>]*)*)<\/p>/g,
    (whole, mod, inner) => {
      if (inner.includes('\n')) return whole
      needs.add('EmptyState')
      const prop = mod === ' dots' ? ' loading' : ''
      return `<EmptyState${prop}>${inner}</EmptyState>`
    },
  )

  src = src.replace(
    /<p className="empty-inline">([^<>]*(?:\{[^{}]*\}[^<>]*)*)<\/p>/g,
    (whole, inner) => {
      if (inner.includes('\n')) return whole
      needs.add('EmptyState')
      return `<EmptyState inline>${inner}</EmptyState>`
    },
  )

  for (const m of before.matchAll(/className="(section-label|empty|empty-inline)"/g)) {
    if (!src.includes(m[0])) continue
    skipped.push(`${file}: ${m[0]} (multi-line or nested)`)
  }

  for (const name of needs) src = addImport(src, file, name)
  if (src !== before) {
    fs.writeFileSync(file, src)
    changed++
  }
}

console.log(`Rewrote ${changed} files.`)
if (skipped.length) {
  console.log(`\nLeft for review (${skipped.length}):`)
  for (const s of [...new Set(skipped)]) console.log('  ' + s)
}
