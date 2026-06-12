// Phase 8a smoke: vCard export from person page, group, and Import/Export.
// Captures the actual downloads and validates the vCard content.
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

async function capture(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()])
  const path = await download.path()
  return { name: download.suggestedFilename(), text: await readFile(path, 'utf8') }
}

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Explore the demo' }).click()
  await page.waitForSelector('.large-title')

  // 1. Single person from their page
  await page.goto('http://localhost:5173/#/person/p-elena')
  await page.waitForSelector('.person-name')
  const single = await capture(() => page.getByRole('button', { name: 'Save contact' }).click())
  const cardCount = (single.text.match(/BEGIN:VCARD/g) || []).length
  const fields = ['FN:Elena Vasquez', 'ORG:Riverside Compass', 'TEL;TYPE=CELL', 'BDAY:1984-03-14', 'UID:salernidex-p-elena']
    .map((f) => `${f}: ${single.text.includes(f)}`)
  console.log(`single: ${single.name} (${cardCount} card) — ${fields.join(', ')}`)
  console.log(`crlf line endings: ${single.text.includes('\r\n')}`)

  // 2. Group export (Northwind Customers = 3 people)
  await page.goto('http://localhost:5173/#/groups')
  await page.getByText('Northwind Customers').click()
  const group = await capture(() => page.getByRole('button', { name: 'Export contacts' }).click())
  console.log(`group: ${group.name} — ${(group.text.match(/BEGIN:VCARD/g) || []).length} cards (expect 3)`)

  // 3. Everyone from Import/Export
  await page.goto('http://localhost:5173/#/import')
  const all = await capture(() => page.getByText('Export vCard (.vcf)').click())
  const allCount = (all.text.match(/BEGIN:VCARD/g) || []).length
  console.log(`all: ${all.name} — ${allCount} cards (expect 12 active people)`)

  // 4. Escaping: Theo's notes contain an em-dash sentence with no raw newlines leaking
  const theoCard = all.text.split('BEGIN:VCARD').find((c) => c.includes('Theo Park'))
  console.log(`notes escaped into NOTE line: ${theoCard.includes('NOTE:')}`)

  if (errors.length) console.log('⚠ ERRORS:', errors.join(' || '))
  const ok = cardCount === 1 && allCount === 12 && !errors.length
  console.log(ok ? 'PHASE8 SMOKE OK' : 'PHASE8 SMOKE FAILED')
} finally {
  await browser.close()
}
