/**
 * 笺页云端 API：账号 + 本地优先增量同步。
 * 绑定：env.DB (D1)
 */
const KINDS = new Set(['characters', 'conversations', 'messages', 'memories', 'stickers', 'settings'])
const ALLOWED_ORIGINS = new Set([
  'https://xysy92ds.github.io',
  'https://jianyie.pages.dev',
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
  let skipped = 0
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const kind = String(raw.kind || '')
    const id = String(raw.id || '')
    if (!KINDS.has(kind) || !id || id.length > 120) { skipped++; continue }
    const updatedAt = Math.max(0, Number(raw.updatedAt) || 0)
    const payload = JSON.stringify(raw.payload ?? null)
    if (payload.length > 900_000) { skipped++; continue }
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
  return json(req, { ok: true, accepted, skipped, now })
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


async function listPlaza(req, env) {
  const url = new URL(req.url)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100))
  const rows = await env.DB.prepare(
    "SELECT id, author_id, author_name, payload, created_at FROM plaza_cards WHERE status = 'approved' ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all()
  const items = (rows.results || []).map((r) => ({
    id: r.id,
    author: r.author_name || '匿名',
    authorId: r.author_id,
    uploadedAt: r.created_at,
    payload: safeParse(r.payload),
  }))
  return json(req, { ok: true, items })
}

async function uploadPlaza(req, env, user) {
  const body = await readJSON(req)
  const card = body?.card
  if (!card || typeof card !== 'object' || !String(card.name || '').trim()) return err(req, '角色卡缺少名字')
  const payload = JSON.stringify({ card, qq: body.qq || {}, avatar: body.avatar || '' })
  if (payload.length > 900_000) return err(req, '角色卡太大')
  const id = crypto.randomUUID()
  const now = Date.now()
  await env.DB.prepare(
    "INSERT INTO plaza_cards (id, author_id, author_name, payload, status, created_at) VALUES (?, ?, ?, ?, 'approved', ?)"
  ).bind(id, user.id, user.username, payload, now).run()
  return json(req, { ok: true, id })
}

async function deletePlaza(req, env, user, id) {
  const row = await env.DB.prepare('SELECT author_id FROM plaza_cards WHERE id = ?').bind(id).first()
  if (!row) return err(req, '卡片不存在', 404)
  const isOwner = row.author_id === user.id
  const isAdmin = !!env.ADMIN_KEY && req.headers.get('X-Admin-Key') === env.ADMIN_KEY
  if (!isOwner && !isAdmin) return err(req, '只能删除自己上传的卡', 403)
  await env.DB.prepare('DELETE FROM plaza_cards WHERE id = ?').bind(id).run()
  return json(req, { ok: true })
}



async function dmStatus(req, env, user) {
  const url = new URL(req.url)
  const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100)
  if (!ids.length) return json(req, { ok: true, items: [] })
  const placeholders = ids.map(() => '?').join(',')
  const rows = await env.DB.prepare(
    `SELECT id, delivered_at, expires_at FROM relay_messages WHERE sender_id = ? AND id IN (${placeholders})`
  ).bind(user.id, ...ids).all()
  const map = new Map((rows.results || []).map((r) => [r.id, r]))
  const now = Date.now()
  const items = ids.map((id) => {
    const r = map.get(id)
    if (!r) return { id, expiresAt: 0, missing: true }
    return { id, deliveredAt: r.delivered_at || 0, expiresAt: r.expires_at, missing: false, expired: r.expires_at <= now }
  })
  return json(req, { ok: true, items })
}

async function friendsList(req, env, user) {
  const rows = await env.DB.prepare(
    `SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at,
            u.id AS peer_id, u.username AS peer_name
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
     WHERE f.requester_id = ? OR f.addressee_id = ?
     ORDER BY f.created_at DESC`
  ).bind(user.id, user.id, user.id).all()
  const friends = [], incoming = [], outgoing = []
  for (const r of rows.results || []) {
    const item = {
      id: r.id,
      status: r.status,
      peer: { id: r.peer_id, username: r.peer_name },
      direction: r.requester_id === user.id ? 'out' : 'in',
      createdAt: r.created_at,
    }
    if (r.status === 'accepted') friends.push(item)
    else if (r.status === 'pending' && item.direction === 'in') incoming.push(item)
    else if (r.status === 'pending') outgoing.push(item)
  }
  return json(req, { ok: true, friends, incoming, outgoing })
}

