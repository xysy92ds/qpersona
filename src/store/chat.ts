import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { db, putMessage } from '@/core/db'
import type {
  CardPayload,
  Character,
  Conversation,
  FilePayload,
  ImagePayload,
  Message,
  QuotePayload,
  Sticker,
  VideoPayload,
  VoicePayload,
} from '@/core/types'
import type { ChatMsg, Usage } from '@/core/llm'
import { buildChatMessages, buildGroupMessages } from '@/core/prompt'
import { pickSpeakers } from '@/core/group'
import { describeImage, streamChat } from '@/core/llm'
import { uid, sleep } from '@/core/util'
import { costOf, estimateTokens, resolvePrice } from '@/core/pricing'
import { useContactsStore } from './contacts'
import { useMemoryStore } from './memory'
import { useSettingsStore } from './settings'
import { useStickersStore } from './stickers'

/** AbortController 不进响应式 state，避免被 Proxy 包一层 */
const controllers = new Map<string, AbortController>()

function contentText(c: ChatMsg['content']): string {
  return typeof c === 'string' ? c : c.map((p) => (p.type === 'text' ? p.text : '')).join('')
}

function messageText(m: Message): string {
  if (m.kind === 'sticker') return `[表情包：${m.sticker?.name ?? ''}]`
  if (m.kind === 'file') return `[文件：${m.file?.name ?? ''}]`
  if (m.kind === 'card') return `[卡片：${m.card?.title ?? ''}]`
  if (m.kind === 'voice') return `[语音 ${Math.round(m.voice?.duration ?? 1)}″]`
  return m.text
}

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
    /** 对方还在回上一条时，先把新消息排上，回完再接着回 */
    pendingReply: {} as Record<string, boolean>,
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

    async send(convId: string, raw: string, quote?: QuotePayload) {
      const text = raw.trim()
      if (!text) return

      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
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
        ...(quote ? { quote } : {}),
      }
      await this.pushLocal(convId, userMsg)
      await contacts.touch(convId, { lastText: text, lastTs: userMsg.ts, unread: 0 })
      await this.dispatchReply(convId)
    },

    async sendSticker(convId: string, sticker: Sticker) {
      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      await this.load(convId)
      const list = (this.byConv[convId] ??= [])
      const msg: Message = {
        id: uid('m'),
        conversationId: convId,
        role: 'user',
        text: '',
        ts: nextTs(list),
        status: 'ok',
        kind: 'sticker',
        sticker: {
          id: sticker.id,
          name: sticker.name,
          annotation: sticker.annotation,
          url: sticker.dataUrl,
        },
      }
      await this.pushLocal(convId, msg)
      await contacts.touch(convId, { lastText: `[表情包] ${sticker.name}`, lastTs: msg.ts, unread: 0 })
      await this.dispatchReply(convId)
    },

    async sendFile(convId: string, file: FilePayload) {
      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      await this.load(convId)
      const list = (this.byConv[convId] ??= [])
      const msg: Message = {
        id: uid('m'),
        conversationId: convId,
        role: 'user',
        text: '',
        ts: nextTs(list),
        status: 'ok',
        kind: 'file',
        file,
      }
      await this.pushLocal(convId, msg)
      await contacts.touch(convId, { lastText: `[文件] ${file.name}`, lastTs: msg.ts, unread: 0 })
      await this.dispatchReply(convId)
    },

    async sendCard(convId: string, card: CardPayload) {
      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      await this.load(convId)
      const list = (this.byConv[convId] ??= [])
      const msg: Message = {
        id: uid('m'),
        conversationId: convId,
        role: 'user',
        text: '',
        ts: nextTs(list),
        status: 'ok',
        kind: 'card',
        card,
      }
      await this.pushLocal(convId, msg)
      await contacts.touch(convId, { lastText: `[卡片] ${card.title}`, lastTs: msg.ts, unread: 0 })
      await this.dispatchReply(convId)
    },

    /** 单聊还是群聊，从这里分流 */
    async dispatchReply(convId: string) {
      if (this.streaming[convId]) {
        this.pendingReply[convId] = true
        return
      }
      const conv = useContactsStore().conversationById(convId)
      if (conv?.kind === 'group') await this.respondGroup(convId)
      else await this.respond(convId)
    },

    async sendImage(convId: string, image: ImagePayload) {
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      await this.load(convId)
      const list = (this.byConv[convId] ??= [])
      const msg = reactive<Message>({
        id: uid('m'),
        conversationId: convId,
        role: 'user',
        text: '',
        ts: nextTs(list),
        status: 'ok',
        kind: 'image',
        image,
      })
      await this.pushLocal(convId, msg)
      await contacts.touch(convId, { lastText: '[图片]', lastTs: msg.ts, unread: 0 })

      // 主模型不支持看图时，用「图片识别」槽位先写一句描述，文本模型靠它理解
      const mainVision = !!settings.mainProfile?.vision
      const visionBound = settings.bindings.vision
      if (!mainVision && visionBound) {
        const vp = settings.profileFor('vision')
        if (vp) {
          try {
            const caption = await describeImage(vp, image.url)
            if (caption) {
              msg.image = { ...image, caption }
              await putMessage(msg)
            }
          } catch (e) {
            console.warn('[vision] describe failed', e)
          }
        }
      }
      await this.dispatchReply(convId)
    },

    async sendVideo(convId: string, video: VideoPayload) {
      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      await this.load(convId)
      const list = (this.byConv[convId] ??= [])
      const msg: Message = {
        id: uid('m'),
        conversationId: convId,
        role: 'user',
        text: '',
        ts: nextTs(list),
        status: 'ok',
        kind: 'video',
        video,
      }
      await this.pushLocal(convId, msg)
      await contacts.touch(convId, { lastText: '[视频]', lastTs: msg.ts, unread: 0 })
      await this.dispatchReply(convId)
    },

    async sendVoice(convId: string, voice: VoicePayload) {
      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      await this.load(convId)
      const list = (this.byConv[convId] ??= [])
      const msg: Message = {
        id: uid('m'),
        conversationId: convId,
        role: 'user',
        text: '',
        ts: nextTs(list),
        status: 'ok',
        kind: 'voice',
        voice,
      }
      await this.pushLocal(convId, msg)
      await contacts.touch(convId, { lastText: `[语音] ${Math.round(voice.duration)}″`, lastTs: msg.ts, unread: 0 })
      await this.dispatchReply(convId)
    },

    /** 群聊：按 @ / 名字 / 兴趣挑 1~2 个人，按顺序回 */
    async respondGroup(convId: string) {
      if (this.streaming[convId]) {
        this.pendingReply[convId] = true
        return
      }
      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      if (!conv || conv.kind !== 'group') return
      await this.load(convId)
      const list = this.byConv[convId] ?? []
      const members = (conv.memberIds ?? [])
        .map((id) => contacts.characterById(id))
        .filter((c): c is Character => !!c && c.ext.toggles.chat)
      if (!members.length) return

      const now = Date.now()
      const ACTIVE_MS = (conv.groupActiveMinutes ?? 5) * 60 * 1000
      const COOLDOWN_MS = 1500
      const activeMap: Record<string, number> = { ...(conv.groupActive ?? {}) }
      const spokeMap: Record<string, number> = { ...(conv.groupLastSpoke ?? {}) }
      for (const [id, until] of Object.entries(activeMap)) {
        if (until <= now) delete activeMap[id]
      }

      const lastUser = [...list].reverse().find((m) => m.role === 'user')
      const text = lastUser ? messageText(lastUser) : ''
      const speakerIds = list
        .filter((m) => m.role === 'assistant' && m.characterId)
        .slice(-4)
        .map((m) => m.characterId!)
      const spokeCounts: Record<string, number> = {}
      for (const m of list) {
        if (m.role === 'assistant' && m.characterId) {
          spokeCounts[m.characterId] = (spokeCounts[m.characterId] ?? 0) + 1
        }
      }

      const triggered = pickSpeakers(members, text, {
        lastSpeakerId: speakerIds[speakerIds.length - 1],
        spokeCounts,
        max: 4,
        threshold: 15,
      })

      // 被叫到的人续命 5 分钟；即使这一轮没轮到发言
      for (const s of triggered) activeMap[s.character.id] = now + ACTIVE_MS

      const chosen: Character[] = []
      const chosenIds = new Set<string>()

      // 先处理被 @ / 叫名字 / 兴趣命中的人
      for (const s of triggered) {
        if (chosen.length >= 2) break
        const at = s.reasons.includes('@')
        const last = spokeMap[s.character.id] ?? 0
        if (!at && now - last < COOLDOWN_MS) continue
        chosen.push(s.character)
        chosenIds.add(s.character.id)
      }

      // 还在 5 分钟活跃窗口里的成员，可以继续接话
      const activeMembers = members
        .filter((m) => !!activeMap[m.id] && !chosenIds.has(m.id))
        .sort((a, b) => (spokeMap[a.id] ?? 0) - (spokeMap[b.id] ?? 0))
      for (const m of activeMembers) {
        if (chosen.length >= 2) break
        if (now - (spokeMap[m.id] ?? 0) < COOLDOWN_MS) continue
        chosen.push(m)
        chosenIds.add(m.id)
      }

      if (!chosen.length) {
        await contacts.touch(convId, { groupActive: activeMap })
        return
      }

      this.streaming[convId] = true
      try {
        for (const ch of chosen) {
          await this.groupStream(convId, ch, members, conv)
          activeMap[ch.id] = Date.now() + ACTIVE_MS
          spokeMap[ch.id] = Date.now()
          await contacts.touch(convId, { groupActive: activeMap, groupLastSpoke: spokeMap })
          await sleep(320)
        }
      } finally {
        this.streaming[convId] = false
      }
      try {
        useMemoryStore().maybeSummarizeGroup(
          convId,
          chosen.map((c) => c.id),
        )
      } catch {
        /* 记忆失败不影响群聊 */
      }

      if (this.pendingReply[convId]) {
        this.pendingReply[convId] = false
        void this.dispatchReply(convId)
      }
    },

    async groupStream(convId: string, ch: Character, members: Character[], conv: Conversation) {
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const memory = useMemoryStore()
      const list = (this.byConv[convId] ??= [])
      const names: Record<string, string> = {}
      for (const m of members) names[m.id] = m.ext.qq.nickname || m.card.name
      const displayName = names[ch.id] ?? ch.card.name

      const profile = settings.profileFor('text_main', ch.ext.routing.text_main)
      if (!profile) {
        await this.addTip(convId, '还没有可用的文本模型，去「设置 → AI 设置」配置一下。')
        return
      }

      const history = list.slice()
      const query = history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => messageText(m))
        .join(' ')
      let memoryText = ''
      try {
        memoryText = await memory.recall(ch.id, query, {
          includePrivate: conv.groupMemoryShare !== false,
        })
      } catch {
        memoryText = ''
      }

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

      const messages = buildGroupMessages({
        character: ch,
        members,
        names,
        history,
        userName: settings.user.nickname,
        groupName: conv.title,
        memoryText,
      })

      const ac = new AbortController()
      controllers.set(convId, ac)
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
        reply.status = 'error'
        reply.text = reply.text.trim() || ''
        reply.error = msg
        if (!aborted && !reply.text) {
          await this.addTip(convId, `「${displayName}」没接上话：${msg}`)
          const i = list.indexOf(reply)
          if (i >= 0) list.splice(i, 1)
          await db.messages.delete(reply.id)
          controllers.delete(convId)
          return
        }
      } finally {
        controllers.delete(convId)
      }

      const promptEst = messages.reduce((n, m) => n + estimateTokens(contentText(m.content)), 0)
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

      if (!reply.text.trim()) {
        reply.status = 'error'
        reply.text = '（这句没生成出来）'
      }

      // 群聊也允许一次发两三条，别一句就没了
      let preview = reply.text
      if (reply.status === 'ok') {
        const parts = splitBubbles(reply.text)
        if (parts.length > 1) {
          reply.text = parts[0]!
          const extras: Message[] = []
          for (let i = 1; i < parts.length; i++) {
            await sleep(240)
            const extra = reactive<Message>({
              id: uid('m'),
              conversationId: convId,
              role: 'assistant',
              characterId: ch.id,
              text: parts[i]!,
              ts: nextTs(list),
              status: 'ok',
              kind: 'text',
            })
            await this.pushLocal(convId, extra)
            extras.push(extra)
            preview = parts[i]!
          }
          const last = extras[extras.length - 1]
          if (last) {
            last.usage = reply.usage
            last.cost = reply.cost
            last.usageEstimated = reply.usageEstimated
            reply.usage = undefined
            reply.cost = undefined
            reply.usageEstimated = undefined
            await putMessage(last)
          }
        }
      }

      await putMessage(reply)
      await contacts.touch(convId, {
        lastText: `${displayName}：${preview.slice(0, 60)}`,
        lastTs: Date.now(),
      })
    },

    /** 真正调用模型、流式写回回复的那一段 */
    async respond(convId: string) {
      if (this.streaming[convId]) return
      const contacts = useContactsStore()
      const settings = useSettingsStore()
      const memory = useMemoryStore()
      const stickerStore = useStickersStore()
      await stickerStore.load()
      const conv = contacts.conversationById(convId)
      if (!conv) return
      const ch = contacts.characterById(conv.characterId)
      if (!ch) return

      await this.load(convId)
      const list = (this.byConv[convId] ??= [])

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
      const recentQuery = history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => messageText(m))
        .join(' ')
      let memoryText = ''
      try {
        memoryText = await memory.recall(ch.id, recentQuery)
      } catch {
        memoryText = ''
      }

      let messages: ChatMsg[]
      try {
        messages = buildChatMessages({
          character: ch,
          profile: conv.profile,
          history,
          userName: settings.user.nickname,
          memoryText,
          vision: !!profile.vision,
          stickers: stickerStore.list.map((s) => ({ name: s.name, annotation: s.annotation })),
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
      const promptEst = messages.reduce((n, m) => n + estimateTokens(contentText(m.content)), 0)
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

      // QQ 端：把多行回复拆成连续几条气泡；[表情:名字] 会换成真的表情包
      let preview = reply.text
      if (reply.status === 'ok' && conv.profile === 'qq') {
        const rawParts = settings.chat.autoSplit ? splitBubbles(reply.text) : [reply.text]
        const stickerList = stickerStore.list
        const outputs = rawParts.map((part) => {
          const m = part.match(/^\[(?:表情|表情包|sticker)[:：]\s*(.+?)\]\s*$/)
          if (m) {
            const st = stickerList.find((x) => x.name === m[1]!.trim())
            if (st) return { text: '', sticker: st }
          }
          return { text: part }
        })
        const hasSticker = outputs.some((o) => o.sticker)
        if (outputs.length > 1 || hasSticker) {
          const first = outputs[0]!
          if (first.sticker) {
            reply.kind = 'sticker'
            reply.text = ''
            reply.sticker = {
              id: first.sticker.id,
              name: first.sticker.name,
              annotation: first.sticker.annotation,
              url: first.sticker.dataUrl,
            }
          } else {
            reply.text = first.text
          }
          const extras: Message[] = []
          for (let i = 1; i < outputs.length; i++) {
            await sleep(220)
            const o = outputs[i]!
            const extra = reactive<Message>({
              id: uid('m'),
              conversationId: convId,
              role: 'assistant',
              characterId: ch.id,
              text: o.text,
              ts: nextTs(list),
              status: 'ok',
              kind: o.sticker ? 'sticker' : 'text',
              ...(o.sticker
                ? {
                    sticker: {
                      id: o.sticker.id,
                      name: o.sticker.name,
                      annotation: o.sticker.annotation,
                      url: o.sticker.dataUrl,
                    },
                  }
                : {}),
            })
            await this.pushLocal(convId, extra)
            extras.push(extra)
          }
          const last = extras.length ? extras[extras.length - 1]! : reply
          if (last !== reply) {
            last.usage = reply.usage
            last.cost = reply.cost
            last.usageEstimated = reply.usageEstimated
            reply.usage = undefined
            reply.cost = undefined
            reply.usageEstimated = undefined
            await putMessage(last)
          }
          const lastOut = outputs[outputs.length - 1]!
          preview = lastOut.sticker ? `[表情包] ${lastOut.sticker.name}` : lastOut.text
        }
      }

      if (!reply.text.trim() && reply.status === 'ok' && reply.kind !== 'sticker') {
        reply.status = 'error'
        reply.text = '（模型返回了空内容，检查一下模型名或参数）'
        preview = reply.text
      }
      await putMessage(reply)
      await contacts.touch(convId, { lastText: preview.slice(0, 80), lastTs: Date.now() })

      // 回复期间又收到消息：接着回
      if (this.pendingReply[convId]) {
        this.pendingReply[convId] = false
        void this.respond(convId)
      }

      // 后台总结记忆（每 10 轮触发，不阻塞这一轮）
      if (reply.status === 'ok') {
        try {
          memory.maybeSummarize(convId)
        } catch {
          /* 记忆失败不影响聊天 */
        }
      }
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
