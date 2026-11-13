import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const contexts = browser.contexts()
const pages = contexts.flatMap(c => c.pages())
console.log('pages', pages.map(p => p.url()))
const page = pages[0]
const errors = []
page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.type() + ': ' + msg.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/desktop-app.png' })
console.log(JSON.stringify({ title: await page.title(), text: (await page.locator('body').innerText()).slice(0,2500), errors: errors.slice(0,10) }, null, 2))
await browser.close()
