// Mobile chrome + touch-target audit.
//
// Two classes of bug this catches, both of which shipped once and are easy to
// re-introduce by hand-typing a bottom offset or a button size:
//   1. Occlusion — the floating tab pill, the FAB or a docked composer sitting
//      on top of a control the user is meant to tap.
//   2. Touch targets under the 44px HIG minimum (measured through the
//      .tap-target hit-area extension, not just the painted box).
//
// Run against a dev server: node scripts/mobile-audit.mjs [baseUrl]
// Exits non-zero if anything is occluded or undersized.
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
  'notes',
  'settings',
  'activity',
]
// Chrome that floats over content, and is therefore allowed to overlap only
// non-interactive things.
const CHROME = ['.tabbar', '.fab', '.list-add-dock']

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Explore the demo' }).click()
await page.waitForSelector('.large-title')

const audit = () =>
  page.evaluate((CHROME) => {
    const out = { occluded: [], small: [] }
    const chrome = CHROME.map((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      if (cs.opacity === '0' || cs.visibility === 'hidden') return null
      return [sel, el, el.getBoundingClientRect()]
    }).filter(Boolean)

    const controls = [
      ...document.querySelectorAll(
        'button, a[href], input, select, textarea, [role="button"], .list-row[onclick], .list-row',
      ),
    ]
    // The A–Z scrubber is a drag strip, not 27 buttons — 44px per letter would
    // be 1,188px tall. iOS Contacts sizes its index exactly this way.
    //
    // .qty-input is the text field *inside* the quantity Stepper. Its two
    // neighbours are the real controls and they tap at 44; extending the field
    // to match would push its hit area over theirs, which is the adjacency bug
    // this audit exists to catch. Typing a custom quantity is the rare path.
    // UIStepper is 29pt for the same reason.
    //
    // .sr-only subtrees are screen-reader-only by construction: clipped to a
    // pixel, never painted, never tapped by a sighted user. They're the fix
    // for gesture-only actions (swipe rows), so measuring them as touch
    // targets would penalise exactly the accessibility work that puts them
    // there. They can't be caught by the computed-style check below either —
    // staying out of display:none/visibility:hidden is the entire point.
    const EXEMPT = '.alpha-index-letter, .qty-input'
    for (const el of controls) {
      if (el.matches(EXEMPT) || el.closest('.sr-only')) continue
      const r = el.getBoundingClientRect()
      // Fully in view only: a control half-scrolled under the sticky search bar
      // isn't undersized, it's just partly off-screen.
      if (!r.width || !r.height || r.top < 0 || r.bottom > innerHeight) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
      const name = (el.getAttribute('aria-label') || el.textContent || el.tagName)
        .trim()
        .slice(0, 34)

      // Effective tap area, measured by hit-testing rather than by reading CSS:
      // a ::before/::after hit extension only counts if a tap there actually
      // lands on the control. Sample the corners of a centered 40px box (a
      // little inside 44 to dodge rounding) and require all four to hit.
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      // Probe the axis extremes, not the corners: round buttons are the iOS
      // norm and the corners of a 44px square fall outside a 44px circle, so
      // corner probes would fail every correctly-sized round control.
      // A probe that lands on sticky or fixed chrome says nothing about the
      // control's own size — the first row under the sticky search bar always
      // loses the top of its extension, at every scroll position, however big
      // the button is. Drop those the way off-screen probes are dropped;
      // chrome that genuinely covers a control is the occlusion check's job.
      const onFloatingChrome = (node) => {
        for (let n = node; n && n !== document.body; n = n.parentElement) {
          if (el === n || el.contains(n)) return false
          // ...and the control's own container being sticky says nothing about
          // it either. Without this the exemption ate every probe for anything
          // living *inside* sticky chrome — which is how ten 38x34 buttons in
          // the notes formatting toolbar passed this audit for its whole life.
          if (n.contains(el)) return false
          const pos = getComputedStyle(n).position
          if (pos === 'fixed' || pos === 'sticky') return true
        }
        return false
      }
      const probes = [
        [cx - 20, cy],
        [cx + 20, cy],
        [cx, cy - 20],
        [cx, cy + 20],
      ].filter(([x, y]) => {
        if (!(x > 0 && y > 0 && x < innerWidth && y < innerHeight)) return false
        const hit = document.elementFromPoint(x, y)
        return !hit || !onFloatingChrome(hit)
      })
      const hits = probes.filter(([x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return hit && (hit === el || el.contains(hit) || hit.contains(el))
      })
      // Wide row-like controls (segmented control, list rows, search fields) are
      // allowed to be shorter — UISegmentedControl itself is 32pt tall. The rule
      // is: 44 in both dimensions, unless it's ≥120px wide and ≥34px tall.
      // Compare on the same rounded numbers the report prints, or a 119.53px
      // button fails the >=120 test and then logs as "120x38", which reads like
      // a bug in the audit and gets ignored.
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      const wideEnough = w >= 120 && h >= 34
      if (probes.length && hits.length < probes.length && !wideEnough) {
        out.small.push(`${el.className || el.tagName} "${name}" ${w}x${h}`)
      }

      for (const [sel, cel, cr] of chrome) {
        if (el === cel || cel.contains(el) || el.contains(cel)) continue
        const ox = Math.min(r.right, cr.right) - Math.max(r.left, cr.left)
        const oy = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top)
        // A row is allowed to slide under translucent chrome; a *control* isn't.
        const isRow = el.classList.contains('list-row')
        if (ox > 8 && oy > 8 && !isRow) {
          out.occluded.push(`${sel} covers ${el.className || el.tagName} "${name}"`)
        }
      }
    }
    return out
  }, CHROME)

