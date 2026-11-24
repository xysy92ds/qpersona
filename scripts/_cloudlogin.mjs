import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 402, height: 862 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const user = 'login_' + Math.random().toString(36).slice(2, 8)
await page.goto('http://127.0.0.1:5173/#/cloud', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
// register first
await page.locator('.tab', { hasText: '注册' }).click()
await page.locator('input[placeholder*="3~20"]').fill(user)
await page.locator('input[type="password"]').fill('secret123')
await page.getByText('注册并同步', { exact: true }).click()
await page.waitForTimeout(3500)
console.log('first convs:', await page.evaluate(async () => {
 const open=indexedDB.open('qpersona'); const db=await new Promise(r=>{open.onsuccess=()=>r(open.result)})
 const tx=db.transaction('conversations','readonly'); const all=await new Promise(r=>{const q=tx.objectStore('conversations').getAll();q.onsuccess=()=>r(q.result)});db.close();return all.length
}))
// simulate new device: clear IndexedDB and local storage, reload
await page.evaluate(async () => {
 localStorage.clear()
 const dbs = await indexedDB.databases?.() || []
 for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name)
})
await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.goto('http://127.0.0.1:5173/#/cloud', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.locator('input[placeholder*="3~20"]').fill(user)
await page.locator('input[type="password"]').fill('secret123')
await page.getByText('登录并同步', { exact: true }).click()
await page.waitForTimeout(4500)
console.log('after login:', await page.locator('.row').nth(1).textContent())
console.log('restored convs:', await page.evaluate(async () => {
 const open=indexedDB.open('qpersona'); const db=await new Promise(r=>{open.onsuccess=()=>r(open.result)})
 const tx=db.transaction('conversations','readonly'); const all=await new Promise(r=>{const q=tx.objectStore('conversations').getAll();q.onsuccess=()=>r(q.result)});db.close();return all.length
}))
await browser.close()
