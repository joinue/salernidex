// Mobile check: open Add Person, confirm the X closes it.
import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.search-input')

  await page.getByTitle('Add Person').click()
  await page.waitForSelector('.modal')
  await page.waitForTimeout(350)
  await page.screenshot({ path: 'scripts/shots/5-mobile-modal.png' })

  await page.getByLabel('Close').click()
  const stillOpen = await page.$('.modal')
  console.log('MODAL AFTER X CLICK:', stillOpen ? 'STILL OPEN (FAIL)' : 'closed (OK)')
} finally {
  await browser.close()
}
