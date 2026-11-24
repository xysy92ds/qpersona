import type { CardData, PersonaExt } from './types'
import { emptyExt } from './card'

export interface HumanPeer {
  id: string
  username: string
}

export interface FriendItem {
  id: string
  status: 'pending' | 'accepted'
  peer: HumanPeer
  direction: 'in' | 'out'
  createdAt: number
}

export interface HumanMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  createdAt: number
  expiresAt: number
}

async function api<T>(base: string, path: string, token: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || `请求失败（HTTP ${res.status}）`)
  return data as T
}

export async function listFriends(base: string, token: string) {
  return api<{ friends: FriendItem[]; incoming: FriendItem[]; outgoing: FriendItem[] }>(base, '/api/friends', token)
}

export async function requestFriend(base: string, token: string, username: string) {
  return api<{ accepted?: boolean; friendshipId: string }>(base, '/api/friends/request', token, {
    method: 'POST',
    body: { username },
  })
}

export async function acceptFriend(base: string, token: string, id: string) {
  return api(base, '/api/friends/accept', token, { method: 'POST', body: { id } })
}

export async function rejectFriend(base: string, token: string, id: string) {
  return api(base, '/api/friends/reject', token, { method: 'POST', body: { id } })
}

export async function sendDirect(base: string, token: string, to: string, text: string) {
  return api<{ id: string; createdAt: number; expiresAt: number }>(base, '/api/dm/send', token, {
    method: 'POST',
    body: { to, text },
  })
}

export async function pollDirect(base: string, token: string, since: number) {
  return api<{ items: HumanMessage[]; now: number }>(base, `/api/dm/poll?since=${since}`, token)
}

export function humanCard(peer: HumanPeer): { card: CardData; ext: PersonaExt } {
  const name = peer.username
  return {
    card: {
      name,
      description: `真人好友 · @${name}`,
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
      tags: ['真人好友'],
      alternate_greetings: [],
      extensions: {},
    },
    ext: {
      ...emptyExt(name, 'human'),
      human: { userId: peer.id, username: peer.username },
      toggles: { chat: true, memory: false },
    },
  }
}


export async function fetchDelivery(base: string, token: string, ids: string[]) {
  return api<{ items: { id: string; deliveredAt?: number; expiresAt: number; missing?: boolean }[] }>(
    base,
    `/api/dm/status?ids=${encodeURIComponent(ids.join(','))}`,
    token,
  )
}
