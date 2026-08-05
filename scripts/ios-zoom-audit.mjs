// iOS focus-zoom audit.
//
// Safari on iOS zooms the whole page when a text control smaller than 16px
// takes focus, and it does not zoom back out. The layout shifts under the
// user's thumb mid-typing, which is the single most obvious "this is a website"
// tell in an app that otherwise reads as native.
//
// The rule is easy to hold and easy to lose: eleven controls had drifted to
// between 13.5px and 15px, two of them dropdowns, while every .field input
// stayed correct.
//
// Two passes, because neither is sufficient alone:
//
//   static  — every CSS rule that sets a sub-16px font-size on a selector that
//             resolves to a text control. Catches states the crawler can't
//             reach; the first version of this script was runtime-only and
//             reported "clean" while eight controls were still under 16px,
//             including the recurrence picker and the project notes editor.
//   runtime — getComputedStyle on the real elements across every route, every
//             form behind the FAB (including fields behind a "More options"
//             disclosure) and the detail screens. Catches sizes that come from
//             inheritance or a cascade the static pass can't see.
//
// Run against a dev server: node scripts/ios-zoom-audit.mjs [baseUrl]
// Exits non-zero if any focusable text control lands under 16px.
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const ROUTES = [
  '',
  'tasks',
  'projects',
  'people',
  'lists',
  'habits',
  'groups',
  'orgs',
  'relationships',
  'settings',
  'activity',
  'notes',
  'kitchen-sink',
]

// Only the types that actually zoom. Buttons, checkboxes, radios and ranges
// never take a text caret, so their size is a tap-target question instead —
// that one belongs to mobile-audit.mjs.
const ZOOMY = [
  'input:not([type=button]):not([type=submit]):not([type=reset])',
  ':not([type=checkbox]):not([type=radio]):not([type=range])',
  ':not([type=color]):not([type=file])',
  ', textarea, select, [contenteditable=""], [contenteditable="true"]',
].join('')

const findings = new Map()

// ---- static pass ----------------------------------------------------------
// Classes the JSX puts *directly* on an <input>/<textarea>/<select>. Listed
// explicitly rather than matched fuzzily, so a <p className="notes"> isn't
// reported as a zooming text field. Wrapper classes (.subtask-composer,
// .rec-interval, .account-form) are deliberately absent — their controls are
// already caught by the tag-name test, and naming the wrapper would flag the
// label's own smaller type.
const CONTROL_CLASSES = [
  'backfill-note',
  'list-edit-note',
  'qty-input',
  'project-notes-edit',
  'rec-select',
  'member-name-input',
  'filter-select',
  'note-title-input',
]
const cssFiles = []
;(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else if (p.endsWith('.css')) cssFiles.push(p)
  }
})('src/styles')

for (const file of cssFiles) {
  const css = fs.readFileSync(file, 'utf8')
  const rules = /([^{}]+)\{([^}]*)\}/g
  let m
  while ((m = rules.exec(css))) {
    const selector = m[1].trim().split('\n').pop().trim()
    const size = /font-size:\s*([0-9.]+)px/.exec(m[2])
    if (!size || parseFloat(size[1]) >= 15.995) continue
    const namesControl =
      /\b(input|textarea|select)\b/.test(selector) ||
      CONTROL_CLASSES.some((c) => selector.includes(`.${c}`))
    if (!namesControl) continue
    findings.set(`${selector}  →  ${size[1]}px`, `static: ${file.split(path.sep).join('/')}`)
  }
}

// ---- runtime pass ---------------------------------------------------------
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })

const scan = async (where) => {
  const bad = await page.evaluate((sel) => {
    const out = []
    for (const e of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(e)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      // Sub-pixel slack: 15.99px is a rounding artifact, not a 15px mistake.
      if (parseFloat(cs.fontSize) >= 15.995) continue
      const label =
        e.closest('.field')?.querySelector('.label, label')?.textContent?.trim() ||
        e.placeholder ||
        e.getAttribute('aria-label') ||
        e.name ||
        ''
      const cls = String(e.className).split(' ')[0] || '(no class)'
      out.push(
        `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ''} .${cls} "${label}" → ${cs.fontSize}`,
      )
    }
    return out
  }, ZOOMY)
  for (const b of bad) if (!findings.has(b)) findings.set(b, where)
}

const demoIn = async () => {
  const btn = page.getByRole('button', { name: 'Explore the demo' })
  if (await btn.count()) await btn.click()
  await page.waitForSelector('.large-title', { timeout: 10000 }).catch(() => {})
}

// The auth screen has inputs of its own, before there's a session.
await scan('auth screen')
await demoIn()

for (const r of ROUTES) {
  await page.goto(`${BASE}/#/${r}`)
  await page.waitForTimeout(500)
  await scan(`/${r || 'today'}`)
}

// Every form behind the FAB.
await page.click('.fab')
await page.waitForTimeout(500)
const names = await page.$$eval('.sheet-item', (els) => els.map((e) => e.textContent.trim()))
await page.mouse.click(196, 20) // tap the backdrop to dismiss
await page.waitForTimeout(300)

for (let i = 0; i < names.length; i++) {
  // A hash change doesn't unmount an open Modal, so reload for a clean slate —
  // which drops the in-memory demo session, hence the re-login.
  await page.goto(`${BASE}/#/`)
  await page.reload({ waitUntil: 'networkidle' })
  await demoIn()
  await page.waitForSelector('.fab', { timeout: 10000 }).catch(() => {})
  await page.click('.fab')
  await page.waitForTimeout(400)
  const item = page.locator('.sheet-item').nth(i)
  if (!(await item.count())) continue
  await item.click()
  await page.waitForTimeout(700)
  // Expand disclosures so fields that start hidden are measured too.
  for (const t of ['More options', 'More', 'Advanced']) {
    const d = page.getByRole('button', { name: t })
    if (await d.count()) {
      await d
        .first()
        .click({ timeout: 1500 })
        .catch(() => {})
      await page.waitForTimeout(300)
    }
  }
  await scan(`form: ${names[i]}`)
}

// Detail screens, which carry inline editors the list screens don't.
for (const route of ['lists', 'habits', 'notes', 'people', 'projects']) {
  await page.goto(`${BASE}/#/${route}`)
  await page.waitForTimeout(500)
  const row = page.locator('.list-row').first()
  if (await row.count()) {
    await row.click().catch(() => {})
    await page.waitForTimeout(800)
    await scan(`${route} detail`)
  }
}

await browser.close()

if (!findings.size) {
  console.log('Clean: every text control is at least 16px — no iOS focus zoom.')
  process.exit(0)
}
console.log(`${findings.size} control(s) under 16px — iOS will zoom the page on focus:\n`)
const byWhere = new Map()
for (const [what, where] of findings) {
  if (!byWhere.has(where)) byWhere.set(where, [])
  byWhere.get(where).push(what)
}
for (const [where, list] of byWhere) {
  console.log(`  ${where}`)
  for (const l of list) console.log(`    ${l}`)
}
process.exit(1)
