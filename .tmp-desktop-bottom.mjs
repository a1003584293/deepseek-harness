import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
const errors = []
page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.type() + ': ' + msg.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
await page.waitForTimeout(1000)
await page.getByText('Harness 配置简化与文件查看器', { exact: false }).first().click()
await page.waitForTimeout(2000)
await page.keyboard.press('Meta+J')
await page.waitForTimeout(4000)
await page.screenshot({ path: '/tmp/desktop-bottom.png' })
const count = await page.locator('[data-bottom-terminal]').count()
const text = count ? (await page.locator('[data-bottom-terminal]').innerText()).slice(0,600) : ''
console.log(JSON.stringify({ count, text, errors: errors.slice(0,10) }, null, 2))
await browser.close()
