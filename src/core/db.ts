import Dexie, { type Table } from 'dexie'
import type { ApiProfile, Character, Conversation, Message } from './types'

export interface KV {
  key: string
  value: unknown
}

/**
 * 本地优先存储：MVP 用 IndexedDB（Dexie），无需后端进程。
 * 所有表都按「可整体导出/导入」设计，后续迁移到 SQLite 或其他端时按表搬运即可。
 */
class QPersonaDB extends Dexie {
  characters!: Table<Character, string>
  conversations!: Table<Conversation, string>
  messages!: Table<Message, string>
  profiles!: Table<ApiProfile, string>
  kv!: Table<KV, string>

  constructor() {
    super('qpersona')
    this.version(1).stores({
      characters: 'id, updatedAt',
      conversations: 'id, lastTs, characterId',
      messages: 'id, conversationId, [conversationId+ts], ts',
      profiles: 'id',
      kv: 'key',
    })
  }
}

export const db = new QPersonaDB()

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value })
}
