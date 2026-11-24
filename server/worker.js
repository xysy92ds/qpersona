/**
 * 笺页云端 API：账号 + 本地优先增量同步。
 * 绑定：env.DB (D1)
 */
const KINDS = new Set(['characters', 'conversations', 'messages', 'memories', 'stickers', 'settings'])
const ALLOWED_ORIGINS = new Set([
  'https://xysy92ds.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://localhost',
  'capacitor://localhost',
])
const SESSION_DAYS = 30
const INACTIVE_DAYS = 30

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGINS.has('*') ? '*' : ''
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) },
  })
}

function err(req, message, status = 400) {
  return json(req, { ok: false, error: message }, status)
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomHex(bytes = 16) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function sha256(text) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 20000, hash: 'SHA-256' }, key, 256)
  return toHex(bits)
}

function validUsername(name) {
  return typeof name === 'string' && /^[\p{L}\p{N}_-]{3,20}$/u.test(name)
}

async function createSession(env, userId) {
  const token = randomHex(32)
  const now = Date.now()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 86400000)
    .run()
  return token
}

async function currentUser(req, env) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const hash = await sha256(token)
  const now = Date.now()
  const row = await env.DB.prepare('SELECT u.id, u.username, u.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(hash, now)
    .first()
  if (!row) return null
  if (now - (row.last_seen_at || 0) > 60_000) {
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, row.id).run()
  }
  return { id: row.id, username: row.username }
}

async function readJSON(req) {
  const text = await req.text()
  if (!text || text.length > 8 * 1024 * 1024) throw new Error('请求体为空或过大')
  try { return JSON.parse(text) } catch { throw new Error('JSON 解析失败') }
}

async function register(req, env) {
  const body = await readJSON(req)
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (!validUsername(username)) return err(req, '用户名需为 3~20 位字母/数字/下划线/中文')
  if (password.length < 6 || password.length > 128) return err(req, '密码需为 6~128 位')
  const lower = username.toLowerCase()
  const exists = await env.DB.prepare('SELECT id FROM users WHERE username_lower = ?').bind(lower).first()
  if (exists) return err(req, '这个用户名已经被用了', 409)
  const id = crypto.randomUUID()
  const salt = randomHex(16)
  const hash = await hashPassword(password, salt)
  const now = Date.now()
  try {
    await env.DB.prepare('INSERT INTO users (id, username, username_lower, password_hash, salt, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, username, lower, hash, salt, now, now).run()
  } catch {
    return err(req, '这个用户名已经被用了', 409)
  }
  const token = await createSession(env, id)
  return json(req, { ok: true, token, user: { id, username } })
}

async function login(req, env) {
  const body = await readJSON(req)
  const username = String(body.username || '').trim().toLowerCase()
  const password = String(body.password || '')
  const user = await env.DB.prepare('SELECT id, username, password_hash, salt FROM users WHERE username_lower = ?').bind(username).first()
  if (!user) return err(req, '用户名或密码不对', 401)
  if ((await hashPassword(password, user.salt)) !== user.password_hash) return err(req, '用户名或密码不对', 401)
  await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), user.id).run()
  const token = await createSession(env, user.id)
  return json(req, { ok: true, token, user: { id: user.id, username: user.username } })
}

async function logout(req, env) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  return json(req, { ok: true })
}

async function me(req, env, user) {
  const counts = await env.DB.prepare('SELECT kind, COUNT(*) AS n FROM sync_items WHERE user_id = ? GROUP BY kind').bind(user.id).all()
  const map = {}
  for (const row of counts.results || []) map[row.kind] = row.n
  return json(req, { ok: true, user, counts: map })
}

async function push(req, env, user) {
  const body = await readJSON(req)
  const items = Array.isArray(body.items) ? body.items.slice(0, 2000) : []
  if (!items.length) return json(req, { ok: true, accepted: 0 })
  const now = Date.now()
  const stmts = []
  let accepted = 0
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const kind = String(raw.kind || '')
    const id = String(raw.id || '')
    if (!KINDS.has(kind) || !id || id.length > 120) continue
    const updatedAt = Math.max(0, Number(raw.updatedAt) || 0)
    const payload = JSON.stringify(raw.payload ?? null)
    if (payload.length > 900_000) continue
    const deleted = raw.deleted ? 1 : 0
    stmts.push(env.DB.prepare(
      'INSERT INTO sync_items (user_id, kind, item_id, updated_at, deleted, payload) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(user_id, kind, item_id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, payload = excluded.payload ' +
      'WHERE excluded.updated_at > sync_items.updated_at'
    ).bind(user.id, kind, id, updatedAt, deleted, payload))
    accepted++
  }
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80))
  await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, user.id).run()
  return json(req, { ok: true, accepted, now })
}

async function pull(req, env, user) {
  const url = new URL(req.url)
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0)
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit')) || 5000))
  const rows = await env.DB.prepare('SELECT kind, item_id, updated_at, deleted, payload FROM sync_items WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT ?')
    .bind(user.id, since, limit).all()
  const items = (rows.results || []).map((r) => ({
    kind: r.kind,
    id: r.item_id,
    updatedAt: r.updated_at,
    deleted: !!r.deleted,
    payload: safeParse(r.payload),
  }))
  return json(req, { ok: true, since, items, now: Date.now() })
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return null }
}

async function cleanup(env) {
  const now = Date.now()
  const cutoff = now - INACTIVE_DAYS * 86400000
  const inactive = await env.DB.prepare('SELECT id FROM users WHERE last_seen_at < ?').bind(cutoff).all()
  const ids = (inactive.results || []).map((r) => r.id)
  if (ids.length) {
    for (const id of ids) {
      await env.DB.prepare('DELETE FROM sync_items WHERE user_id = ?').bind(id).run()
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
    }
  }
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run()
  return ids.length
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const path = url.pathname
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
    try {
      if (path === '/api/health') return json(req, { ok: true, service: 'jianyie-api', time: Date.now() })
      if (path === '/api/admin/cleanup' && req.method === 'POST') {
        if (!env.ADMIN_KEY || req.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return err(req, 'forbidden', 403)
        const cleaned = await cleanup(env)
        return json(req, { ok: true, cleaned })
      }
      if (path === '/api/auth/register' && req.method === 'POST') return register(req, env)
      if (path === '/api/auth/login' && req.method === 'POST') return login(req, env)
      if (path === '/api/auth/logout' && req.method === 'POST') return logout(req, env)
      const user = await currentUser(req, env)
      if (path === '/api/me') return user ? me(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/sync/push' && req.method === 'POST') return user ? push(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/sync/pull' && req.method === 'GET') return user ? pull(req, env, user) : err(req, '未登录', 401)
      return err(req, 'not found', 404)
    } catch (e) {
      console.error(e)
      return err(req, e instanceof Error ? e.message : '服务器错误', 500)
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env))
  },
}
