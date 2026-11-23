import { defineStore } from 'pinia'
import { completeChat } from '@/core/llm'
import { buildChatMessages } from '@/core/prompt'
import { shouldSendProactive } from '@/core/proactive'
import type { Character } from '@/core/types'
import { useChatStore } from './chat'
import { useContactsStore } from './contacts'
import { useMemoryStore } from './memory'
import { useSettingsStore } from './settings'

export const useProactiveStore = defineStore('proactive', {
  state: () => ({
    sending: false,
    lastCheck: 0,
  }),

  actions: {
    /** 每分钟由 App 调一次；全局最多触发一条，避免一次性刷屏 */
    async tick() {
      const settings = useSettingsStore()
      const contacts = useContactsStore()
      const chat = useChatStore()
      if (!settings.proactive.enabled || this.sending) return
      this.sending = true
      try {
        const now = Date.now()
        const candidates = contacts.conversations
          .filter((c) => c.kind === 'single' && c.profile === 'qq' && !!c.characterId)
          .sort((a, b) => b.lastTs - a.lastTs)
          .slice(0, 12)

        for (const conv of candidates) {
          const ch = contacts.characterById(conv.characterId)
          if (!ch) continue
          if (conv.proactiveMuted) continue
          if (!ch.ext.toggles.chat || ch.ext.toggles.proactive === false) continue
          if (chat.streaming[conv.id]) continue
          if (
            !shouldSendProactive({
              enabled: true,
              probability: settings.proactive.probability,
              minMinutes: settings.proactive.minutes,
              lastTs: conv.lastTs || conv.createdAt,
              lastProactiveAt: conv.lastProactiveAt,
              now,
              quietEnabled: settings.proactive.quietEnabled,
              quietStart: settings.proactive.quietStart,
              quietEnd: settings.proactive.quietEnd,
            })
          ) {
            continue
          }
          await this.sendOne(conv.id, ch)
          return
        }
      } finally {
        this.sending = false
        this.lastCheck = Date.now()
      }
    },

    async sendOne(conversationId: string, ch: Character) {
      const settings = useSettingsStore()
      const contacts = useContactsStore()
      const chat = useChatStore()
      const memory = useMemoryStore()
      const profile = settings.profileFor('text_main', ch.ext.routing.text_main)
      if (!profile) return
      await chat.load(conversationId)
      const history = chat.messagesOf(conversationId)
      if (!history.length) return

      const recent = history
        .filter((m) => m.kind !== 'tip')
        .slice(-6)
        .map((m) => m.text || (m.kind === 'sticker' ? '[表情包]' : ''))
        .join(' ')
      let memoryText = ''
      try {
        memoryText = await memory.recall(ch.id, recent)
      } catch {
        memoryText = ''
      }

      const messages = buildChatMessages({
        character: ch,
        profile: 'qq',
        history,
        userName: settings.user.nickname,
        memoryText,
      })
      const gapHours = (Date.now() - (contacts.conversationById(conversationId)?.lastTs ?? Date.now())) / 3600000
      messages.push({
        role: 'system',
        content:
          gapHours >= 6
            ? '你们已经很久没联系了。请主动发一条 QQ 消息：自然一点，可以提起你记得的事、说说最近在做什么，不要用「在吗」「好久不见」这种客套开场。1~2 句，直接输出消息内容。'
            : '现在对方有一阵子没说话了。请主动发一条 QQ 消息：接着你们上次的话题，或者提起你记得的事。不要用「在吗」「在干嘛」这种客服式开场，1~2 句，直接输出消息内容。',
      })
      let text = ''
      try {
        text = await completeChat({ profile, messages, maxTokens: 140, temperature: 1.0 })
      } catch (e) {
        console.warn('[proactive] failed', e)
        return
      }
      text = text.trim()
      if (!text) return
      await chat.receiveProactive(conversationId, ch.id, text)
    },
  },
})