async function friendRequest(req, env, user) {
  const body = await readJSON(req)
  const name = String(body.username || '').trim().toLowerCase()
  if (!name) return err(req, '填对方用户名')
  const target = await env.DB.prepare('SELECT id, username FROM users WHERE username_lower = ?').bind(name).first()
  if (!target) return err(req, '找不到这个用户', 404)
  if (target.id === user.id) return err(req, '不能加自己')
  const existing = await env.DB.prepare(
    `SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
  ).bind(user.id, target.id, target.id, user.id).first()
  if (existing?.status === 'accepted') return err(req, '你们已经是好友了', 409)
  if (existing?.status === 'pending') {
    if (existing.requester_id === target.id && existing.addressee_id === user.id) {
      await env.DB.prepare("UPDATE friendships SET status='accepted', responded_at=? WHERE id=?").bind(Date.now(), existing.id).run()
      return json(req, { ok: true, accepted: true, friendshipId: existing.id })
    }
    return err(req, '已经发过请求了，等对方处理', 409)
  }
  const id = crypto.randomUUID()
  await env.DB.prepare("INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .bind(id, user.id, target.id, Date.now()).run()
  return json(req, { ok: true, friendshipId: id })
}

async function friendAccept(req, env, user) {
  const body = await readJSON(req)
  const id = String(body.id || '')
  const row = await env.DB.prepare("SELECT * FROM friendships WHERE id=? AND addressee_id=? AND status='pending'").bind(id, user.id).first()
  if (!row) return err(req, '没有这个待处理请求', 404)
  await env.DB.prepare("UPDATE friendships SET status='accepted', responded_at=? WHERE id=?").bind(Date.now(), id).run()
  return json(req, { ok: true })
}

async function friendReject(req, env, user) {
  const body = await readJSON(req)
  const id = String(body.id || '')
  const row = await env.DB.prepare("SELECT * FROM friendships WHERE id=? AND addressee_id=? AND status='pending'").bind(id, user.id).first()
  if (!row) return err(req, '没有这个待处理请求', 404)
  await env.DB.prepare("DELETE FROM friendships WHERE id=?").bind(id).run()
  return json(req, { ok: true })
}

async function areFriends(env, a, b) {
  const row = await env.DB.prepare(
    "SELECT id FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))"
  ).bind(a, b, b, a).first()
  return !!row
}

async function dmSend(req, env, user) {
  const body = await readJSON(req)
  const to = String(body.to || '')
  const text = String(body.text || '').trim()
  if (!to || !text) return err(req, '消息为空')
  if (text.length > 4000) return err(req, '消息太长')
  if (!(await areFriends(env, user.id, to))) return err(req, '还不是好友', 403)
  const id = crypto.randomUUID()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO relay_messages (id, sender_id, recipient_id, body, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, to, text, now, now + 7 * 86400000).run()
  return json(req, { ok: true, id, createdAt: now, expiresAt: now + 7 * 86400000 })
}

async function dmPoll(req, env, user) {
  const url = new URL(req.url)
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0)
  const now = Date.now()
  const rows = await env.DB.prepare(
    `SELECT m.id, m.sender_id, m.body, m.created_at, m.expires_at, u.username AS sender_name
     FROM relay_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.recipient_id = ? AND m.created_at > ? AND m.expires_at > ?
     ORDER BY m.created_at ASC LIMIT 200`
  ).bind(user.id, since, now).all()
  const items = (rows.results || []).map((r) => ({
    id: r.id, senderId: r.sender_id, senderName: r.sender_name, text: r.body, createdAt: r.created_at, expiresAt: r.expires_at,
  }))
  if (items.length) {
    const ids = items.map((i) => i.id)
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const placeholders = chunk.map(() => '?').join(',')
      await env.DB.prepare(`UPDATE relay_messages SET delivered_at = COALESCE(delivered_at, ?) WHERE id IN (${placeholders})`).bind(now, ...chunk).run()
    }
  }
  return json(req, { ok: true, items, now })
}

async function plazaMine(req, env, user) {
  const rows = await env.DB.prepare('SELECT id, payload, status, created_at FROM plaza_cards WHERE author_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(user.id).all()
  return json(req, { ok: true, items: (rows.results || []).map((r) => ({ id: r.id, payload: safeParse(r.payload), status: r.status, createdAt: r.created_at })) })
}

// ---------- 真人群聊 ----------
// 只存 AI 成员的 id/name/avatar 元数据，不存任何模型 Key；AI 调用留在各自客户端。
const GROUP_NAME_MAX = 40
const GROUP_MEMBER_MAX = 50
const GROUP_BOT_MAX = 20
const GROUP_MSG_MAX = 4000
const GROUP_BOT_AVATAR_MAX = 40_000

function groupMessageOut(groupId, r) {
  return {
    id: r.id,
    groupId,
    senderUserId: r.sender_user_id || null,
    senderName: r.sender_name,
    botId: r.bot_id || null,
    body: r.body,
    createdAt: r.created_at,
  }
}

async function createGroup(req, env, user) {
  const body = await readJSON(req)
  const name = String(body.name || '').trim()
  if (!name) return err(req, '群名不能为空')
  if ([...name].length > GROUP_NAME_MAX) return err(req, `群名太长（最多 ${GROUP_NAME_MAX} 字）`)

  // 真人成员：去重、忽略自己（owner 自动入群）
  const humanNames = []
  const seenNames = new Set([user.username.toLowerCase()])
  const rawHumans = Array.isArray(body.humanUsernames) ? body.humanUsernames : []
  if (rawHumans.length > GROUP_MEMBER_MAX) return err(req, `真人成员最多 ${GROUP_MEMBER_MAX} 人`)
  for (const raw of rawHumans) {
    const lower = String(raw || '').trim().toLowerCase()
    if (!lower || seenNames.has(lower)) continue
    seenNames.add(lower)
    humanNames.push(lower)
  }

  // AI 成员：只保存展示元数据
  const bots = []
  const seenBots = new Set()
  const rawBots = Array.isArray(body.bots) ? body.bots : []
  if (rawBots.length > GROUP_BOT_MAX) return err(req, `AI 成员最多 ${GROUP_BOT_MAX} 个`)
  for (const raw of rawBots) {
    if (!raw || typeof raw !== 'object') continue
    const botId = String(raw.id ?? raw.botId ?? '').trim()
    const botName = String(raw.name ?? raw.botName ?? '').trim()
    const avatar = raw.avatar == null ? '' : String(raw.avatar)
    if (!botId) return err(req, 'AI 成员缺少 id')
    if (botId.length > 120) return err(req, 'AI 成员 id 太长')
    if (!botName) return err(req, 'AI 成员缺少名字')
    if ([...botName].length > GROUP_NAME_MAX) return err(req, `AI 成员名字太长（最多 ${GROUP_NAME_MAX} 字）`)
    if (avatar.length > GROUP_BOT_AVATAR_MAX) return err(req, 'AI 成员头像太大')
    if (seenBots.has(botId)) continue
    seenBots.add(botId)
    bots.push({ id: botId, name: botName, avatar })
  }

  // 校验真人成员：存在 + 已是好友
  let humans = []
  if (humanNames.length) {
    const ph = humanNames.map(() => '?').join(',')
    const found = await env.DB.prepare(`SELECT id, username, username_lower FROM users WHERE username_lower IN (${ph})`)
      .bind(...humanNames).all()
    humans = found.results || []
    const foundSet = new Set(humans.map((r) => r.username_lower))
    const missing = humanNames.filter((n) => !foundSet.has(n))
    if (missing.length) return err(req, `找不到用户：${missing.slice(0, 3).join('、')}`, 404)
    const ids = humans.map((r) => r.id)
    const idPh = ids.map(() => '?').join(',')
    const rows = await env.DB.prepare(
      `SELECT requester_id, addressee_id FROM friendships
       WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id IN (${idPh})) OR (addressee_id = ? AND requester_id IN (${idPh})))`
    ).bind(user.id, ...ids, user.id, ...ids).all()
    const friendIds = new Set()
    for (const r of rows.results || []) friendIds.add(r.requester_id === user.id ? r.addressee_id : r.requester_id)
    const notFriends = humans.filter((r) => !friendIds.has(r.id)).map((r) => r.username)
    if (notFriends.length) return err(req, `还不是好友：${notFriends.slice(0, 3).join('、')}`, 403)
  }

  const id = crypto.randomUUID()
  const now = Date.now()
  const stmts = [
    env.DB.prepare('INSERT INTO groups (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name, user.id, now, now),
    env.DB.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .bind(id, user.id, now),
  ]
  for (const r of humans) {
    stmts.push(env.DB.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
      .bind(id, r.id, now))
  }
  for (const b of bots) {
    stmts.push(env.DB.prepare('INSERT INTO group_bots (group_id, bot_id, name, avatar, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, b.id, b.name, b.avatar, now))
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50))

  return json(req, {
    ok: true,
    group: {
      id,
      name,
      ownerId: user.id,
      createdAt: now,
      updatedAt: now,
      members: [
        { id: user.id, username: user.username, role: 'owner' },
        ...humans.map((r) => ({ id: r.id, username: r.username, role: 'member' })),
      ],
      bots,
      lastMessage: null,
    },
  })
}

async function listGroups(req, env, user) {
  const rows = await env.DB.prepare(
    `SELECT g.id, g.name, g.owner_id, g.created_at, g.updated_at
     FROM groups g JOIN group_members m ON m.group_id = g.id
     WHERE m.user_id = ? ORDER BY g.updated_at DESC LIMIT 100`
  ).bind(user.id).all()
  const groups = rows.results || []
  if (!groups.length) return json(req, { ok: true, groups: [] })

  const ids = groups.map((g) => g.id)
  const ph = ids.map(() => '?').join(',')
  const memberRows = await env.DB.prepare(
    `SELECT gm.group_id, gm.user_id, gm.role, u.username FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id IN (${ph}) ORDER BY gm.joined_at ASC`
  ).bind(...ids).all()
  const botRows = await env.DB.prepare(
    `SELECT group_id, bot_id, name, avatar FROM group_bots WHERE group_id IN (${ph}) ORDER BY created_at ASC`
  ).bind(...ids).all()
  const lastRows = await env.DB.prepare(
    `SELECT m.group_id, m.id, m.sender_user_id, m.sender_name, m.bot_id, m.body, m.created_at
     FROM group_messages m
     WHERE m.group_id IN (${ph}) AND m.created_at = (SELECT MAX(m2.created_at) FROM group_messages m2 WHERE m2.group_id = m.group_id)
     ORDER BY m.created_at DESC`
  ).bind(...ids).all()

  const memberMap = new Map()
  for (const r of memberRows.results || []) {
    if (!memberMap.has(r.group_id)) memberMap.set(r.group_id, [])
    memberMap.get(r.group_id).push({ id: r.user_id, username: r.username, role: r.role })
  }
  const botMap = new Map()
  for (const r of botRows.results || []) {
    if (!botMap.has(r.group_id)) botMap.set(r.group_id, [])
    botMap.get(r.group_id).push({ id: r.bot_id, name: r.name, avatar: r.avatar || '' })
  }
  const lastMap = new Map()
  for (const r of lastRows.results || []) {
    if (!lastMap.has(r.group_id)) lastMap.set(r.group_id, groupMessageOut(r.group_id, r))
  }
  return json(req, {
    ok: true,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      ownerId: g.owner_id,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      members: memberMap.get(g.id) || [],
      bots: botMap.get(g.id) || [],
      lastMessage: lastMap.get(g.id) || null,
    })),
  })
}

async function groupMessages(req, env, user, groupId) {
  const group = await env.DB.prepare('SELECT id FROM groups WHERE id = ?').bind(groupId).first()
  if (!group) return err(req, '群不存在', 404)
  const member = await env.DB.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, user.id).first()
  if (!member) return err(req, '不是群成员', 403)
  const url = new URL(req.url)
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0)
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))
  const rows = await env.DB.prepare(
    'SELECT id, sender_user_id, sender_name, bot_id, body, created_at FROM group_messages WHERE group_id = ? AND created_at > ? ORDER BY created_at ASC, id ASC LIMIT ?'
  ).bind(groupId, since, limit).all()
  return json(req, {
    ok: true,
    groupId,
    since,
    items: (rows.results || []).map((r) => groupMessageOut(groupId, r)),
    hasMore: (rows.results || []).length === limit,
    now: Date.now(),
  })
}

async function sendGroupMessage(req, env, user, groupId) {
  const group = await env.DB.prepare('SELECT id FROM groups WHERE id = ?').bind(groupId).first()
  if (!group) return err(req, '群不存在', 404)
  const member = await env.DB.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, user.id).first()
  if (!member) return err(req, '不是群成员', 403)

  const body = await readJSON(req)
  const text = String(body.body ?? body.text ?? '').trim()
  if (!text) return err(req, '消息不能为空')
  if ([...text].length > GROUP_MSG_MAX) return err(req, `消息太长（最多 ${GROUP_MSG_MAX} 字）`)

  const rawBotId = body.botId == null ? '' : String(body.botId).trim()
  const rawBotName = body.botName == null ? '' : String(body.botName).trim()
  if (rawBotName && !rawBotId) return err(req, 'AI 消息需要 botId')
  if (rawBotName && [...rawBotName].length > GROUP_NAME_MAX) return err(req, 'AI 成员名字太长')

  // 真人消息：senderUserId = 当前用户；AI 消息：botId 必须在本群 AI 名单里，senderUserId 为空
  let senderUserId = user.id
  let senderName = user.username
  let botId = null
  if (rawBotId) {
    if (rawBotId.length > 120) return err(req, 'botId 太长')
    const bot = await env.DB.prepare('SELECT bot_id, name FROM group_bots WHERE group_id = ? AND bot_id = ?').bind(groupId, rawBotId).first()
    if (!bot) return err(req, '这个 AI 成员不在群里', 400)
    botId = bot.bot_id
    senderUserId = null
    senderName = rawBotName || bot.name
  }

  const id = crypto.randomUUID()
  // 同群内 createdAt 单调递增，避免 since 分页在毫秒撞车时丢消息
  const prev = await env.DB.prepare('SELECT MAX(created_at) AS max_created FROM group_messages WHERE group_id = ?').bind(groupId).first()
  const createdAt = Math.max(Date.now(), (prev?.max_created || 0) + 1)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO group_messages (id, group_id, sender_user_id, sender_name, bot_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, groupId, senderUserId, senderName, botId, text, createdAt),
    env.DB.prepare('UPDATE groups SET updated_at = ? WHERE id = ?').bind(createdAt, groupId),
  ])
  const message = { id, groupId, senderUserId, senderName, botId, body: text, createdAt }
  return json(req, { ok: true, id, createdAt, message })
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
  await env.DB.prepare('DELETE FROM relay_messages WHERE expires_at < ?').bind(now).run()
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
      if (path === '/api/plaza/cards' && req.method === 'GET') return listPlaza(req, env)
      if (path === '/api/plaza/cards' && req.method === 'POST') {
        const user = await currentUser(req, env)
        return user ? uploadPlaza(req, env, user) : err(req, '登录后才能上传', 401)
      }
      if (path.startsWith('/api/plaza/cards/') && req.method === 'DELETE') {
        const user = await currentUser(req, env)
        if (!user) return err(req, '未登录', 401)
        return deletePlaza(req, env, user, decodeURIComponent(path.slice('/api/plaza/cards/'.length)))
      }
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
      if (path === '/api/friends' && req.method === 'GET') return user ? friendsList(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/friends/request' && req.method === 'POST') return user ? friendRequest(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/friends/accept' && req.method === 'POST') return user ? friendAccept(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/friends/reject' && req.method === 'POST') return user ? friendReject(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/dm/send' && req.method === 'POST') return user ? dmSend(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/dm/poll' && req.method === 'GET') return user ? dmPoll(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/dm/status' && req.method === 'GET') return user ? dmStatus(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/plaza/mine' && req.method === 'GET') return user ? plazaMine(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/sync/push' && req.method === 'POST') return user ? push(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/sync/pull' && req.method === 'GET') return user ? pull(req, env, user) : err(req, '未登录', 401)
      // 真人群聊
      if (path === '/api/groups' && req.method === 'GET') return user ? listGroups(req, env, user) : err(req, '未登录', 401)
      if (path === '/api/groups' && req.method === 'POST') return user ? createGroup(req, env, user) : err(req, '未登录', 401)
      const groupMessagesMatch = path.match(/^\/api\/groups\/([^/]+)\/messages$/)
      if (groupMessagesMatch) {
        if (!user) return err(req, '未登录', 401)
        if (req.method !== 'GET' && req.method !== 'POST') return err(req, 'not found', 404)
        const groupId = decodeURIComponent(groupMessagesMatch[1])
        if (!groupId || groupId.length > 80) return err(req, '群 id 不合法')
        if (req.method === 'GET') return groupMessages(req, env, user, groupId)
        return sendGroupMessage(req, env, user, groupId)
      }
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
