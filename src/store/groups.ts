import { defineStore } from 'pinia'
import { db, putCharacter, putConversation, putMessage } from '@/core/db'
import { emptyExt } from '@/core/card'
import { humanCard } from '@/core/human'
import { listServerGroups, fetchServerGroupMessages, type ServerGroup } from '@/core/groups'
import type { Character, Conversation, Message } from '@/core/types'
import { useContactsStore } from './contacts'
import { useCloudStore } from './cloud'
import { useSettingsStore } from './settings'
import { useChatStore } from './chat'

export const useGroupsStore = defineStore('groups', {
  state: () => ({
    polling: false,
    lastError: '',
    lastPollAt: 0,
  }),

  actions: {
    async poll() {
      const cloud = useCloudStore()
      const settings = useSettingsStore()
      const contacts = useContactsStore()
      const chat = useChatStore()
      if (!cloud.loggedIn || !cloud.token || this.polling) return
      this.polling = true
      this.lastError = ''
      try {
        const groups = await listServerGroups(settings.cloudUrl, cloud.token)
        for (const group of groups) {
          let conv = contacts.conversations.find((c) => c.serverGroupId === group.id)
          if (!conv) conv = await this.materialize(group)
          if (!conv) continue

          const since = conv.serverGroupSince ?? 0
          const items = await fetchServerGroupMessages(settings.cloudUrl, cloud.token, group.id, since)
          if (!items.length) continue

          const local = await db.messages.where('conversationId').equals(conv.id).toArray()
          const known = new Set(local.map((m) => m.serverId).filter(Boolean))
          const localIds = new Set(local.map((m) => m.id))
          let newest = since
          let added = 0
          let remoteHuman = false
          for (const item of items) {
            newest = Math.max(newest, item.createdAt)
            if (known.has(item.id)) continue
            if (item.senderUserId === cloud.user?.id) continue
            const charId = item.botId
              ? item.botId
              : contacts.characters.find((c) => c.ext.human?.userId === item.senderUserId)?.id
            const ch = contacts.characterById(charId)
            const msg: Message = {
              id: `srv_${item.id}`,
              conversationId: conv.id,
              role: 'assistant',
              characterId: ch?.id,
              text: item.body,
              ts: item.createdAt,
              status: 'ok',
              kind: 'text',
              serverId: item.id,
            }
            if (localIds.has(msg.id)) continue
            await putMessage(msg)
            added++
            if (!item.botId) remoteHuman = true
          }
          const latest = contacts.conversationById(conv.id)
          if (latest) {
            await contacts.touch(conv.id, {
              serverGroupSince: newest,
              lastText: items[items.length - 1]?.body.slice(0, 80) || latest.lastText,
              lastTs: newest,
              unread: (latest.unread || 0) + added,
            })
          }
          if (added) await chat.syncFromDb(conv.id)
          if (remoteHuman && group.ownerId === cloud.user?.id) {
            void chat.respondGroup(conv.id)
          }
        }
        this.lastPollAt = Date.now()
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : '群消息同步失败'
      } finally {
        this.polling = false
      }
    },

    async materialize(group: ServerGroup): Promise<Conversation | undefined> {
      const cloud = useCloudStore()
      const contacts = useContactsStore()
      if (!cloud.user) return
      const memberIds: string[] = []
      for (const m of group.members) {
        if (m.id === cloud.user.id) continue
        let ch = contacts.characters.find((c) => c.ext.human?.userId === m.id)
        if (!ch) {
          const { card, ext } = humanCard({ id: m.id, username: m.username })
          ch = { id: `hgrp_${m.id}`, card, ext, createdAt: Date.now(), updatedAt: Date.now() }
          await putCharacter(ch)
          contacts.characters.push(ch)
        }
        memberIds.push(ch.id)
      }
      for (const b of group.bots) {
        let ch = contacts.characterById(b.id)
        if (!ch) {
          const card = {
            name: b.name,
            description: '真人群聊里的 AI 成员',
            personality: '',
            scenario: '',
            first_mes: '',
            mes_example: '',
            tags: ['群聊'],
            alternate_greetings: [],
            extensions: {},
          }
          const ext = emptyExt(b.name, 'import')
          ext.qq.avatar = b.avatar || ''
          ext.remoteBot = { groupId: group.id, botId: b.id }
          ch = { id: b.id, card, ext, createdAt: Date.now(), updatedAt: Date.now() }
          await putCharacter(ch)
          contacts.characters.push(ch)
        }
        memberIds.push(ch.id)
      }
      const conv = await contacts.createGroup(memberIds, group.name, {
        serverGroupId: group.id,
        serverGroupOwnerId: group.ownerId,
        since: 0,
      })
      // createGroup writes a local tip; server history is pulled in the same poll.
      return conv
    },
  },
})
