import type { CardData, PersonaExt } from './types'
import { emptyExt } from './card'

export interface PlazaCard {
  id: string
  author: string
  uploadedAt: number
  downloads: number
  card: CardData
  qq: Partial<PersonaExt['qq']>
  avatar?: string
  authorId?: string
  status?: 'approved' | 'pending' | 'rejected' | string
}

export type PlazaSort = 'hot' | 'new'

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function safeImage(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  if (v.startsWith('data:image/')) return v
  if (/^https?:\/\//i.test(v)) return v
  return undefined
}

function normalizeCard(raw: any): CardData {
  const c = raw?.card ?? raw?.data ?? raw ?? {}
  return {
    name: text(c.name, 40) || '未命名角色',
    description: text(c.description, 2000),
    personality: text(c.personality, 2000),
    scenario: text(c.scenario, 1000),
    first_mes: text(c.first_mes, 1000),
    mes_example: text(c.mes_example, 4000),
    creator_notes: text(c.creator_notes, 1000),
    system_prompt: text(c.system_prompt, 2000),
    post_history_instructions: text(c.post_history_instructions, 1000),
    alternate_greetings: Array.isArray(c.alternate_greetings)
      ? c.alternate_greetings.filter((x: unknown) => typeof x === 'string').slice(0, 6)
      : [],
    character_book: c.character_book ?? undefined,
    tags: Array.isArray(c.tags)
      ? c.tags.filter((t: unknown) => typeof t === 'string').slice(0, 8).map((t: string) => t.slice(0, 20))
      : [],
    creator: text(c.creator, 60),
    character_version: text(c.character_version, 30),
    extensions: {},
  }
}

function normalizeChatProfile(raw: any): Partial<PersonaExt['qq']> {
  const q = raw && typeof raw === 'object' ? raw : {}
  return {
    nickname: text(q.nickname, 30) || undefined,
    signature: text(q.signature, 120) || undefined,
    interests: Array.isArray(q.interests)
      ? q.interests.filter((x: unknown) => typeof x === 'string').slice(0, 8).map((x: string) => x.slice(0, 20))
      : undefined,
    aliases: Array.isArray(q.aliases)
      ? q.aliases.filter((x: unknown) => typeof x === 'string').slice(0, 8).map((x: string) => x.slice(0, 20))
      : undefined,
    avatar: safeImage(q.avatar),
  }
}

/** 把任意来源的广场 JSON 归一化成稳定结构；坏数据直接丢掉 */
export function normalizePlaza(raw: unknown): PlazaCard[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.cards)
      ? (raw as any).cards
      : []
  const out: PlazaCard[] = []
  for (let i = 0; i < list.length && out.length < 200; i++) {
    const item = list[i]
    if (!item || typeof item !== 'object') continue
    const card = normalizeCard(item)
    if (!card.name || card.name === '未命名角色') continue
    const embedded = (card.extensions?.qpersona ?? (item.card?.extensions?.qpersona ?? null)) as any
    out.push({
      id: text(item.id, 60) || `plaza_${i}`,
      author: text(item.author, 40) || '匿名',
      uploadedAt: Number(item.uploadedAt) || 0,
      downloads: Math.max(0, Number(item.downloads) || 0),
      card,
      qq: normalizeChatProfile(item.qq ?? embedded?.qq),
      avatar: safeImage(item.avatar),
    })
  }
  return out
}

export function extForPlaza(item: PlazaCard): PersonaExt {
  const ext = emptyExt(item.card.name, 'import')
  ext.qq.nickname = item.qq.nickname || item.card.name
  ext.qq.signature = item.qq.signature || ''
  ext.qq.interests = item.qq.interests?.length ? item.qq.interests : (item.card.tags ?? []).slice(0, 6)
  ext.qq.aliases = item.qq.aliases ?? []
  ext.qq.avatar = item.avatar || item.qq.avatar || ''
  return ext
}

export function plazaTags(cards: PlazaCard[]): { tag: string; count: number }[] {
  const map = new Map<string, number>()
  for (const c of cards) for (const t of c.card.tags ?? []) map.set(t, (map.get(t) ?? 0) + 1)
  return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
}

export function searchPlaza(
  cards: PlazaCard[],
  query: string,
  tag = '',
  sort: PlazaSort = 'hot',
): PlazaCard[] {
  const q = query.trim().toLowerCase()
  let list = cards
  if (tag) list = list.filter((c) => (c.card.tags ?? []).includes(tag))
  if (q) {
    list = list.filter((c) =>
      [
        c.card.name,
        c.card.description,
        c.card.personality,
        c.card.scenario,
        c.card.first_mes,
        c.author,
        c.qq.nickname,
        c.qq.signature,
        ...(c.card.tags ?? []),
        ...(c.qq.interests ?? []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }
  return [...list].sort((a, b) =>
    sort === 'new' ? b.uploadedAt - a.uploadedAt : b.downloads - a.downloads,
  )
}


export async function fetchCloudPlaza(base: string): Promise<PlazaCard[]> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/plaza/cards?limit=100`)
  if (!res.ok) throw new Error(`云端广场加载失败（HTTP ${res.status}）`)
  const data = await res.json()
  const cards = (Array.isArray(data?.items) ? data.items : []).map((item: any) => ({
    ...(item.payload || {}),
    id: item.id,
    author: item.author || '匿名',
    authorId: item.authorId || '',
    status: item.status || 'approved',
    uploadedAt: item.uploadedAt || 0,
    downloads: 0,
  }))
  return normalizePlaza({ cards })
}

export interface MyPlazaCard {
  id: string
  status: string
  createdAt: number
  payload: { card?: CardData; qq?: Partial<PersonaExt['qq']>; avatar?: string }
}

export async function fetchMyPlaza(base: string, token: string): Promise<MyPlazaCard[]> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/plaza/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || `加载失败（HTTP ${res.status}）`)
  return (data.items || []) as MyPlazaCard[]
}

export async function deleteCloudPlaza(base: string, token: string, id: string): Promise<void> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/plaza/cards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || `删除失败（HTTP ${res.status}）`)
}

export async function uploadCloudPlaza(
  base: string,
  token: string,
  card: CardData,
  qq: Partial<PersonaExt['qq']>,
  avatar?: string,
): Promise<void> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/plaza/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ card, qq, avatar }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || `上传失败（HTTP ${res.status}）`)
}
