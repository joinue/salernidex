// Notes-on-a-phone audit: the chrome that has to move with the software
// keyboard, and the space the notebook spends before you see a note.
//
// The other audits can't cover this. Playwright has no software keyboard, so
// none of the geometry that matters here — where the nav bar and the formatting
// bar land, whether the @-mention picker clears them — is exercised by a normal
// run. This one installs a fake `visualViewport` at document start: the same
// shape as the real one, an EventTarget, with a mutable keyboard height.
// `window.__kb(px)` shrinks the visible band and fires resize + scroll, which
// is exactly the pair iOS gives us and all the app reads (useKeyboardOpen,
// useVisualBandTop, useVisualBandBottom).
//
// What it does NOT simulate: iOS panning the layout viewport to reveal the
// caret. Chromium leaves the page where it is. So a caret can sit under the
// docked bar here in a way it wouldn't on a device — which is useful, because
// the picker has to survive that case too, and this is the only place it
// happens on demand.
//
// Run against a dev server: node scripts/notes-keyboard-audit.mjs [baseUrl]
// Exits non-zero on any regression.
import { chromium, devices } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const KB = 336 // iPhone portrait keyboard, points

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.addInitScript(() => {
  const real = window.visualViewport
  const fake = new EventTarget()
  let kb = 0
  Object.defineProperties(fake, {
    height: { get: () => real.height - kb },
    width: { get: () => real.width },
    offsetTop: { get: () => real.offsetTop },
    offsetLeft: { get: () => real.offsetLeft },
    pageTop: { get: () => real.pageTop },
    scale: { get: () => real.scale },
  })
  real.addEventListener('resize', () => fake.dispatchEvent(new Event('resize')))
  real.addEventListener('scroll', () => fake.dispatchEvent(new Event('scroll')))
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true })
  window.__kb = (px) => {
    kb = px
    fake.dispatchEvent(new Event('resize'))
    fake.dispatchEvent(new Event('scroll'))
  }
  window.__band = () => ({
    top: fake.offsetTop,
    bottom: fake.offsetTop + fake.height,
  })
})

let failures = 0
const check = (ok, label, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}
const box = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, w: r.width, h: r.height }
  }, sel)
