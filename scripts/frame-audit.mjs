// Layout + framing audit: every route, on every phone shape we care about.
//
// The sibling audits check controls (mobile-audit: occlusion and 44px targets;
// ios-zoom: font sizes; hover: pointer-only affordances). This one checks the
// FRAME — the box the page is drawn into:
//
//   1. Horizontal overflow — anything wider than the viewport. On iOS this
//      doesn't show up as a scrollbar, it zooms the whole page out to fit and
//      then every fixed element measures against a viewport that is suddenly
//      bigger than the screen (see the note on .main's min-width in layout.css).
//   2. The top inset — no control may sit in the notch / Dynamic Island band.
//   3. The bottom inset — same for the home indicator.
//   4. Reach — with the page scrolled all the way down, the last row still has
//      to clear the floating tab bar.
//
// Why this exists as its own script: env(safe-area-inset-*) is ZERO in a
// browser tab and in plain device emulation, so every inset bug in the app is
// invisible until it's installed on a real notched phone. Chrome's
// Emulation.setSafeAreaInsetsOverride gives us the real numbers in headless.
// The Back-in-the-Dynamic-Island bug (navbar.css) shipped precisely because
// nothing here could see it.
//
// Run against a dev server: node scripts/frame-audit.mjs [baseUrl]
// Exits non-zero if any device/route pairing has a finding.
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'

// Portrait phones, narrowest to widest, plus the two shapes that aren't a
// portrait phone at all: a landscape phone (which crosses the 720px breakpoint
// into the desktop layout, with side insets) and a small tablet.
const DEVICES = [
  // Android's narrowest common width. No insets: the system bars are their own
  // strip outside the web view.
  { name: 'Galaxy S8 · 360', w: 360, h: 740, dpr: 3, insets: { top: 0, bottom: 0 } },
  // The smallest iPhone still sold, and the only one with a home button — no
  // insets, but the shortest viewport of the set.
  { name: 'iPhone SE · 375', w: 375, h: 667, dpr: 2, insets: { top: 0, bottom: 0 } },
  { name: 'iPhone 13 mini · 375', w: 375, h: 812, dpr: 3, insets: { top: 50, bottom: 34 } },
  { name: 'iPhone 14 Pro · 393', w: 393, h: 852, dpr: 3, insets: { top: 59, bottom: 34 } },
  { name: 'iPhone 15 Pro Max · 430', w: 430, h: 932, dpr: 3, insets: { top: 62, bottom: 34 } },
  { name: 'Pixel 7 · 412', w: 412, h: 915, dpr: 2.6, insets: { top: 24, bottom: 24 } },
  // Landscape: the island moves to the left edge, and 852 wide is past the
  // 720px breakpoint, so this is the desktop layout on a phone-height screen.
  {
    name: 'iPhone 14 Pro · landscape',
    w: 852,
    h: 393,
    dpr: 3,
    insets: { top: 0, bottom: 21, left: 59, right: 59 },
  },
  { name: 'iPad mini · 744', w: 744, h: 1133, dpr: 2, insets: { top: 24, bottom: 20 } },
]

// Top-level routes, then the detail screens — whose ids we discover from the
// demo data at startup, because a hardcoded id rots the first time the seed
// changes.
const TOP_ROUTES = [
  '',
  'tasks',
  'projects',
  'reminders',
  'lists',
  'habits',
  'notes',
  'people',
  'groups',
  'orgs',
  'relationships',
  'activity',
  'settings',
  'import',
  'areas',
  'privacy',
  'terms',
]

// index route → the detail hash you reach by opening its first row.
const DETAIL_FROM = [
  ['tasks', 'task'],
  ['projects', 'project'],
  ['lists', 'list'],
  ['notes', 'note'],
  ['people', 'person'],
  ['orgs', 'org'],
  ['groups', 'group'],
  ['habits', 'habit'],
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })

// ── Discover detail ids once, on a plain phone ───────────────────────────────
const seed = await browser.newContext({ viewport: { width: 393, height: 852 } })
const seedPage = await seed.newPage()
await seedPage.goto(BASE, { waitUntil: 'networkidle' })
await seedPage.getByRole('button', { name: 'Explore the demo' }).click()
await seedPage.waitForSelector('.large-title')

