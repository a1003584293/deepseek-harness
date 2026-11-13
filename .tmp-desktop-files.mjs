import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
await page.bringToFront()
await page.getByRole('button', { name: '新标签页' }).click()
await page.waitForTimeout(1000)
const guideText = (await page.locator('body').innerText()).slice(-800)
const cards = await page.locator('button').evaluateAll(bs => bs.map(b => ({ text: b.innerText.trim().slice(0,50), label: b.getAttribute('aria-label'), x: Math.round(b.getBoundingClientRect().x), y: Math.round(b.getBoundingClientRect().y) })).filter(x => x.x > 680 && x.y < 450))
console.log(JSON.stringify({ guideText, cards }, null, 2))
await page.screenshot({ path: '/tmp/desktop-guide2.png' })
await browser.close()
