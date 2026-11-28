export interface ServerGroupMember {
  id: string
  username: string
  role: 'owner' | 'member' | string
}

export interface ServerGroupBot {
  id: string
  name: string
  avatar?: string
}

export interface ServerGroupMessage {
  id: string
  groupId: string
  senderUserId: string | null
  senderName: string
  botId: string | null
  body: string
  createdAt: number
}

export interface ServerGroup {
  id: string
  name: string
  ownerId: string
  createdAt: number
  updatedAt: number
  members: ServerGroupMember[]
  bots: ServerGroupBot[]
  lastMessage?: ServerGroupMessage | null
}

async function request<T>(
  base: string,
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || `请求失败（HTTP ${res.status}）`)
  return data as T
}

export async function createServerGroup(
  base: string,
  token: string,
  input: { name: string; humanUsernames: string[]; bots: ServerGroupBot[] },
): Promise<ServerGroup> {
  const data = await request<{ group: ServerGroup }>(base, '/api/groups', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.group
}

export async function listServerGroups(base: string, token: string): Promise<ServerGroup[]> {
  const data = await request<{ groups: ServerGroup[] }>(base, '/api/groups', token)
  return data.groups || []
}

export async function fetchServerGroupMessages(
  base: string,
  token: string,
  groupId: string,
  since = 0,
): Promise<ServerGroupMessage[]> {
  const data = await request<{ items: ServerGroupMessage[] }>(
    base,
    `/api/groups/${encodeURIComponent(groupId)}/messages?since=${since}`,
    token,
  )
  return data.items || []
}

export async function sendServerGroupMessage(
  base: string,
  token: string,
  groupId: string,
  input: { body: string; botId?: string; botName?: string },
): Promise<ServerGroupMessage> {
  const data = await request<{ message: ServerGroupMessage }>(
    base,
    `/api/groups/${encodeURIComponent(groupId)}/messages`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return data.message
}
