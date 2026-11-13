import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
const errors = []
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
await page.bringToFront()
await page.waitForTimeout(500)
const add = page.getByRole('button', { name: /添加标签页|新建标签页|Add tab|New tab/i })
console.log('add buttons', await add.count())
if (await add.count()) await add.first().click()
else {
  const plus = page.locator('[data-sidebar-right] button').filter({ hasText: '+' })
  console.log('plus', await plus.count())
}
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/desktop-guide.png' })
const text = await page.locator('body').innerText()
console.log(text.slice(-800))
await browser.close()
