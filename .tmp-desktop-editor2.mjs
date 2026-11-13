import { chromium } from './apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
const page = browser.contexts()[0].pages()[0]
const errors = []
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
await page.bringToFront()
await page.getByText('工作区文件', { exact: false }).first().click({ force: true })
await page.waitForTimeout(2500)
const file = page.getByText('test-editor.txt', { exact: true }).first()
console.log('file', await file.count())
if (await file.count()) await file.click({ force: true })
await page.waitForTimeout(2000)
const edit = page.getByRole('button', { name: '在编辑器中打开' }).first()
console.log('edit', await edit.count())
if (await edit.count()) await edit.click({ force: true })
await page.waitForTimeout(3000)
const editor = page.locator('[data-file-editor]')
const monaco = page.locator('[data-monaco-editor]')
const state = { editor: await editor.count(), monaco: await monaco.count(), text: await editor.count() ? (await editor.innerText()).slice(0,300) : '' }
if (await monaco.count()) {
  await monaco.first().click({ position: { x: 80, y: 30 }, force: true })
  await page.keyboard.press('Meta+A')
  await page.keyboard.type('desktop saved by editor')
  await page.waitForTimeout(400)
  const save = page.getByRole('button', { name: '保存' }).first()
  if (await save.count()) await save.click()
  await page.waitForTimeout(2000)
}
await page.screenshot({ path: '/tmp/desktop-editor.png' })
console.log(JSON.stringify({ state, errors: errors.slice(0,10) }, null, 2))
await browser.close()
