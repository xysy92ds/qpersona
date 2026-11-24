import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome', args: ['--no-sandbox'] })
const user = 'login_' + Math.random().toString(36).slice(2, 8)
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 862 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:5173/#/cloud', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  return { ctx, page }
}
const a = await open()
await a.page.locator('.tab', { hasText: '注册' }).click()
await a.page.locator('input[placeholder*="3~20"]').fill(user)
await a.page.locator('input[type="password"]').fill('secret123')
await a.page.getByText('注册并同步', { exact: true }).click()
await a.page.waitForTimeout(3500)
console.log('reg:', await a.page.locator('.row').nth(1).textContent())
await a.ctx.close()
const b = await open()
await b.page.locator('input[placeholder*="3~20"]').fill(user)
await b.page.locator('input[type="password"]').fill('secret123')
await b.page.getByText('登录并同步', { exact: true }).click()
await b.page.waitForTimeout(4000)
console.log('login:', await b.page.locator('.row').nth(1).textContent())
console.log('convs:', await b.page.evaluate(async () => {
 const open=indexedDB.open('qpersona'); const db=await new Promise(r=>{open.onsuccess=()=>r(open.result)})
 const tx=db.transaction('conversations','readonly'); const all=await new Promise(r=>{const q=tx.objectStore('conversations').getAll();q.onsuccess=()=>r(q.result)});db.close();return all.length
}))
await browser.close()
