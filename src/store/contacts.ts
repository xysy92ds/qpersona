import { defineStore } from 'pinia'
import { db, putCharacter, putConversation, putMessage } from '@/core/db'
import type { CardData, Character, ContextProfileId, Conversation, PersonaExt } from '@/core/types'
import { greetingFor } from '@/core/prompt'
import { uid } from '@/core/util'
import { DEMO_THREAD, makeDemoCharacter } from '@/core/demo'

export const useContactsStore = defineStore('contacts', {
  state: () => ({
    loaded: false,
    characters: [] as Character[],
    conversations: [] as Conversation[],
  }),

  getters: {
    sorted(state): Conversation[] {
      return [...state.conversations].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.lastTs - a.lastTs
      })
    },
    characterById(state) {
      return (id?: string): Character | undefined => state.characters.find((c) => c.id === id)
    },
    conversationById(state) {
      return (id?: string): Conversation | undefined => state.conversations.find((c) => c.id === id)
    },
    totalUnread(state): number {
      return state.conversations.reduce((n, c) => n + (c.unread || 0), 0)
    },
  },

  actions: {
    async load() {
      const [characters, conversations] = await Promise.all([
        db.characters.toArray(),
        db.conversations.toArray(),
      ])
      this.characters = characters
      this.conversations = conversations
      if (!characters.length) await this.seed()
      this.loaded = true
    },

    async seed() {
      const demo = makeDemoCharacter()
      await putCharacter(demo)
      this.characters.push(demo)
      // 预置一小段对话，新装的应用打开就能看到完整样式（开场白在最前面）
      const base = Date.now() - 16 * 60 * 1000
      const conv = await this.ensureConversation(demo.id, 'qq', 0, base)
      let i = 1
      for (const m of DEMO_THREAD) {
        await putMessage({
          id: uid('m'),
          conversationId: conv.id,
          role: m.role,
          characterId: m.role === 'assistant' ? demo.id : undefined,
          text: m.text,
          ts: base + i * 45_000,
          status: 'ok',
          kind: 'text',
        })
        i++
      }
      const last = DEMO_THREAD[DEMO_THREAD.length - 1]
      if (last) {
        await this.touch(conv.id, { lastText: last.text, lastTs: base + (i - 1) * 45_000 })
      }
    },

    async addCharacter(card: CardData, ext: PersonaExt): Promise<Character> {
      const now = Date.now()
      const ch: Character = { id: uid('c'), card, ext, createdAt: now, updatedAt: now }
      await putCharacter(ch)
      this.characters.push(ch)
      await this.ensureConversation(ch.id, 'qq')
      return ch
    },

    async updateCharacter(id: string, patch: Partial<Character>) {
      const i = this.characters.findIndex((c) => c.id === id)
      if (i < 0) return
      const next = { ...this.characters[i]!, ...patch, updatedAt: Date.now() }
      this.characters[i] = next
      await putCharacter(next)
    },

    async removeCharacter(id: string, alsoMessages = true) {
      const convs = this.conversations.filter((c) => c.characterId === id)
      await db.transaction('rw', db.characters, db.conversations, db.messages, async () => {
        await db.characters.delete(id)
        for (const c of convs) {
          await db.conversations.delete(c.id)
          if (alsoMessages) await db.messages.where('conversationId').equals(c.id).delete()
        }
      })
      this.characters = this.characters.filter((c) => c.id !== id)
      this.conversations = this.conversations.filter((c) => c.characterId !== id)
    },

    /** 单聊会话按 (角色, 端) 唯一；QQ 与酒馆各自一条，共享角色卡 */
    async ensureConversation(
      characterId: string,
      profile: ContextProfileId = 'qq',
      greetingIndex = 0,
      startAt?: number,
    ): Promise<Conversation> {
      const found = this.conversations.find(
        (c) => c.kind === 'single' && c.characterId === characterId && c.profile === profile,
      )
      if (found) return found

      const ch = this.characterById(characterId)
      if (!ch) throw new Error('角色不存在')
      const now = startAt ?? Date.now()
      const greeting = greetingFor(ch, greetingIndex)
      const conv: Conversation = {
        id: uid('conv'),
        kind: 'single',
        profile,
        title: ch.card.name,
        characterId: ch.id,
        avatar: ch.ext.qq.avatar,
        lastText: greeting || '开始聊天吧',
        lastTs: now,
        unread: 0,
        pinned: false,
        createdAt: now,
      }
      await putConversation(conv)
      this.conversations.push(conv)

      if (greeting.trim()) {
        await putMessage({
          id: uid('m'),
          conversationId: conv.id,
          role: 'assistant',
          characterId: ch.id,
          text: greeting.trim(),
          ts: now,
          status: 'ok',
          kind: 'text',
        })
      }
      return conv
    },

    async touch(conversationId: string, patch: Partial<Conversation>) {
      const i = this.conversations.findIndex((c) => c.id === conversationId)
      if (i < 0) return
      const next = { ...this.conversations[i]!, ...patch }
      this.conversations[i] = next
      await putConversation(next)
    },

    async markRead(conversationId: string) {
      const conv = this.conversationById(conversationId)
      if (conv && conv.unread) await this.touch(conversationId, { unread: 0 })
    },

    async togglePin(conversationId: string) {
      const conv = this.conversationById(conversationId)
      if (conv) await this.touch(conversationId, { pinned: !conv.pinned })
    },

    async removeConversation(conversationId: string) {
      await db.transaction('rw', db.conversations, db.messages, async () => {
        await db.conversations.delete(conversationId)
        await db.messages.where('conversationId').equals(conversationId).delete()
      })
      this.conversations = this.conversations.filter((c) => c.id !== conversationId)
    },
  },
})
