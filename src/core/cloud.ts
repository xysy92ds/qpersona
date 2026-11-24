import { db } from './db'
import type { Character, Conversation, Memory, Message, Sticker } from './types'

export interface CloudUser {
  id: string
  username: string
}

export interface SyncItem {
  kind: 'characters' | 'conversations' | 'messages' | 'memories' | 'stickers'
  id: string
  updatedAt: number
  deleted?: boolean
  payload: unknown
}

const KINDS = ['characters', 'conversations', 'messages', 'memories', 'stickers'] as const
export type SyncKind = (typeof KINDS)[number]

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

async function api<T>(
  base: string,
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    throw new Error(`服务端返回异常（HTTP ${res.status}）`)
  }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `请求失败（HTTP ${res.status}）`)
  }
  return data as T
}

export async function cloudRegister(base: string, username: string, password: string) {
  return api<{ token: string; user: CloudUser }>(base, '/api/auth/register', {
    method: 'POST',
    body: { username, password },
  })
}

export async function cloudLogin(base: string, username: string, password: string) {
  return api<{ token: string; user: CloudUser }>(base, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  })
}

export async function cloudLogout(base: string, token: string) {
  try {
    await api(base, '/api/auth/logout', { method: 'POST', token })
  } catch {
    /* ignore */
  }
}

export async function cloudMe(base: string, token: string) {
  return api<{ user: CloudUser; counts: Record<string, number> }>(base, '/api/me', { token })
}

export async function cloudPull(base: string, token: string, since: number) {
  return api<{ since: number; items: SyncItem[]; now: number }>(
    base,
    `/api/sync/pull?since=${encodeURIComponent(String(since))}`,
    { token },
  )
}

export async function cloudPush(base: string, token: string, items: SyncItem[]) {
  const chunks: SyncItem[][] = []
  for (let i = 0; i < items.length; i += 500) chunks.push(items.slice(i, i + 500))
  let accepted = 0
  let now = Date.now()
  for (const chunk of chunks) {
    const res = await api<{ accepted: number; now: number }>(base, '/api/sync/push', {
      method: 'POST',
      token,
      body: { items: chunk },
    })
    accepted += res.accepted
    now = res.now
  }
  return { accepted, now }
}

function stampOf(kind: SyncKind, row: any): number {
  if (kind === 'characters') return Number(row.updatedAt || row.createdAt || 0)
  if (kind === 'conversations') {
    return Math.max(Number(row.lastTs || 0), Number(row.memoryLastAt || 0), Number(row.createdAt || 0))
  }
  if (kind === 'messages') return Number(row.ts || 0)
  if (kind === 'memories') return Number(row.updatedAt || row.createdAt || 0)
  if (kind === 'stickers') return Number(row.createdAt || 0)
  return 0
}

export async function collectLocalItems(): Promise<SyncItem[]> {
  const [characters, conversations, messages, memories, stickers] = await Promise.all([
    db.characters.toArray(),
    db.conversations.toArray(),
    db.messages.toArray(),
    db.memories.toArray(),
    db.stickers.toArray(),
  ])
  const items: SyncItem[] = []
  const add = (kind: SyncKind, rows: any[]) => {
    for (const row of rows) {
      if (!row?.id) continue
      items.push({ kind, id: String(row.id), updatedAt: stampOf(kind, row), payload: toPlain(row) })
    }
  }
  add('characters', characters)
  add('conversations', conversations)
  add('messages', messages)
  add('memories', memories)
  add('stickers', stickers)
  return items
}

function localTimeMap(items: SyncItem[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const it of items) map.set(`${it.kind}:${it.id}`, it.updatedAt)
  return map
}

/** 把云端比本地新的条目写回本地；删除标记直接删除 */
/** 本地只是初始演示数据时，登录已有账号前清掉，避免和云端角色重复 */
export async function clearDemoIfOnly(local: SyncItem[]): Promise<boolean> {
  const chars = local.filter((i) => i.kind === 'characters')
  if (!chars.length) return false
  const onlyDemo = chars.every((i) => (i.payload as any)?.ext?.origin === 'demo')
  if (!onlyDemo) return false
  await db.transaction(
    'rw',
    [db.characters, db.conversations, db.messages, db.memories, db.stickers],
    async () => {
      await db.messages.clear()
      await db.conversations.clear()
      await db.characters.clear()
      await db.memories.clear()
      await db.stickers.clear()
    },
  )
  return true
}

export async function applyRemoteItems(remote: SyncItem[], local: SyncItem[]): Promise<number> {
  const localMap = localTimeMap(local)
  let applied = 0
  const byKind: Record<string, SyncItem[]> = {}
  for (const item of remote) {
    if (!KINDS.includes(item.kind as SyncKind) || !item.id) continue
    const key = `${item.kind}:${item.id}`
    const localTs = localMap.get(key) ?? 0
    if (item.updatedAt <= localTs) continue
    byKind[item.kind] = byKind[item.kind] || []
    byKind[item.kind]!.push(item)
  }
  for (const kind of ['characters', 'conversations', 'messages', 'memories', 'stickers'] as SyncKind[]) {
    const rows = byKind[kind] || []
    if (!rows.length) continue
    await db.transaction('rw', db[kind], async () => {
      for (const item of rows) {
        if (item.deleted) {
          await db[kind].delete(item.id)
        } else if (item.payload) {
          await db[kind].put(item.payload as any)
        }
        applied++
      }
    })
  }
  return applied
}

export type { Character, Conversation, Memory, Message, Sticker }
