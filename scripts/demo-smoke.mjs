// Demo-mode smoke test: design system + Phase 2 (interactions/cadence) +
// Phase 3 (Today hub) + portability. Screenshots to scripts/shots/.
import { chromium } from 'playwright'

const shots = 'scripts/shots'
const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function run(label, viewport, mobile) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()))

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).click()

  // 1. Today is the home screen
  await page.waitForSelector('.large-title')
  const sections = await page.$$eval('.section-label', (els) => els.map((e) => e.textContent))
  console.log(`[${label}] Today sections: ${sections.join(' | ')}`)
  const nudges = (await page.$$('.list')).length
  console.log(`[${label}] Today lists: ${nudges}`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${shots}/${label}-1-today.png` })

  // 2. Log a touchpoint from a person page (the "Log a touchpoint" quick-chips)
  await page.goto('http://localhost:5173/#/person/p-elena')
  await page.waitForSelector('.quick-chip')
  await page.locator('.quick-chip').first().click()
  await page.waitForSelector('.modal-title, .sheet')
  await page.locator('textarea').fill('Logged from person page')
  await page.getByRole('button', { name: 'Log it' }).click()
  await page.waitForTimeout(300)
  console.log(`[${label}] logged touchpoint OK`)
  await page.screenshot({ path: `${shots}/${label}-2-after-log.png` })

  // 2b. Long-press a Today row → action sheet (touch only)
  if (mobile) {
    await page.goto('http://localhost:5173/#/')
    await page.waitForSelector('.list .list-row')
    await page.evaluate(() => {
      const el = document.querySelector('.list .list-row')
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: r.left + 20, clientY: r.top + 20, pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true,
      }))
    })
    await page.waitForTimeout(550)
    const sheetItems = await page.$$('.sheet-item')
    console.log(`[${label}] long-press action sheet items: ${sheetItems.length}`)
    if (sheetItems.length) await page.screenshot({ path: `${shots}/${label}-2b-actionsheet.png` })
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true })))
    await page.keyboard.press('Escape').catch(() => {})
    // close sheet by tapping backdrop
    await page.locator('.sheet-overlay').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await page.waitForTimeout(200)
  }

  // 3. People tab
  await page.goto('http://localhost:5173/#/people')
  await page.waitForSelector('.search-input')
  console.log(`[${label}] search results: ${(await page.$$('.list .row-title')).length}`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${shots}/${label}-3-search.png` })

  // 4. Person page
  await page.getByText('Elena Vasquez').first().click()
  await page.waitForSelector('.person-name')
  console.log(`[${label}] activity rows: ${(await page.$$('.activity-row')).length}`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${shots}/${label}-4-person.png` })

  if (errors.length) console.log(`[${label}] ⚠ ERRORS: ${errors.join(' || ')}`)
  else console.log(`[${label}] no console/page errors`)
  await page.close()
  return errors.length
}

let failed = 0
try {
  failed += await run('desktop', { width: 1280, height: 950 }, false)
  failed += await run('mobile', { width: 390, height: 844 }, true)

  // Dark mode Today
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.large-title')
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${shots}/desktop-5-dark-today.png` })
  await page.close()

  console.log(failed ? `SMOKE DONE WITH ${failed} ERROR SET(S)` : 'SMOKE OK')
} finally {
  await browser.close()
}
