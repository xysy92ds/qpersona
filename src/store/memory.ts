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
      rows.sort((a, b) => b.createdAt - a.createdAt)
      this.byCharacter[characterId] = rows
      this.loaded[characterId] = true
    },

    async remove(id: string) {
      await db.memories.delete(id)
      for (const key of Object.keys(this.byCharacter)) {
        this.byCharacter[key] = this.byCharacter[key]!.filter((m) => m.id !== id)
      }
    },

    /**
     * 关键词 + importance 的轻量召回。中文按二元组命中，够用且零模型调用。
     */
    async recall(characterId: string, query: string): Promise<string> {
      const all = await db.memories.where('characterId').equals(characterId).toArray()
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
        return { m, score: hit * 1.1 + base + typeBoost }
      })

      scored.sort((a, b) => b.score - a.score)
      const top = scored.filter((s) => s.score >= 1.1).slice(0, 7)
      if (!top.length) return ''

      return top.map(({ m }) => `- [${TYPE_LABEL[m.type] ?? '记忆'}] ${m.content}`).join('\n')
    },

    /** 每轮回复后调用；不阻塞聊天，后台串行跑总结 */
    maybeSummarize(conversationId: string) {
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const conv = contacts.conversationById(conversationId)
      if (!conv) return
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
          if (fresh.length < 10) return
          await this.summarize(conversationId)
        })
        .catch((e) => console.warn('[memory] summarize failed', e))
    },

    /** 手动「立即整理」也走这里；返回新增条数 */
    async summarize(conversationId: string): Promise<number> {
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const conv = contacts.conversationById(conversationId)
      if (!conv) return 0
      const ch = contacts.characterById(conv.characterId)
      if (!ch) return 0
      const profile = settings.profileFor('memory_summary', ch.ext.routing.memory_summary)
      if (!profile) {
        return 0
      }
      if (this.summarizing[conversationId]) return 0

      const rows = await db.messages.where('conversationId').equals(conversationId).toArray()
      rows.sort((a, b) => a.ts - b.ts)
      const after = conv.memoryLastTs ?? 0
      const fresh = rows.filter(
        (m) => m.ts > after && (m.role === 'user' || m.role === 'assistant') && m.kind !== 'tip' && textOf(m).trim(),
      )
      if (!fresh.length) return 0

      this.summarizing[conversationId] = true
      try {
        const existing = await db.memories.where('characterId').equals(ch.id).toArray()
        const existingText = existing
          .slice(-12)
          .map((m) => `- ${m.content}`)
          .join('\n')

        const transcript = fresh
          .slice(-40)
          .map((m) => `${m.role === 'user' ? settings.user.nickname : ch.card.name}：${textOf(m)}`)
          .join('\n')

        const prompt = `角色：${ch.card.name}
对方：${settings.user.nickname}

已有的记忆（不要重复）：
${existingText || '（暂无）'}

最近聊天：
${transcript}

请提取值得长期记住的信息，输出 JSON：
{"memories":[{"type":"fact|preference|relationship|event|instruction|reflection","content":"一句话，不超过40字","importance":1到10,"tags":["关键词"]}]}

规则：
- 只记以后聊天用得上的：对方的稳定信息、偏好、约定、发生过的事件、关系变化、你对 TA 的印象。
- 不记一次性的寒暄、天气、临时的情绪。
- 用第三人称陈述，例如「对方怕黑」「你们约好周末去看展」。
- 最多 6 条；没有新内容就返回 {"memories":[]}。`

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
          const dup = existing.some((m) => m.content === content)
          if (dup) continue
          const memory: Memory = {
            id: uid('mem'),
            characterId: ch.id,
            conversationId,
            type,
            content: content.slice(0, 120),
            importance,
            tags,
            createdAt: Date.now(),
            lastAccessed: 0,
          }
          await putMemory(memory)
          existing.push(memory)
          created++
        }

        const lastTs = fresh[fresh.length - 1]!.ts
        await contacts.touch(conversationId, { memoryLastTs: lastTs })
        await this.load(ch.id, true)
        this.lastRun[conversationId] = Date.now()
        return created
      } catch (e) {
        console.warn('[memory] summarize error', e)
        return 0
      } finally {
        this.summarizing[conversationId] = false
      }
    },
  },
})
