// Phase 7 smoke: tiers, contact families, key dates. Desktop + mobile.
// Screenshots to scripts/shots/.
import { chromium } from 'playwright'

const shots = 'scripts/shots'
const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function run(label, viewport, mobile) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()))

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Explore the demo' }).click()
  await page.waitForSelector('.large-title')

  // 1. Today: Dates section merges birthdays + anniversaries + one-offs
  const dateSubs = await page.$$eval('.section-label', (els) => els.map((e) => e.textContent))
  console.log(`[${label}] Today sections: ${dateSubs.join(' | ')}`)
  const dateRows = await page.$$eval('.list .row-sub', (els) => els.map((e) => e.textContent.trim()))
  const hasAnniv = dateRows.some((t) => t.includes('Wedding anniversary'))
  const hasRetire = dateRows.some((t) => t.includes('Retirement party'))
  const hasBday = dateRows.some((t) => t.startsWith('Turns'))
  console.log(`[${label}] Dates merge — birthday: ${hasBday}, anniversary(+years): ${hasAnniv}, one-off: ${hasRetire}`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${shots}/${label}-p7-today.png` })

  // 2. Nina's page: tier badge, key dates, family section with Theo
  await page.goto('http://localhost:5173/#/person/p-nina')
  await page.waitForSelector('.person-name')
  const tierChip = await page.$eval('.chip.tier-inner', (e) => e.textContent).catch(() => null)
  console.log(`[${label}] Nina tier chip: ${tierChip}`)
  const sections = await page.$$eval('.section-label, .section-head .section-label', (els) => els.map((e) => e.textContent.trim()))
  console.log(`[${label}] Nina sections: ${sections.join(' | ')}`)
  const familyRow = await page.getByText('Theo Park').count()
  console.log(`[${label}] family section shows Theo: ${familyRow > 0}`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${shots}/${label}-p7-person.png` })

  // 3. Family is bidirectional: Theo's page shows Nina
  await page.getByText('Theo Park').first().click()
  await page.waitForSelector('.person-name')
  const ninaBack = await page.getByText('Nina Park').count()
  console.log(`[${label}] Theo's family shows Nina: ${ninaBack > 0}`)

  // 4. Add a key date from the UI
  await page.getByText('Add', { exact: false }).filter({ has: page.locator(':scope') }).first()
  await page.locator('.see-all').first().click()
  await page.waitForSelector('.modal-title, .sheet')
  await page.locator('input[placeholder="Wedding anniversary"]').fill('First met')
  await page.locator('input[type="date"]').fill('2019-05-20')
  await page.getByRole('tab', { name: 'One-time' }).click()
  await page.getByRole('button', { name: 'Add date' }).click()
  await page.waitForTimeout(300)
  const added = await page.getByText('First met').count()
  console.log(`[${label}] key date added via UI: ${added > 0}`)

  // 5. People: tier filter narrows to inner circle
  await page.goto('http://localhost:5173/#/people')
  await page.waitForSelector('.search-input')
  await page.getByRole('button', { name: /Filter/ }).click()
  await page.waitForSelector('.filter-sheet')
  await page.locator('.filter-sheet select').nth(3).selectOption('inner') // Tier select
  await page.getByRole('button', { name: /Show \d+/ }).click()
  await page.waitForTimeout(250)
  const filtered = await page.$$eval('.list .row-title', (els) => els.map((e) => e.textContent))
  console.log(`[${label}] inner-circle filter → ${filtered.join(', ')}`)
  await page.screenshot({ path: `${shots}/${label}-p7-tier-filter.png` })

  if (errors.length) console.log(`[${label}] ⚠ ERRORS: ${errors.join(' || ')}`)
  else console.log(`[${label}] no console/page errors`)
  await page.close()
  return errors.length
}

let failed = 0
try {
  failed += await run('desktop', { width: 1280, height: 950 }, false)
  failed += await run('mobile', { width: 390, height: 844 }, true)
  console.log(failed ? `PHASE7 SMOKE: ${failed} ERROR SET(S)` : 'PHASE7 SMOKE OK')
} finally {
  await browser.close()
}
