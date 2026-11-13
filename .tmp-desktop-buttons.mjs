import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
const buttons = await page.locator('button').evaluateAll(bs => bs.map(b => { const r=b.getBoundingClientRect(); return { text:b.innerText.trim().slice(0,20), label:b.getAttribute('aria-label'), title:b.getAttribute('title'), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width) } }).filter(x => x.x > 680 && x.y < 100))
console.log(JSON.stringify(buttons, null, 2))
await browser.close()
