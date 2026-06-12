// Phase 5 (Lists) + nav restructure smoke test. Screenshots to scripts/shots/.
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
  await page.waitForSelector('.large-title')

  // Lists index
  await page.goto('http://localhost:5173/#/lists')
  await page.waitForSelector('.list-row')
  const lists = await page.$$eval('.list-row .row-title', (els) => els.map((e) => e.textContent.trim()))
  console.log(`[${label}] lists: ${lists.join(', ')}`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${shots}/${label}-lists-1.png` })

  // Open Groceries
  await page.getByText('Groceries').click()
  await page.waitForSelector('.list-add input')
  const openItems = (await page.$$('.list .row-title')).length
  console.log(`[${label}] grocery items shown: ${openItems}`)

  // Rapid add an item
  await page.locator('.list-add input').fill('Tortillas')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const after = await page.$$eval('.row-title', (els) => els.map((e) => e.textContent.trim()))
  console.log(`[${label}] after add, contains Tortillas: ${after.includes('Tortillas')}`)

  // Check an item off (tap its circle)
  await page.locator('.task-check').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/${label}-list-detail.png` })

  if (errors.length) console.log(`[${label}] ⚠ ERRORS: ${errors.join(' || ')}`)
  else console.log(`[${label}] no console/page errors`)
  await page.close()
  return errors.length
}

let failed = 0
try {
  failed += await run('desktop', { width: 1280, height: 950 }, false)
  failed += await run('mobile', { width: 390, height: 844 }, true)

  // Mobile nav: confirm 4 tabs + FAB, and page-aware add on Lists
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await m.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await m.getByRole('button', { name: 'Sign in' }).click()
  await m.waitForSelector('.tabbar')
  const tabs = await m.$$eval('.tab span', (els) => els.map((e) => e.textContent.trim()))
  console.log('mobile tabs:', tabs.join(' · '))
  // More button on Today header (sits next to the Settings gear)
  await m.locator('.header-action[aria-label="More"]').click()
  await m.waitForSelector('.sheet-item')
  const more = await m.$$eval('.sheet-item', (els) => els.map((e) => e.textContent.trim()))
  console.log('More sheet:', more.join(' | '))
  await m.screenshot({ path: `${shots}/mobile-more-sheet.png` })
  await m.close()

  // Dark lists
  const d = await browser.newPage({ viewport: { width: 1280, height: 950 } })
  await d.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await d.getByRole('button', { name: 'Sign in' }).click()
  await d.waitForSelector('.large-title')
  await d.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await d.goto('http://localhost:5173/#/list/l-grocery')
  await d.waitForSelector('.list-add input')
  await d.waitForTimeout(250)
  await d.screenshot({ path: `${shots}/desktop-list-dark.png` })
  await d.close()

  console.log(failed ? `LISTS SMOKE: ${failed} ERROR SET(S)` : 'LISTS SMOKE OK')
} finally {
  await browser.close()
}
