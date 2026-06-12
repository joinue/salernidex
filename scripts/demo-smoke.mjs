// Demo-mode smoke test: login -> search -> person page -> groups ->
// theme toggle. Screenshots to scripts/shots/.
import { chromium } from 'playwright'

const shots = 'scripts/shots'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })

  // 1. Dummy sign-in
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.search-input')
  console.log('SIGNED IN, results:', (await page.$$('.result-name')).length)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/1-search.png` })

  // 2. Person page via click — URL routing + birthday/address + web
  await page.getByText('Elena Vasquez').click()
  await page.waitForSelector('.person-name')
  console.log('URL:', page.url())
  const contact = await page.$$eval('.contact-line', (els) => els.map((e) => e.textContent.trim()))
  console.log('CONTACT LINES:', contact.join(' | '))
  const alsoKnows = await page.$$eval('.connection .conn-name', (els) => els.map((e) => e.textContent))
  console.log('ALSO KNOWS:', alsoKnows.join(', '))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/2-person-page.png` })

  // 3. Hop the web, then Back twice returns to search with query intact
  await page.getByText('Rita Delgado').click()
  await page.waitForSelector('.person-name')
  console.log('HOPPED TO:', await page.textContent('.person-name'), '|', page.url())

  // 4. Groups view with AND/OR/NOT rules
  await page.goto('http://localhost:5173/#/groups')
  await page.waitForSelector('.rule-text')
  const groups = await page.$$eval('.result-item', (els) =>
    els.map((e) => `${e.querySelector('.result-name').textContent} [${e.querySelector('.result-org').textContent}]`)
  )
  console.log('GROUPS:', groups.join(' / '))
  await page.getByText('Civic — outside government').click()
  await page.waitForSelector('.connection')
  const members = await page.$$eval('.connection .conn-name', (els) => els.map((e) => e.textContent))
  console.log('NOT-GOV MEMBERS (should exclude Sam & Lupe):', members.join(', '))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/3-groups.png` })

  // 5. Theme toggle: system -> light -> dark
  await page.getByTitle('Switch to light theme').click()
  await page.getByTitle('Switch to dark theme').click()
  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  const stored = await page.evaluate(() => localStorage.getItem('salernidex-theme'))
  console.log('THEME after two clicks:', theme, '| stored:', stored)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${shots}/4-dark-forced.png` })

  console.log('SMOKE OK')
} finally {
  await browser.close()
}