const detailRoutes = []
for (const [index, detail] of DETAIL_FROM) {
  try {
    await seedPage.goto(`${BASE}/#/${index}`, { waitUntil: 'networkidle' })
    await seedPage.waitForTimeout(250)
    // The first tappable row on the index page, whatever that page calls it.
    const row = seedPage.locator('.list-row, .task-row, .note-card, .pressable-row').first()
    await row.click({ timeout: 4000 })
    await seedPage.waitForTimeout(350)
    const hash = await seedPage.evaluate(() => location.hash.replace(/^#\//, ''))
    if (hash.startsWith(detail + '/')) detailRoutes.push(hash)
    else if (hash && hash !== index) detailRoutes.push(hash)
  } catch {
    // A page with nothing in it on this seed — nothing to frame, so nothing to
    // check. Silent: an empty Habits list is not a layout finding.
  }
}
await seed.close()

const ROUTES = [...TOP_ROUTES, ...detailRoutes]

// ── The measurement, run inside the page ─────────────────────────────────────
const measure =
  (insets) =>
  ({ top = 0, bottom = 0, left = 0, right = 0 }) => {
    const out = { overflow: [], topBand: [], bottomBand: [], sideBand: [], buried: [] }
    const vw = innerWidth
    const vh = innerHeight

    // 1 ── Horizontal overflow. An element inside a deliberate horizontal
    // scroller (the area lens, the tag row) is allowed to run past the edge —
    // that's what the scroller is for. Everything else is a bug.
    const inScroller = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
      }
      return false
    }
    if (document.documentElement.scrollWidth > vw + 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        if (r.right <= vw + 1 && r.left >= -1) continue
        if (inScroller(el)) continue
        // Report the outermost offender only: its children inherit the width.
        if (el.parentElement && !inScroller(el.parentElement)) {
          const p = el.parentElement.getBoundingClientRect()
          if (p.right > vw + 1 || p.left < -1) continue
        }
        out.overflow.push(
          `${el.className || el.tagName} ${Math.round(r.left)}…${Math.round(r.right)} of ${vw}`,
        )
      }
    }

    // 2 ── Controls in an inset band. Only *controls*: chrome is supposed to
    // paint its background up into the notch (that's what makes it read as
    // chrome) — what must never happen is a button or a field landing there,
    // where the island covers it and taps are unreliable.
    //
    // Two different questions, and conflating them buries the real bug in 400
    // lines of noise:
    //   • at rest (scrollY 0) every control must clear the bands — a page whose
    //     resting state puts a button in the island is broken outright;
    //   • scrolled, only FIXED/STICKY chrome is judged. Ordinary content
    //     travelling under the status bar is what scrolling is, and the check
    //     that it can be got back out from under the tab bar is `reach` below.
    const isChrome = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position
        if (pos === 'fixed' || pos === 'sticky') return true
      }
      return false
    }
    const atRest = scrollY <= 0
    const controls = [
      ...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]'),
    ].filter((el) => {
      if (el.closest('.sr-only')) return false
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false
      return atRest || isChrome(el)
    })
    const name = (el) =>
      `${el.className || el.tagName} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 26)}"`

    for (const el of controls) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      // Off-screen vertically = not on this screen, not a finding.
      if (r.bottom <= 0 || r.top >= vh) continue
      if (top && r.top < top) out.topBand.push(`${name(el)} top=${Math.round(r.top)} < ${top}`)
      // The bottom band is a chrome-only question even at rest: a row sitting
      // over the home indicator at scroll 0 is just a row you scroll up, and
      // whether you CAN is the `reach` check. Only something pinned there is
      // stuck there.
      if (bottom && r.bottom > vh - bottom && isChrome(el))
        out.bottomBand.push(`${name(el)} bottom=${Math.round(r.bottom)} > ${vh - bottom}`)
      // Sideways: skip anything living in a horizontal scroller. Its box can
      // legitimately sit past the screen edge — that's what "scrolled out of
      // view" looks like to getBoundingClientRect — and the container doing the
      // clipping is itself inside the safe area.
      if (!inScroller(el)) {
        if (left && r.left < left)
          out.sideBand.push(`${name(el)} left=${Math.round(r.left)} < ${left}`)
        if (right && r.right > vw - right)
          out.sideBand.push(`${name(el)} right=${Math.round(r.right)} > ${vw - right}`)
      }
    }
    return out
  }

// 3 ── Reach: scrolled to the bottom, is the last row still clear of the bar?
const reachCheck = () => {
  const bar = document.querySelector('.tabbar')
  if (!bar) return null
  const barTop = bar.getBoundingClientRect().top
  const rows = [...document.querySelectorAll('.list-row, .card, .task-row, .note-card')]
  const buried = rows
    .map((el) => [el, el.getBoundingClientRect()])
    .filter(([, r]) => r.height && r.top < innerHeight && r.bottom > barTop + 4)
    .map(
      ([el, r]) =>
        `${el.className} bottom=${Math.round(r.bottom)} under bar at ${Math.round(barTop)}`,
    )
  return buried.slice(0, 3)
}

const findings = []
for (const dev of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: dev.w, height: dev.h },
    deviceScaleFactor: dev.dpr,
    isMobile: dev.w <= 720,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 0, bottom: 0, left: 0, right: 0, ...dev.insets },
  })
  process.stdout.write(`  … ${dev.name}\n`)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Explore the demo' }).click()
  // The landing screen's own title is not .large-title on every shape, so wait
  // for the shell instead: .main is what every route renders into.
  await page.waitForSelector('.main', { timeout: 15000 })
  await page.waitForTimeout(300)

  for (const route of ROUTES) {
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(300)
    // The app remembers a scroll position per route, so arriving somewhere is
    // not the same as being at the top of it. Say so explicitly, or the
    // "at rest" pass silently measures wherever the last visit left off.
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForTimeout(200)
    const label = `${dev.name} · /${route || 'today'}`

    const at = async (tag) => {
      const r = await page.evaluate(measure(dev.insets), dev.insets)
      for (const [kind, list] of Object.entries(r)) {
        for (const item of list.slice(0, 3)) findings.push(`${label} [${kind}${tag}] ${item}`)
      }
    }
    await at('')
    // Scrolled: sticky chrome moves, and that's where the inset bugs live.
    await page.evaluate(() => scrollTo(0, 400))
    await page.waitForTimeout(250)
    await at(' scrolled')

    await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(250)
    const buried = await page.evaluate(reachCheck)
    for (const b of (buried || []).slice(0, 2)) findings.push(`${label} [reach] ${b}`)
  }
  await ctx.close()
}
await browser.close()

if (findings.length) {
  console.log(`${findings.length} finding(s):\n`)
  for (const f of findings) console.log('  ' + f)
  process.exit(1)
}
console.log(`Clean: ${DEVICES.length} devices × ${ROUTES.length} routes, no framing findings.`)