let failures = 0
// Occlusion is only a *bug* when the user can't scroll the control clear of the
// chrome — that is, at the very bottom of the page. Anything overlapping
// mid-scroll is just content passing under translucent chrome, which is fine.
// So: scroll to the end, then force the FAB visible (it auto-tucks on
// scroll-down) and check what's left underneath.
const settleAtBottom = async () => {
  await page.evaluate(() => {
    const m = document.querySelector('.main')
    if (m) m.scrollTop = m.scrollHeight
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => document.querySelector('.fab')?.classList.remove('tucked'))
  await page.waitForTimeout(300)
}

for (const r of ROUTES) {
  await page.goto(`${BASE}/#/${r}`)
  await page.waitForTimeout(600)
  await settleAtBottom()
  const a = await audit()
  const occ = [...new Set(a.occluded)]
  const small = [...new Set(a.small)]
  if (occ.length || small.length) {
    console.log(`\n/${r || 'today'}`)
    if (occ.length) console.log('  OCCLUDED CONTROL:\n    ' + occ.join('\n    '))
    if (small.length) console.log('  UNDER 44px:\n    ' + small.join('\n    '))
    failures += occ.length + small.length
  }
}

// List detail carries its own docked composer instead of the FAB.
await page.goto(`${BASE}/#/lists`)
await page.waitForTimeout(500)
await page.locator('.list-row').first().click()
await page.waitForTimeout(700)
await settleAtBottom()
const a = await audit()
const occ = [...new Set(a.occluded)]
const small = [...new Set(a.small)]
if (occ.length || small.length) {
  console.log('\n/list/<id>')
  if (occ.length) console.log('  OCCLUDED CONTROL:\n    ' + occ.join('\n    '))
  if (small.length) console.log('  UNDER 44px:\n    ' + small.join('\n    '))
  failures += occ.length + small.length
}

// ---- expanded states -------------------------------------------------------
//
// Everything above only ever sees a screen at rest. The controls that drifted
// smallest were the ones behind a tap: the list quantity stepper shipped at
// 30px with no hit extension and no audit ever saw it, because opening an
// inline editor was never part of the walk. Anything reachable by one tap from
// a resting screen belongs in the sweep.
const expanded = [
  {
    name: '/list/<id> item editor',
    go: async () => {
      await page.goto(`${BASE}/#/lists`)
      await page.waitForTimeout(500)
      await page.locator('.list-row').first().click()
      await page.waitForTimeout(700)
      await page.locator('.list-row .row-body').first().click()
      await page.waitForSelector('.list-row.editing', { timeout: 4000 })
      await page.waitForTimeout(400)
    },
  },
  {
    name: '/tasks expanded task',
    go: async () => {
      await page.goto(`${BASE}/#/tasks`)
      await page.waitForTimeout(600)
      await page.locator('.list-row .row-body').first().click()
      await page.waitForTimeout(600)
    },
  },
  {
    // The formatting toolbar's ten buttons shipped at 38x34 and no run of this
    // ever saw them — partly because /notes wasn't in ROUTES, and partly
    // because the probe drops any sample that lands on sticky or fixed chrome
    // and the toolbar is itself sticky, which swallowed all four. That
    // exemption is right for a row half-under a sticky search bar and wrong
    // for a control *inside* the sticky thing; see onFloatingChrome, which now
    // only bails when the sticky ancestor isn't the control's own container.
    name: '/note/<id> editor',
    go: async () => {
      await page.goto(`${BASE}/#/notes`)
      await page.waitForTimeout(600)
      await page.locator('.note-row').first().click()
      // The bar only exists while the editor has focus — unfocused there's no
      // selection for it to act on, so on touch it isn't rendered at all. Tap
      // in, or this walk sees a note with no toolbar to measure.
      await page.locator('.note-editable').click()
      await page.waitForSelector('.note-toolbar', { timeout: 4000 })
      await page.waitForTimeout(400)
    },
  },
]

for (const state of expanded) {
  try {
    await state.go()
  } catch {
    console.log(`\n${state.name}\n  SKIPPED (could not reach it)`)
    continue
  }
  // Tap targets only. Occlusion is judged at the bottom of the scroll (see
  // settleAtBottom) because anything overlapping mid-scroll can just be
  // scrolled clear — and scrolling with an editor open blurs it shut, so the
  // resting position can't be reached here. Sizes don't depend on scroll.
  const r = await audit()
  const s = [...new Set(r.small)]
  if (s.length) {
    console.log(`\n${state.name}`)
    console.log('  UNDER 44px:\n    ' + s.join('\n    '))
    failures += s.length
  }
}

await browser.close()
console.log(
  failures ? `\n${failures} issue(s).` : '\nClean: no occluded controls, no target under 44px.',
)
process.exit(failures ? 1 : 0)
