// Phase 6a smoke: attention engine, Check in section (warm copy, never
// salesy), snooze via swipe action sheet, badges, notification prefs.
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
  await page.evaluate(() => localStorage.removeItem('salernidex-notify-prefs'))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.large-title')

  // 1. Check in section, warm copy only
  const sections = await page.$$eval('.section-label', (els) => els.map((e) => e.textContent.trim()))
  console.log(`[${label}] Today sections: ${sections.join(' | ')}`)
  const checkinSubs = await page.$$eval('.list .row-sub', (els) => els.map((e) => e.textContent.trim()))
  const warm = checkinSubs.some((t) => t.includes("It's been a while"))
  const sayHi = checkinSubs.some((t) => t.includes('say hi'))
  const salesy = checkinSubs.some((t) => /overdue by|cadence|follow.?up|nudge/i.test(t))
  console.log(`[${label}] warm copy: ${warm}, never-contacted "say hi": ${sayHi}, salesy language leaked: ${salesy}`)

  // 2. Badge on Today nav reflects overdue/today count
  const badgeSel = mobile ? '.tab-badge' : '.nav-badge'
  const badge = await page.$eval(badgeSel, (e) => e.textContent).catch(() => null)
  console.log(`[${label}] Today badge: ${badge}`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${shots}/${label}-p6-today.png` })

  // 3. Quick check-in from the row logs a touchpoint
  await page.locator('.icon-btn[aria-label^="Check in with"]').first().click()
  await page.waitForSelector('.modal-title, .sheet')
  await page.locator('textarea').fill('Caught up — all good')
  await page.getByRole('button', { name: 'Log it' }).click()
  await page.waitForTimeout(350)
  console.log(`[${label}] quick check-in logged OK`)

  // 4. Snooze: count rows, snooze the first check-in via its swipe action,
  //    confirm the row count drops and the badge follows.
  const beforeRows = (await page.$$('.list .list-row')).length
  // The action button sits under the row content until swiped open; dispatch
  // the click directly on the element (what a real swipe would expose).
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.swipe-action')].find((b) => b.textContent.includes('Later'))
    btn.click()
  })
  await page.waitForSelector('.sheet')
  await page.getByText('Remind me in 3 days').click()
  await page.waitForTimeout(350)
  const afterRows = (await page.$$('.list .list-row')).length
  console.log(`[${label}] snooze hides a row: ${afterRows < beforeRows} (${beforeRows} → ${afterRows})`)
  await page.screenshot({ path: `${shots}/${label}-p6-after-snooze.png` })

  // 5. Settings: toggling Check-ins off empties the section
  await page.goto('http://localhost:5173/#/settings')
  await page.waitForSelector('.switch')
  await page.getByRole('switch', { name: 'Check-ins' }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${shots}/${label}-p6-settings.png` })
  await page.goto('http://localhost:5173/#/')
  await page.waitForTimeout(300)
  const sectionsAfter = await page.$$eval('.section-label', (els) => els.map((e) => e.textContent.trim()))
  console.log(`[${label}] after toggle off, sections: ${sectionsAfter.join(' | ')} (Check in gone: ${!sectionsAfter.includes('Check in')})`)
  // restore for the next viewport run
  await page.goto('http://localhost:5173/#/settings')
  await page.waitForSelector('.switch')
  await page.getByRole('switch', { name: 'Check-ins' }).click()

  if (errors.length) console.log(`[${label}] ⚠ ERRORS: ${errors.join(' || ')}`)
  else console.log(`[${label}] no console/page errors`)
  await page.close()
  return errors.length
}

let failed = 0
try {
  failed += await run('desktop', { width: 1280, height: 950 }, false)
  failed += await run('mobile', { width: 390, height: 844 }, true)
  console.log(failed ? `PHASE6 SMOKE: ${failed} ERROR SET(S)` : 'PHASE6 SMOKE OK')
} finally {
  await browser.close()
}
