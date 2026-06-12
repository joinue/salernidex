// Mobile check: open Add Person, confirm the X closes it.
import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Explore the demo' }).click()
  await page.waitForSelector('.tabbar')

  // Add a person via the + tab → action sheet → Person (Today is the home now).
  await page.getByLabel('Add').click()
  await page.waitForSelector('.sheet')
  await page.getByText('Person', { exact: true }).click()
  await page.waitForSelector('.modal')
  await page.waitForTimeout(350)
  await page.screenshot({ path: 'scripts/shots/5-mobile-modal.png' })

  await page.getByLabel('Close').click()
  const stillOpen = await page.$('.modal')
  console.log('MODAL AFTER X CLICK:', stillOpen ? 'STILL OPEN (FAIL)' : 'closed (OK)')
} finally {
  await browser.close()
}
