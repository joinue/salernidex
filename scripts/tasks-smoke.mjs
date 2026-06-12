// Tasks smoke test — current flow: projects (is_project) open a full-page
// ProjectDetail with subtasks + linked contacts; plain tasks expand inline;
// assignee is member-based. Desktop + mobile + dark. Screenshots to shots/.
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

  // Today leads with the To-do (tasks due) section
  const todaySections = await page.$$eval('.section-label', (els) => els.map((e) => e.textContent.trim()))
  console.log(`[${label}] Today sections: ${todaySections.join(' | ')}`)

  // Tasks: buckets + member-based assignee filter
  await page.goto('http://localhost:5173/#/tasks')
  await page.waitForSelector('.list-row')
  console.log(`[${label}] Tasks sections: ${(await page.$$eval('.section-label', (e) => e.map((x) => x.textContent.trim()))).join(' | ')}`)
  const filter = await page.$$eval('.segment', (e) => e.map((x) => x.textContent.trim()))
  console.log(`[${label}] assignee filter (Everyone + members): ${filter.join(' | ')}`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${shots}/${label}-tasks-1.png` })

  // Project → full-page ProjectDetail (subtasks + related contacts)
  await page.getByText('Fix the leaky bathroom faucet').click()
  await page.waitForSelector('.detail .section-label')
  console.log(`[${label}] project URL: ${page.url().includes('/project/') ? 'ok' : page.url()}`)
  const subs = await page.$$eval('.list-row.sub .row-title', (e) => e.map((x) => x.textContent.trim()))
  console.log(`[${label}] project subtasks: ${subs.join(', ')}`)
  const linked = await page.$$eval('.section-label', (els) => els.map((e) => e.textContent.trim())).then((s) => s.some((x) => x.includes('Related contacts')))
  const hasMarco = await page.getByText('Marco Reyes').count()
  console.log(`[${label}] related-contacts section: ${linked}, Marco linked: ${hasMarco > 0}`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${shots}/${label}-tasks-2-project.png` })

  // Back, then a plain task expands inline
  await page.goBack()
  await page.waitForSelector('.list-row')
  await page.getByText('Call David about the polisher quote').click()
  await page.waitForSelector('.task-expand')
  console.log(`[${label}] plain task expands inline: ok`)

  // Complete a task via its checkbox
  await page.locator('.task-check').first().click()
  await page.waitForTimeout(300)
  console.log(`[${label}] toggled a task checkbox: ok`)
  await page.screenshot({ path: `${shots}/${label}-tasks-3.png` })

  if (errors.length) console.log(`[${label}] ⚠ ERRORS: ${errors.join(' || ')}`)
  else console.log(`[${label}] no console/page errors`)
  await page.close()
  return errors.length
}

let failed = 0
try {
  failed += await run('desktop', { width: 1280, height: 950 }, false)
  failed += await run('mobile', { width: 390, height: 844 }, true)

  // Dark mode project detail
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Explore the demo' }).click()
  await page.waitForSelector('.large-title')
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.goto('http://localhost:5173/#/project/t-faucet')
  await page.waitForSelector('.detail .section-label')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${shots}/desktop-project-dark.png` })
  await page.close()

  console.log(failed ? `TASKS SMOKE: ${failed} ERROR SET(S)` : 'TASKS SMOKE OK')
} finally {
  await browser.close()
}
