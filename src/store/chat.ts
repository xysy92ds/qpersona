import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { db, putMessage } from '@/core/db'
import type { Message } from '@/core/types'
import type { ChatMsg, Usage } from '@/core/llm'
import { buildChatMessages } from '@/core/prompt'
import { streamChat } from '@/core/llm'
import { uid, sleep } from '@/core/util'
import { costOf, estimateTokens, resolvePrice } from '@/core/pricing'
import { useContactsStore } from './contacts'
import { useSettingsStore } from './settings'

/** AbortController 不进响应式 state，避免被 Proxy 包一层 */
const controllers = new Map<string, AbortController>()

function nextTs(list: Message[]): number {
  const last = list.length ? list[list.length - 1]!.ts : 0
  return Math.max(Date.now(), last + 1)
}

/**
 * QQ 端把一段回复拆成几条短消息，更像真人发消息。
 * 太长或分行过多就保持一条，避免刷屏。
 */
function splitBubbles(text: string): string[] {
  const trimmed = text.trim()
  const lines = trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  if (lines.length < 2 || lines.length > 4) return [trimmed]
  if (lines.some((l) => l.length > 70)) return [trimmed]
  return lines
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    byConv: {} as Record<string, Message[]>,
    loaded: {} as Record<string, boolean>,
    streaming: {} as Record<string, boolean>,
  }),

  getters: {
    messagesOf(state) {
      return (convId: string): Message[] => state.byConv[convId] ?? []
    },
    isStreaming(state) {
      return (convId: string): boolean => !!state.streaming[convId]
    },
  },

  actions: {
    async load(convId: string) {
      if (this.loaded[convId]) return
      const rows = await db.messages.where('conversationId').equals(convId).toArray()
      rows.sort((a, b) => a.ts - b.ts)
      this.byConv[convId] = rows
      this.loaded[convId] = true
    },

    async reload(convId: string) {
      this.loaded[convId] = false
      await this.load(convId)
    },

    async pushLocal(convId: string, msg: Message) {
      ;(this.byConv[convId] ??= []).push(msg)
      await putMessage(msg)
    },

    stop(convId: string) {
      controllers.get(convId)?.abort()
    },

    async send(convId: string, raw: string) {
      const text = raw.trim()
      if (!text || this.streaming[convId]) return

      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      const ch = contacts.characterById(conv.characterId)

      await this.load(convId)
      const list = (this.byConv[convId] ??= [])

      const userMsg: Message = {
        id: uid('m'),
        conversationId: convId,
        role: 'user',
        text,
        ts: nextTs(list),
        status: 'ok',
        kind: 'text',
      }
      await this.pushLocal(convId, userMsg)
      await contacts.touch(convId, { lastText: text, lastTs: userMsg.ts, unread: 0 })

      if (!ch) return
      if (!ch.ext.toggles.chat) {
        await this.pushLocal(convId, {
          id: uid('m'),
          conversationId: convId,
          role: 'assistant',
          text: '（这个角色的「主对话」开关是关着的，去角色资料里打开再聊吧。）',
          ts: nextTs(list),
          status: 'ok',
          kind: 'tip',
        })
        return
      }

      const profile = settings.profileFor('text_main', ch.ext.routing.text_main)
      // 用 reactive 包一层，流式增量才能触发视图更新
      const reply = reactive<Message>({
        id: uid('m'),
        conversationId: convId,
        role: 'assistant',
        characterId: ch.id,
        text: '',
        ts: nextTs(list),
        status: 'streaming',
        kind: 'text',
      })
      list.push(reply)

      if (!profile) {
        reply.status = 'error'
        reply.text =
          '还没有可用的文本模型。\n去「设置 → AI 设置」添加一个 OpenAI 兼容接口（Base URL / API Key / 模型名），就能开始聊了。'
        await putMessage(reply)
        return
      }

      const history = list.slice(0, -1)
      let messages: ChatMsg[]
      try {
        messages = buildChatMessages({
          character: ch,
          profile: conv.profile,
          history,
          userName: settings.user.nickname,
        })
      } catch (e) {
        reply.status = 'error'
        reply.text = `组装请求失败：${String(e)}`
        await putMessage(reply)
        return
      }

      const ac = new AbortController()
      controllers.set(convId, ac)
      this.streaming[convId] = true
      let apiUsage: Usage | null = null
      try {
        for await (const delta of streamChat({
          profile,
          messages,
          signal: ac.signal,
          onUsage: (u) => {
            apiUsage = u
          },
        })) {
          reply.text += delta
        }
        reply.status = 'ok'
      } catch (e) {
        const aborted = ac.signal.aborted
        const msg = e instanceof Error ? e.message : String(e)
        if (aborted && reply.text.trim()) {
          reply.status = 'ok'
        } else {
          reply.status = 'error'
          reply.error = msg
          reply.text = reply.text.trim() || `消息没能发出去：${msg}`
        }
      } finally {
        this.streaming[convId] = false
        controllers.delete(convId)
      }

      // 这一轮的 token 用量：优先用接口回传的，没有就按字数估
      const promptEst = messages.reduce((n, m) => n + estimateTokens(m.content), 0)
      const completionEst = estimateTokens(reply.text)
      const u = apiUsage as Usage | null
      const usage = u
        ? {
            prompt: u.prompt_tokens ?? promptEst,
            completion: u.completion_tokens ?? completionEst,
            total: u.total_tokens ?? (u.prompt_tokens ?? promptEst) + (u.completion_tokens ?? completionEst),
          }
        : { prompt: promptEst, completion: completionEst, total: promptEst + completionEst }
      reply.usage = usage
      reply.usageEstimated = !u
      reply.cost = costOf(usage, resolvePrice(profile))

      // QQ 端：把多行回复拆成连续几条气泡（设置里可关）
      let preview = reply.text
      if (reply.status === 'ok' && conv.profile === 'qq' && settings.chat.autoSplit) {
        const parts = splitBubbles(reply.text)
        if (parts.length > 1) {
          reply.text = parts[0]!
          for (let i = 1; i < parts.length; i++) {
            await sleep(220)
            const isLast = i === parts.length - 1
            const extra = reactive<Message>({
              id: uid('m'),
              conversationId: convId,
              role: 'assistant',
              characterId: ch.id,
              text: parts[i]!,
              ts: nextTs(list),
              status: 'ok',
              kind: 'text',
              // 用量是整轮回复的，挂在最后一条气泡下面更自然
              ...(isLast ? { usage: reply.usage, cost: reply.cost, usageEstimated: reply.usageEstimated } : {}),
            })
            await this.pushLocal(convId, extra)
            preview = parts[i]!
          }
          reply.usage = undefined
          reply.cost = undefined
          reply.usageEstimated = undefined
        }
      }

      if (!reply.text.trim() && reply.status === 'ok') {
        reply.status = 'error'
        reply.text = '（模型返回了空内容，检查一下模型名或参数）'
        preview = reply.text
      }
      await putMessage(reply)
      await contacts.touch(convId, { lastText: preview.slice(0, 80), lastTs: Date.now() })
    },

    /** 重发最后一条用户消息（清掉它之后的 assistant 消息） */
    async regenerate(convId: string) {
      if (this.streaming[convId]) return
      const list = this.byConv[convId] ?? []
      let lastUser = -1
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.role === 'user') {
          lastUser = i
          break
        }
      }
      if (lastUser < 0) return
      const text = list[lastUser]!.text
      const drop = list.splice(lastUser, list.length - lastUser)
      for (const m of drop) await db.messages.delete(m.id)
      await this.send(convId, text)
    },

    async clear(convId: string) {
      await db.messages.where('conversationId').equals(convId).delete()
      this.byConv[convId] = []
      await useContactsStore().touch(convId, { lastText: '开始聊天吧', lastTs: Date.now() })
    },

    async deleteMessage(convId: string, id: string) {
      const list = this.byConv[convId]
      if (!list) return
      const i = list.findIndex((m) => m.id === id)
      if (i < 0) return
      list.splice(i, 1)
      await db.messages.delete(id)
      const last = list[list.length - 1]
      await useContactsStore().touch(convId, {
        lastText: last?.text.slice(0, 80) || '开始聊天吧',
        lastTs: last?.ts || Date.now(),
      })
    },

    /** 系统灰条：拍一拍、进群提示之类 */
    async addTip(convId: string, text: string) {
      await this.load(convId)
      const list = (this.byConv[convId] ??= [])
      await this.pushLocal(convId, {
        id: uid('m'),
        conversationId: convId,
        role: 'system',
        text,
        ts: nextTs(list),
        status: 'ok',
        kind: 'tip',
      })
    },
  },
})
