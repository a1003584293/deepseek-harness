import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
await page.waitForTimeout(500)
const count = await page.locator('[data-bottom-terminal]').count()
const text = count ? (await page.locator('[data-bottom-terminal]').innerText()).slice(0,600) : ''
await page.screenshot({ path: '/tmp/desktop-bottom2.png' })
console.log(JSON.stringify({ count, text }, null, 2))
await browser.close()
