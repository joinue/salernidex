// Phase 6b client smoke: service worker registers, Settings push flow
// enables, a local test notification actually shows. (Real delivery needs
// the deployed Edge Function — go-live runbook in docs/phase6-reminders.md.)
import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } })
await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:5173' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.large-title')

  // 1. Service worker registered on load
  await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready, null, { timeout: 10000 })
  const swOk = await page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration()))
  console.log('service worker registered:', swOk)

  // 2. Settings → enable on this device
  await page.goto('http://localhost:5173/#/settings')
  await page.getByRole('button', { name: 'Enable notifications' }).click()
  await page.waitForTimeout(1500)
  const ready = await page.getByText('Ready — delivery starts at launch').count()
  console.log('device shows ready:', ready > 0)
  await page.screenshot({ path: 'scripts/shots/push-settings.png' })

  // 3. Test notification actually displays (visible via getNotifications)
  await page.getByText('Send a test notification').click()
  await page.waitForTimeout(800)
  const shown = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return (await reg.getNotifications()).length
  })
  console.log('test notification shown:', shown >= 1, `(${shown})`)

  // 4. Subscription captured? (headless Chrome can't always reach a push
  //    service — informational, not a failure)
  const sub = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    const s = await reg.pushManager.getSubscription()
    return s ? s.endpoint.slice(0, 40) : null
  })
  console.log('push subscription:', sub || 'not available in this environment (fine)')

  if (errors.length) console.log('⚠ ERRORS:', errors.join(' || '))
  console.log(swOk && ready > 0 && shown >= 1 && !errors.length ? 'PUSH SMOKE OK' : 'PUSH SMOKE FAILED')
} finally {
  await browser.close()
}
