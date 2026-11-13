const url = process.argv[2]
const ws = new WebSocket(url)
let id = 0
const pending = new Map()
ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })) })
ws.addEventListener('open', async () => {
  const r = await send('Runtime.evaluate', { expression: process.argv[3], awaitPromise: true, returnByValue: true })
  console.log(JSON.stringify(r, null, 2).slice(0, 5000))
  ws.close()
})
