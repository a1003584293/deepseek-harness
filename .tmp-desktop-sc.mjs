import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
const errors = []
page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.type() + ': ' + msg.text()) })
await page.bringToFront()
await page.waitForTimeout(500)
const collapse = page.getByRole('button', { name: '收起侧边栏' })
if (await collapse.count()) await collapse.first().click()
await page.waitForTimeout(800)
const opener = page.locator('[data-source-control-opener]')
console.log('opener', await opener.count())
if (await opener.count()) await opener.first().click()
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/desktop-sc.png' })
const sc = page.locator('[data-source-control]')
console.log(JSON.stringify({ sc: await sc.count(), text: await sc.count() ? (await sc.innerText()).slice(0,1200) : '', errors: errors.slice(0,10) }, null, 2))
await browser.close()
