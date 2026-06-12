// Privacy enforcement smoke: a "Private — only me" contact is invisible to
// the other household member everywhere (list, search, CSV export) but
// survives losslessly in the JSON backup. Desktop viewport.
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

async function capture(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()])
  return readFile(await download.path(), 'utf8')
}

const peopleCount = async () => {
  await page.goto('http://localhost:5173/#/people')
  await page.waitForSelector('.search-input')
  await page.waitForTimeout(250)
  return page.$$eval('.list .row-title', (els) => els.map((e) => e.textContent))
}

const switchMember = async (label) => {
  await page.goto('http://localhost:5173/#/settings')
  await page.waitForSelector('.member-name-input')
  const row = page.locator('.value-row', { has: page.locator(`.member-name-input[value="${label}"]`) })
  await row.getByText("I'm this").click()
  await page.waitForTimeout(200)
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.large-title')

  // 1. As member 1 ("Me"): add a private contact
  await page.goto('http://localhost:5173/#/people')
  await page.waitForSelector('.search-input')
  await page.getByLabel('Add person').click()
  await page.locator('input').nth(1).fill('Secret Contact') // first input inside modal = name
  await page.locator('select').last().selectOption('marc_only') // Privacy select is the last select... verify below
  // More robust: find the select whose options include "Private — only me"
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'marc_only'))
    sel.value = 'marc_only'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.getByRole('dialog').getByRole('button', { name: /Add person|Add anyway/ }).click()
  await page.waitForTimeout(400)

  const mine = await peopleCount()
  console.log('creator sees private contact:', mine.includes('Secret Contact'))

  // 2. Backup (as creator) is lossless
  await page.goto('http://localhost:5173/#/import')
  await page.waitForSelector('.list-row')
  const backup = await capture(() => page.getByText('Download backup (JSON)').click())
  console.log('backup contains private contact:', backup.includes('Secret Contact'))

  // 3. Switch to Partner: invisible in list and CSV
  await switchMember('Partner')
  const theirs = await peopleCount()
  console.log('partner cannot see private contact:', !theirs.includes('Secret Contact'))

  await page.goto('http://localhost:5173/#/import')
  await page.waitForSelector('.list-row')
  const csv = await capture(() => page.getByText('Export people to CSV').click())
  console.log('partner CSV export excludes it:', !csv.includes('Secret Contact'))

  // 4. Switch back: visible again
  await switchMember('Me')
  const back = await peopleCount()
  console.log('creator sees it again:', back.includes('Secret Contact'))

  if (errors.length) console.log('⚠ ERRORS:', errors.join(' || '))
  const ok =
    mine.includes('Secret Contact') &&
    backup.includes('Secret Contact') &&
    !theirs.includes('Secret Contact') &&
    !csv.includes('Secret Contact') &&
    back.includes('Secret Contact') &&
    !errors.length
  console.log(ok ? 'PRIVACY SMOKE OK' : 'PRIVACY SMOKE FAILED')
} finally {
  await browser.close()
}
