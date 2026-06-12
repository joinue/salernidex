// iOS experience smoke: install hint (iPhone Safari only, dismiss persists),
// edge-swipe back on detail pages, 16px inputs (no focus zoom).
import { chromium } from 'playwright'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: IPHONE_UA,
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.large-title')

  // 1. Install hint shows on iPhone-Safari UA; dismiss persists across reload
  const hint = await page.$('.install-hint')
  console.log('install hint visible on iPhone UA:', Boolean(hint))
  await page.locator('.install-hint [aria-label="Dismiss"]').click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.large-title')
  console.log('hint gone after dismiss + reload:', !(await page.$('.install-hint')))
  await page.screenshot({ path: 'scripts/shots/ios-today.png' })

  // 2. Edge-swipe back: open a person, swipe from left edge, land back on Today
  await page.getByText('Nina Park').first().click()
  await page.waitForSelector('.person-name')
  const before = await page.evaluate(() => location.hash)
  await page.mouse.move(6, 420)
  await page.mouse.down()
  await page.mouse.move(140, 424, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => location.hash)
  console.log(`edge-swipe back: ${before} → ${after || '#/ (today)'} — worked: ${after !== before}`)

  // 3. Inputs are 16px on mobile (no iOS focus zoom)
  await page.goto('http://localhost:5173/#/people')
  await page.waitForSelector('.search-input')
  const fontSize = await page.$eval('.search-input', (e) => getComputedStyle(e).fontSize)
  console.log(`search input font-size: ${fontSize} (needs >= 16px)`)

  if (errors.length) console.log('⚠ ERRORS:', errors.join(' || '))
  const ok = Boolean(hint) && after !== before && parseFloat(fontSize) >= 16 && !errors.length
  console.log(ok ? 'IOS SMOKE OK' : 'IOS SMOKE FAILED')
} finally {
  await browser.close()
}
