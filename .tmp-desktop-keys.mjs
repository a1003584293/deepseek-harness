import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
await page.waitForTimeout(500)
const before = (await page.locator('body').innerText()).slice(-400)
await page.keyboard.press('Meta+T')
await page.waitForTimeout(1500)
const afterT = (await page.locator('body').innerText()).slice(-600)
await page.keyboard.press('Meta+Shift+E')
await page.waitForTimeout(1500)
const afterE = (await page.locator('body').innerText()).slice(-600)
console.log(JSON.stringify({ before, afterT, afterE }, null, 2))
await browser.close()
