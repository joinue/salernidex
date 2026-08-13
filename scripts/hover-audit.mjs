// Sticky-hover audit.
//
// iOS Safari applies :hover to whatever you tapped and *leaves it applied*
// until a tap lands somewhere else. An unguarded hover rule therefore doesn't
// read as "pointer feedback" on a phone — it reads as "this row is selected",
// on one arbitrary row, for as long as the user stays on the screen. Come back
// from a task via the edge-swipe and the row you opened is still tinted.
//
// The rule: every declaration that depends on :hover lives inside
// `@media (hover: hover)`. Touch feedback is :active's job, which is unguarded
// on purpose. A screen that reveals a control on hover (the swipe-row action
// cluster, the activity-row icons) pairs the query with a `hover: none`
// fallback that shows the control outright.
//
// Static, not runtime: a hover state is exactly what a crawler can't reach, and
// this is the same reason ios-zoom-audit.mjs keeps a static pass.
//
// Run: node scripts/hover-audit.mjs
// Exits non-zero if any :hover rule sits outside a pointer query.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', 'src', 'styles')

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.css')) files.push(p)
  }
})(ROOT)

// Strip comments so a `:hover` mentioned in prose isn't a finding, then walk
// the brace depth tracking which @media blocks we're inside.
const HOVER_QUERY = /@media[^{]*\(\s*hover\s*:\s*hover\s*\)/

const offenders = []
for (const file of files.sort()) {
  const src = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/\S/g, ' '))
  const rel = path.relative(path.join(ROOT, '..', '..'), file).replace(/\\/g, '/')

  const stack = [] // one entry per open brace: true if it's a hover-capable query
  let line = 1
  let selector = ''
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '\n') {
      line++
      selector += ' '
      continue
    }
    if (ch === '{') {
      const head = selector.trim()
      const isAt = head.startsWith('@')
      if (isAt) {
        stack.push(HOVER_QUERY.test(head))
      } else {
        if (/:hover\b/.test(head) && !stack.some(Boolean)) {
          offenders.push({ file: rel, line, selector: head.replace(/\s+/g, ' ').slice(0, 90) })
        }
        stack.push(false)
      }
      selector = ''
      continue
    }
    if (ch === '}') {
      stack.pop()
      selector = ''
      continue
    }
    if (ch === ';') {
      selector = ''
      continue
    }
    selector += ch
  }
}

if (offenders.length) {
  console.error(`\n${offenders.length} :hover rule(s) outside @media (hover: hover):\n`)
  for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.selector}`)
  console.error('\nWrap them in `@media (hover: hover) { … }`. Use :active for touch feedback.\n')
  process.exit(1)
}

console.log(`hover audit: clean (${files.length} stylesheets)`)
