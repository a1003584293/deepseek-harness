import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
await page.bringToFront()
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/desktop-test.png' })
const buttons = await page.locator('button').evaluateAll(bs => bs.map(b => ({ text: b.innerText.trim().slice(0,40), label: b.getAttribute('aria-label'), title: b.getAttribute('title') })).filter(x => x.label || x.title || x.text).slice(0,50))
console.log(JSON.stringify(buttons, null, 2))
await browser.close()
