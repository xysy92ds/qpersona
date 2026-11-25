import { defineStore } from 'pinia'
import { db, putMemory } from '@/core/db'
import type { Memory, MemoryType, Message } from '@/core/types'
import { MEMORY_TYPES } from '@/core/types'
import { completeChat } from '@/core/llm'
import { uid } from '@/core/util'
import { useContactsStore } from './contacts'
import { useSettingsStore } from './settings'

const VALID_TYPES = new Set<string>(MEMORY_TYPES.map((t) => t.id))
const TYPE_LABEL: Record<MemoryType, string> = Object.fromEntries(
  MEMORY_TYPES.map((t) => [t.id, t.label]),
) as Record<MemoryType, string>

/** 串行队列：同一时间只跑一个总结，避免并发抢同一段对话 */
let queue: Promise<unknown> = Promise.resolve()

function textOf(m: Message): string {
  if (m.kind === 'sticker') return `[表情包：${m.sticker?.name ?? ''}]`
  if (m.kind === 'file') return `[文件：${m.file?.name ?? ''}]`
  return m.text
}

function normalizeContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .trim()
}

function pickJSON(raw: string): any {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

export const useMemoryStore = defineStore('memory', {
  state: () => ({
    byCharacter: {} as Record<string, Memory[]>,
    loaded: {} as Record<string, boolean>,
    summarizing: {} as Record<string, boolean>,
    lastRun: {} as Record<string, number>,
  }),

  getters: {
    memoriesOf(state) {
      return (characterId?: string): Memory[] => (characterId ? state.byCharacter[characterId] ?? [] : [])
    },
  },

  actions: {
    async load(characterId: string, force = false) {
      if (!characterId) return
      if (this.loaded[characterId] && !force) return
      const rows = await db.memories.where('characterId').equals(characterId).toArray()
      rows.sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
        return b.importance - a.importance || b.createdAt - a.createdAt
      })
      this.byCharacter[characterId] = rows
      this.loaded[characterId] = true
    },

    async remove(id: string) {
      const row = await db.memories.get(id)
      await db.memories.delete(id)
      for (const key of Object.keys(this.byCharacter)) {
        this.byCharacter[key] = this.byCharacter[key]!.filter((m) => m.id !== id)
      }
      if (row) this.loaded[row.characterId] = false
    },

    /** 手动添加；内容相同则合并重要度/标签，不产生重复 */
    async add(
      characterId: string,
      data: { type: MemoryType; content: string; importance: number; tags?: string[]; pinned?: boolean; source?: 'group' | 'private' },
    ): Promise<Memory | null> {
      const content = data.content.trim().slice(0, 120)
      if (!content) return null
      const rows = await db.memories.where('characterId').equals(characterId).toArray()
      const norm = normalizeContent(content)
      const dup = rows.find((m) => normalizeContent(m.content) === norm)
      const now = Date.now()
      if (dup) {
        const next: Memory = {
          ...dup,
          importance: Math.max(dup.importance, Math.max(1, Math.min(10, data.importance))),
          tags: [...new Set([...(dup.tags ?? []), ...(data.tags ?? [])])].slice(0, 8),
          pinned: !!dup.pinned || !!data.pinned,
          updatedAt: now,
        }
        await putMemory(next)
        await this.load(characterId, true)
        return next
      }
      const row: Memory = {
        id: uid('mem'),
        characterId,
        type: data.type,
        content,
        importance: Math.max(1, Math.min(10, Math.round(data.importance))),
        tags: (data.tags ?? []).slice(0, 8),
        source: data.source,
        pinned: !!data.pinned,
        createdAt: now,
        updatedAt: now,
        lastAccessed: 0,
      }
      await putMemory(row)
      await this.load(characterId, true)
      return row
    },

    async update(id: string, patch: Partial<Pick<Memory, 'type' | 'content' | 'importance' | 'tags' | 'pinned'>>) {
      const row = await db.memories.get(id)
      if (!row) return
      const next: Memory = {
        ...row,
        ...patch,
        content: patch.content !== undefined ? patch.content.trim().slice(0, 120) : row.content,
        importance: patch.importance !== undefined ? Math.max(1, Math.min(10, Math.round(patch.importance))) : row.importance,
        tags: patch.tags ? [...new Set(patch.tags)].slice(0, 8) : row.tags,
        updatedAt: Date.now(),
      }
      await putMemory(next)
      await this.load(next.characterId, true)
    },

    async togglePin(id: string) {
      const row = await db.memories.get(id)
      if (!row) return
      await this.update(id, { pinned: !row.pinned })
    },

    /** 把同一角色里内容重复的记忆合并，返回删掉的条数 */
    async mergeDuplicates(characterId: string): Promise<number> {
      const rows = await db.memories.where('characterId').equals(characterId).toArray()
      const groups = new Map<string, Memory[]>()
      for (const m of rows) {
        const key = normalizeContent(m.content)
        if (!key) continue
        groups.set(key, [...(groups.get(key) ?? []), m])
      }
      let removed = 0
      for (const group of groups.values()) {
        if (group.length < 2) continue
        group.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.importance - a.importance || a.createdAt - b.createdAt)
        const keep = group[0]!
        const tags = [...new Set(group.flatMap((m) => m.tags ?? []))].slice(0, 8)
        const next: Memory = {
          ...keep,
          tags,
          importance: Math.max(...group.map((m) => m.importance)),
          pinned: group.some((m) => m.pinned),
          updatedAt: Date.now(),
        }
        await putMemory(next)
        for (const m of group.slice(1)) {
          await db.memories.delete(m.id)
          removed++
        }
      }
      if (removed) await this.load(characterId, true)
      return removed
    },

    /**
     * 关键词 + importance 的轻量召回。中文按二元组命中，够用且零模型调用。
     * includePrivate=false 时只返回群聊里得来的记忆（群聊设置里可以关掉私聊记忆）。
     */
    async recall(
      characterId: string,
      query: string,
      opts: { includePrivate?: boolean; limit?: number } = {},
    ): Promise<string> {
      const all = (await db.memories.where('characterId').equals(characterId).toArray()).filter(
        (m) => (opts.includePrivate === false ? m.source === 'group' : true),
      )
      if (!all.length) return ''

      const q = query.slice(-240)
      const grams = new Set<string>()
      for (let i = 0; i < q.length - 1; i++) {
        const g = q.slice(i, i + 2)
        if (/[\u4e00-\u9fa5]/.test(g)) grams.add(g)
      }

      const scored = all.map((m) => {
        let hit = 0
        for (const g of grams) {
          if (m.content.includes(g) || m.tags.some((t) => t.includes(g))) hit++
        }
        const base = m.importance * 0.35
        const typeBoost = m.type === 'instruction' ? 1.2 : m.type === 'relationship' ? 0.7 : 0
        return { m, score: hit * 1.1 + base + typeBoost + (m.pinned ? 2 : 0) }
      })

      scored.sort((a, b) => b.score - a.score)
      const top = scored.filter((s) => s.score >= 1.1).slice(0, Math.max(1, opts.limit ?? 7))
      if (!top.length) return ''

      return top
        .map(({ m }) => {
          const where = m.source === 'group' ? '[群聊]' : ''
          return `- ${where}[${TYPE_LABEL[m.type] ?? '记忆'}] ${m.content}`
        })
        .join('\n')
    },

    /** 单聊每轮回复后调用；不阻塞聊天，后台串行跑总结 */
    maybeSummarize(conversationId: string) {
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const conv = contacts.conversationById(conversationId)
      if (!conv || conv.kind === 'group') return
      if (!settings.flags.memory) return
      const ch = contacts.characterById(conv.characterId)
      if (!ch || !ch.ext.toggles.memory) return

      queue = queue
        .then(async () => {
          const rows = await db.messages.where('conversationId').equals(conversationId).toArray()
          const after = conv.memoryLastTs ?? 0
          const fresh = rows.filter(
            (m) => m.ts > after && (m.role === 'user' || m.role === 'assistant') && m.kind !== 'tip',
          )
          const plan = settings.memoryPlan
          if (plan.mode === 'messages') {
            if (fresh.length < plan.every) return
          } else {
            const lastAt = conv.memoryLastAt ?? conv.createdAt
            if (fresh.length < 5 || Date.now() - lastAt < plan.minutes * 60000) return
          }
          await this.summarize(conversationId)
        })
        .catch((e) => console.warn('[memory] summarize failed', e))
    },

    /**
     * 群聊总结：每个发言角色只整理自己视角的群消息，最多两个角色，避免一次群聊烧 N 份钱。
     * 产物会带 source='group'，私聊召回时也能看到。
     */
    maybeSummarizeGroup(conversationId: string, characterIds: string[]) {
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      if (!settings.flags.memory) return
      const conv = contacts.conversationById(conversationId)
      if (!conv || conv.kind !== 'group') return
      const ids = [...new Set(characterIds)].slice(0, 2)
      for (const id of ids) {
        const ch = contacts.characterById(id)
        if (!ch || !ch.ext.toggles.memory) continue
        queue = queue
          .then(async () => {
            const current = contacts.conversationById(conversationId)
            if (!current) return
            const after = current.groupMemoryTs?.[ch.id] ?? 0
            const rows = await db.messages.where('conversationId').equals(conversationId).toArray()
            const fresh = rows.filter(
              (m) => m.ts > after && (m.role === 'user' || m.role === 'assistant') && m.kind !== 'tip',
            )
            const plan = settings.memoryPlan
            if (plan.mode === 'messages') {
              if (fresh.length < plan.every) return
            } else {
              const lastAt = current.memoryLastAt ?? current.createdAt
              if (fresh.length < 8 || Date.now() - lastAt < plan.minutes * 60000) return
            }
            await this.summarize(conversationId, { characterId: ch.id, source: 'group' })
          })
          .catch((e) => console.warn('[memory] group summarize failed', e))
      }
    },

    /** 手动「立即整理」也走这里；返回新增条数 */
    async summarize(
      conversationId: string,
      options: { characterId?: string; source?: 'group' | 'private' } = {},
    ): Promise<number> {
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const conv = contacts.conversationById(conversationId)
      if (!conv) return 0
      const ch = options.characterId
        ? contacts.characterById(options.characterId)
        : contacts.characterById(conv.characterId)
      if (!ch) return 0
      const source: 'group' | 'private' =
        options.source ?? (conv.kind === 'group' ? 'group' : 'private')
      const profile = settings.profileFor('memory_summary', ch.ext.routing.memory_summary)
      if (!profile) {
        return 0
      }
      const key = `${conversationId}:${ch.id}`
      if (this.summarizing[key]) return 0

      const rows = await db.messages.where('conversationId').equals(conversationId).toArray()
      rows.sort((a, b) => a.ts - b.ts)
      const after =
        source === 'group' ? conv.groupMemoryTs?.[ch.id] ?? 0 : conv.memoryLastTs ?? 0
      const fresh = rows.filter(
        (m) => m.ts > after && (m.role === 'user' || m.role === 'assistant') && m.kind !== 'tip' && textOf(m).trim(),
      )
      if (!fresh.length) return 0

      this.summarizing[key] = true
      try {
        const existing = await db.memories.where('characterId').equals(ch.id).toArray()
        const existingText = existing
          .slice(-12)
          .map((m) => `- ${m.content}`)
          .join('\n')

        let transcript: string
        if (source === 'group') {
          const names: Record<string, string> = {}
          for (const id of conv.memberIds ?? []) {
            const m = contacts.characterById(id)
            if (m) names[id] = m.ext.qq.nickname || m.card.name
          }
          transcript = fresh
            .slice(-40)
            .map((m) => {
              const who = m.role === 'user' ? settings.user.nickname : names[m.characterId ?? ''] || '群友'
              return `${who}：${textOf(m)}`
            })
            .join('\n')
        } else {
          transcript = fresh
            .slice(-40)
            .map((m) => `${m.role === 'user' ? settings.user.nickname : ch.card.name}：${textOf(m)}`)
            .join('\n')
        }

        const prompt = `角色：${ch.card.name}
对方：${settings.user.nickname}

已有的记忆（不要重复）：
${existingText || '（暂无）'}

${source === 'group' ? '最近群聊：' : '最近聊天：'}
${transcript}

请提取值得长期记住的信息，输出 JSON：
{"memories":[{"type":"fact|preference|relationship|event|instruction|reflection","content":"一句话，不超过40字","importance":1到10,"tags":["关键词"]}]}

规则：
- 只记以后聊天用得上的：对方的稳定信息、偏好、约定、发生过的事件、关系变化、你对 TA 的印象。
- 不记一次性的寒暄、天气、临时的情绪。
- 用第三人称陈述，例如「对方怕黑」「你们约好周末去看展」。
${source === 'group' ? '- 这是群聊记录：只记与你（角色）和对方有关的事，不要记录其他群成员的隐私。\n' : ''}- 最多 6 条；没有新内容就返回 {"memories":[]}。`

        const raw = await completeChat({
          profile,
          messages: [
            { role: 'system', content: '你是聊天记忆整理器，只输出 JSON，不要解释。' },
            { role: 'user', content: prompt },
          ],
          json: true,
          maxTokens: 900,
          temperature: 0.3,
        })

        const data = pickJSON(raw)
        const items = Array.isArray(data?.memories) ? data.memories : []
        let created = 0
        for (const item of items.slice(0, 6)) {
          const content = String(item?.content ?? '').trim()
          if (!content) continue
          const type = VALID_TYPES.has(item?.type) ? (item.type as MemoryType) : 'fact'
          const importance = Math.max(1, Math.min(10, Number(item?.importance) || 5))
          const tags = Array.isArray(item?.tags) ? item.tags.slice(0, 4).map(String) : []
          const dup = existing.find((m) => normalizeContent(m.content) === normalizeContent(content))
          if (dup) {
            dup.importance = Math.max(dup.importance, importance)
            dup.tags = [...new Set([...(dup.tags ?? []), ...tags])].slice(0, 8)
            dup.updatedAt = Date.now()
            await putMemory(dup)
            continue
          }
          const memory: Memory = {
            id: uid('mem'),
            characterId: ch.id,
            conversationId,
            type,
            content: content.slice(0, 120),
            importance,
            source,
            tags,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastAccessed: 0,
          }
          await putMemory(memory)
          existing.push(memory)
          created++
        }

        const lastTs = fresh[fresh.length - 1]!.ts
        if (source === 'group') {
          await contacts.touch(conversationId, {
            groupMemoryTs: { ...(conv.groupMemoryTs ?? {}), [ch.id]: lastTs },
            memoryLastAt: Date.now(),
          })
        } else {
          await contacts.touch(conversationId, { memoryLastTs: lastTs, memoryLastAt: Date.now() })
        }
        await this.load(ch.id, true)
        this.lastRun[key] = Date.now()
        return created
      } catch (e) {
        console.warn('[memory] summarize error', e)
        return 0
      } finally {
        this.summarizing[key] = false
      }
    },
  },
})
