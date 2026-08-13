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
    const what = `${selector}  →  ${size[1]}px`
    findings.set(what, { what, where: `static: ${file.split(path.sep).join('/')}` })
  }
}

// ---- runtime pass ---------------------------------------------------------
//
// Swept at more than one viewport, because two different rules hold this line
// and only one of them holds it everywhere. `font: inherit` in base.css is the
// real guarantee and has no media query; the explicit 16px in responsive.css is
// a backstop that lives inside `@media (max-width: 720px)`. A phone in
// landscape is past that breakpoint — 734px and 814px on these two devices — so
// it runs with the backstop off and `font: inherit` alone. Auditing portrait
// only, which this did for its whole life, never once looked at the width where
// a `font-size` override would go unopposed.
const VIEWPORTS = ['iPhone 14 Pro', 'iPhone 14 Pro landscape', 'iPhone 14 Pro Max landscape']

const browser = await chromium.launch({ channel: 'chrome', headless: true })

for (const deviceName of VIEWPORTS) {
  const device = devices[deviceName]
  // Width is what selects the CSS, so lead the label with it: "under 16px" is
  // a different bug at 393 (both rules failed) than at 814 (only one did).
  const at = `${device.viewport.width}px ${deviceName}`
  const ctx = await browser.newContext({ ...device })
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
    // Keyed by control *and* viewport: the same field can be fine in portrait
    // and wrong in landscape, and collapsing those two would report the pair as
    // one finding at whichever width happened to run first.
    for (const b of bad) {
      const key = `${at}|${b}`
      if (!findings.has(key)) findings.set(key, { what: b, where: `${at} · ${where}` })
    }
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

  // Expand disclosures so fields that start hidden are measured too.
  const expandDisclosures = async () => {
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
  }

  // Every form the shell can open — but *how* you open them is the shell's
  // choice, and this walk has to follow it. The phone shell stacks them behind
  // the FAB's cross-create sheet. Above 720px there is no FAB: an iPhone in
  // landscape is past the breakpoint and gets the desktop sidebar, so the same
  // forms are reached through each view's own "New …" button. Asking only for
  // the FAB would skip every form at precisely the widths this sweep exists to
  // cover — and would do it by crashing, which is at least honest.
  if (await page.locator('.fab').count()) {
    await page.click('.fab')
    await page.waitForTimeout(500)
    const names = await page.$$eval('.sheet-item', (els) => els.map((e) => e.textContent.trim()))
    // Escape rather than a tap at fixed coordinates: the sheet is bottom-anchored
    // and grows with the viewport, so a hardcoded point that lands on the backdrop
    // in portrait is not guaranteed to in a 343px-tall landscape.
    await page.keyboard.press('Escape')
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
      await expandDisclosures()
      await scan(`form: ${names[i]}`)
    }
  } else {
    // Matched on the accessible name rather than a hardcoded list, so a view
    // that grows a new create button is covered without editing this script.
    for (const r of ROUTES) {
      await page.goto(`${BASE}/#/${r}`)
      await page.waitForTimeout(500)
      const label = await page.$$eval('button', (els) =>
        els
          .map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim())
          .find((t) => /^(new|add)\s/i.test(t)),
      )
      if (!label) continue
      await page
        .getByRole('button', { name: label })
        .first()
        .click({ timeout: 2000 })
        .catch(() => {})
      await page.waitForTimeout(700)
      if (!(await page.locator('.modal, .sheet').count())) continue
      await expandDisclosures()
      await scan(`form: ${label}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
    }
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

  await ctx.close()
}

await browser.close()

if (!findings.size) {
  console.log('Clean: every text control is at least 16px — no iOS focus zoom.')
  process.exit(0)
}
console.log(`${findings.size} control(s) under 16px — iOS will zoom the page on focus:\n`)
const byWhere = new Map()
for (const { what, where } of findings.values()) {
  if (!byWhere.has(where)) byWhere.set(where, [])
  byWhere.get(where).push(what)
}
for (const [where, list] of byWhere) {
  console.log(`  ${where}`)
  for (const l of list) console.log(`    ${l}`)
}
process.exit(1)
