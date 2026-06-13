// Mobile UX walkthrough at iPhone 14 size: tab bar, add sheet, form
// sheet, more sheet, person page. Screenshots to scripts/shots/.
import { chromium } from 'playwright'

const shots = 'scripts/shots'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Explore the demo' }).click()
  await page.waitForSelector('.tabbar')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/m1-search.png` })
  console.log(
    'TABBAR TABS:',
    await page.$$eval('.tabbar .tab', (els) => els.map((e) => e.textContent).join(', ')),
  )

  // + action sheet
  await page.getByLabel('Add').click()
  await page.waitForSelector('.sheet')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/m2-add-sheet.png` })

  // Person form as bottom sheet
  await page.getByText('Person', { exact: true }).click()
  await page.waitForSelector('.modal')
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${shots}/m3-form-sheet.png` })
  await page.getByLabel('Close').click()

  // More sheet (icon button on the Today header, next to the Settings gear)
  await page.locator('.header-action[aria-label="More"]').click()
  await page.waitForSelector('.sheet')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/m4-more-sheet.png` })
  await page.mouse.click(195, 200) // tap overlay to dismiss
  await page.waitForTimeout(200)

  // Person page (People tab now lists contacts; Today is the home screen)
  await page.goto('http://localhost:5173/#/people')
  await page.waitForSelector('.search-input')
  await page.getByText('Elena Vasquez').click()
  await page.waitForSelector('.person-name')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/m5-person.png` })

  console.log('MOBILE UX OK')
} finally {
  await browser.close()
}