const y = () => page.evaluate(() => Math.round(window.scrollY))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Explore the demo' }).click()
  await page.waitForSelector('.large-title')
  await page.goto(`${BASE}/#/notes`)
  await page.waitForSelector('.notes-index')
  await page.waitForTimeout(300)

  // ---- The index spends its space on notes, not on controls ----
  const viewportH = page.viewportSize().height
  const firstRow = await box('.note-row')
  check(
    firstRow && firstRow.top < viewportH * 0.55,
    'a note is visible in the top half of the notebook',
    `first row at ${Math.round(firstRow?.top ?? -1)} of ${viewportH}`,
  )
  check(!(await page.$('.notes-page > .back-btn')), 'no back link above a top-level destination')
  check(
    (await page.$$('.header-action.neutral')).length === 2 &&
      !(await page.$('.header-action:not(.neutral)')),
    'one create button on the screen, in the bar',
  )
  check(
    Boolean(await page.$('[aria-label="Sort and layout"]')),
    'sort and layout are behind the header',
  )

  // Their sheet gives them room to be tapped.
  await page.locator('[aria-label="Sort and layout"]').click()
  await page.waitForSelector('.notes-options')
  const tall = await page.$$eval(
    '.notes-options .segment, .notes-options .notes-viewtoggle button',
    (els) => els.every((e) => e.getBoundingClientRect().height >= 44),
  )
  check(tall, 'the sort and layout controls clear 44px in the sheet')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)

  // ---- A gallery card is mostly its title ----
  await page.locator('[aria-label="Sort and layout"]').click()
  await page.waitForSelector('.notes-options')
  await page.locator('.notes-options [aria-label="Gallery view"]').click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const head = await box('.note-card-head')
  const title = await box('.note-card-title')
  check(
    title && head && title.w / head.w > 0.7,
    'a card gives its head to the note name',
    `${Math.round(title?.w ?? 0)}px of ${Math.round(head?.w ?? 0)}px`,
  )
  await page
    .locator('.note-card')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect()
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: r.left + 20,
          clientY: r.top + 20,
          pointerType: 'touch',
          isPrimary: true,
          pointerId: 1,
        }),
      )
    })
  await page.waitForTimeout(800)
  check(Boolean(await page.$('.sheet-item')), 'long-press on a card offers pin and delete')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
  await page.locator('[aria-label="Sort and layout"]').click()
  await page.locator('.notes-options [aria-label="List view"]').click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---- Back puts you where you were ----
  await page.goto(`${BASE}/#/people`) // a list long enough to have a position
  await page.waitForSelector('.list-row')
  await page.waitForTimeout(300)
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }))
  await page.waitForTimeout(150)
  const left = await y()
  await page.locator('.list-row').nth(3).click()
  await page.waitForTimeout(400)
  const atDetail = await y()
  await page.goBack()
  await page.waitForTimeout(500)
  check(atDetail === 0, 'a detail screen opens at its top', `opened at ${atDetail}`)
  check((await y()) === left, 'the list comes back where it was', `${left} → ${await y()}`)

  // ---- The note, with a keyboard up ----
  await page.goto(`${BASE}/#/notes`)
  await page.waitForSelector('.notes-index')
  await page.locator('.note-row').first().click()
  await page.waitForSelector('.note-editable')
  await page.waitForTimeout(250)
  const idleTail = await page.$eval('.note-editable', (e) =>
    parseFloat(getComputedStyle(e).paddingBottom),
  )
  const meta = await box('.note-meta')
  check(idleTail <= 24, 'no keyboard runway under a note nobody is typing in', `${idleTail}px`)
  check(
    meta && meta.top < viewportH,
    'tags and visibility are on the first screenful',
    `at y ${Math.round(meta?.top ?? -1)}`,
  )

  await page.locator('.note-editable').click()
  await page.evaluate((kb) => window.__kb(kb), KB)
  await page.waitForTimeout(250)
  const band = await page.evaluate(() => window.__band())
  const nav = await box('.navbar.pinned')
  const bar = await box('.note-toolbar.docked')
  const typingTail = await page.$eval('.note-editable', (e) =>
    parseFloat(getComputedStyle(e).paddingBottom),
  )
  check(
    nav && nav.top >= band.top - 1 && nav.bottom <= band.bottom,
    'the nav bar stays inside the visible band',
    `${Math.round(nav?.top ?? -1)}–${Math.round(nav?.bottom ?? -1)} in ${Math.round(band.top)}–${Math.round(band.bottom)}`,
  )
  check(
    bar && Math.abs(bar.bottom - band.bottom) <= 1,
    'the formatting bar rests on the keyboard',
    `bar bottom ${Math.round(bar?.bottom ?? -1)}, band bottom ${Math.round(band.bottom)}`,
  )
  check(typingTail > idleTail, 'the runway comes back for the caret', `${typingTail}px`)

  // The picker clears the bar from a caret in the middle of the band, and from
  // one Chromium has left underneath it.
  for (const [label, scroll] of [
    ['a caret in the open', 0],
    ['a caret under the bar', 90],
  ]) {
    if (scroll) await page.evaluate((s) => window.scrollBy(0, s), scroll)
    await page.waitForTimeout(150)
    await page.keyboard.type(' @nina')
    await page.waitForTimeout(300)
    const pick = await box('.mention-picker')
    const barNow = await box('.note-toolbar.docked')
    const overlap = pick
      ? Math.min(pick.bottom, barNow.bottom) - Math.max(pick.top, barNow.top)
      : -1
    check(
      pick && overlap <= 0,
      `the @-mention picker clears the formatting bar (${label})`,
      pick
        ? `picker ${Math.round(pick.top)}–${Math.round(pick.bottom)}, bar from ${Math.round(barNow.top)}`
        : 'picker never opened',
    )
    await page.keyboard.press('Escape')
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
  }

  if (errors.length) {
    failures++
    console.log(`✗ page errors — ${errors.join(' || ')}`)
  }
  console.log(
    failures
      ? `\nNOTES KEYBOARD AUDIT: ${failures} failed`
      : '\nClean: notes hold up with a keyboard.',
  )
} finally {
  await browser.close()
}
process.exit(failures ? 1 : 0)
