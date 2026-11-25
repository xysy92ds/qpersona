import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { db, putMessage } from '@/core/db'
import {
  acceptFriend,
  humanCard,
  listFriends,
  pollDirect,
  rejectFriend,
  requestFriend,
  sendDirect,
  type FriendItem,
  type HumanPeer,
} from '@/core/human'
import type { Character, Conversation } from '@/core/types'
import { useCloudStore } from './cloud'
import { useContactsStore } from './contacts'
import { useSettingsStore } from './settings'

export const useHumanStore = defineStore('human', {
  state: () => ({
    friends: [] as FriendItem[],
    incoming: [] as FriendItem[],
    outgoing: [] as FriendItem[],
    loading: false,
    polling: false,
    error: '',
  }),

  actions: {
    requireCloud() {
      const cloud = useCloudStore()
      if (!cloud.loggedIn) throw new Error('先登录云端账号')
      return { cloud, settings: useSettingsStore() }
    },

    async refresh() {
      const { cloud, settings } = this.requireCloud()
      this.loading = true
      this.error = ''
      try {
        const res = await listFriends(settings.cloudUrl, cloud.token)
        this.friends = res.friends || []
        this.incoming = res.incoming || []
        this.outgoing = res.outgoing || []
      } catch (e) {
        this.error = e instanceof Error ? e.message : '好友列表加载失败'
      } finally {
        this.loading = false
      }
    },

    async request(username: string) {
      const { cloud, settings } = this.requireCloud()
      const res = await requestFriend(settings.cloudUrl, cloud.token, username)
      await this.refresh()
      return res
    },

    async accept(item: FriendItem) {
      const { cloud, settings } = this.requireCloud()
      await acceptFriend(settings.cloudUrl, cloud.token, item.id)
      await this.refresh()
      return this.ensurePeer(item.peer)
    },

    async reject(item: FriendItem) {
      const { cloud, settings } = this.requireCloud()
      await rejectFriend(settings.cloudUrl, cloud.token, item.id)
      await this.refresh()
    },

    findPeer(userId: string): Character | undefined {
      const contacts = useContactsStore()
      return contacts.characters.find((c) => c.ext.human?.userId === userId)
    },

    async ensurePeer(peer: HumanPeer): Promise<{ ch: Character; conv: Conversation }> {
      const contacts = useContactsStore()
      let ch = this.findPeer(peer.id)
      if (!ch) {
        const { card, ext } = humanCard(peer)
        ch = await contacts.addCharacter(card, ext)
      }
      let conv = contacts.conversations.find((c) => c.characterId === ch!.id && c.kind === 'single')
      if (!conv) conv = await contacts.ensureConversation(ch.id, 'qq')
      return { ch, conv: conv! }
    },

    async send(convId: string, text: string) {
      const { cloud, settings } = this.requireCloud()
      const contacts = useContactsStore()
      const conv = contacts.conversationById(convId)
      const ch = contacts.characterById(conv?.characterId)
      const peer = ch?.ext.human
      if (!peer) throw new Error('不是真人会话')
      return sendDirect(settings.cloudUrl, cloud.token, peer.userId, text)
    },

    /** 拉取 7 天内的中转消息，写进本地会话 */
    async poll(): Promise<number> {
      const cloud = useCloudStore()
      if (!cloud.loggedIn || !cloud.user || this.polling) return 0
      this.polling = true
      try {
        const settings = useSettingsStore()
        const contacts = useContactsStore()
        const key = `jianyie.dm.since.${cloud.user.id}`
        const since = Number(localStorage.getItem(key) || 0)
        const res = await pollDirect(settings.cloudUrl, cloud.token, since)
        let added = 0
        const convIds = new Set<string>()
        const notices: { id: number; title: string; body: string }[] = []
        for (const item of res.items || []) {
          const mid = `dm_${item.id}`
          if (await db.messages.get(mid)) continue
          const { ch, conv } = await this.ensurePeer({ id: item.senderId, username: item.senderName })
          await putMessage({
            id: mid,
            conversationId: conv.id,
            role: 'assistant',
            characterId: ch.id,
            text: item.text,
            ts: item.createdAt,
            status: 'ok',
            kind: 'text',
          })
          const viewing = typeof location !== 'undefined' && location.hash.includes(`/chat/${conv.id}`)
          await contacts.touch(conv.id, {
            lastText: item.text.slice(0, 80),
            lastTs: item.createdAt,
            unread: viewing ? 0 : (conv.unread || 0) + 1,
          })
          convIds.add(conv.id)
          added++
          if (!viewing) {
            let hash = 0
            for (const ch of mid) hash = (hash * 31 + ch.charCodeAt(0)) | 0
            notices.push({
              id: Math.abs(hash) || Date.now() % 2147483647,
              title: item.senderName,
              body: item.text.slice(0, 120),
            })
          }
        }
        localStorage.setItem(key, String(res.now))
        if (added) {
          window.dispatchEvent(new CustomEvent('jianyie:dm', { detail: { conversationIds: [...convIds] } }))
          if (Capacitor.isNativePlatform() && notices.length) {
            try {
              await LocalNotifications.schedule({
                notifications: notices.map((n) => ({
                  id: n.id,
                  title: n.title,
                  body: n.body,
                  schedule: { at: new Date(Date.now() + 300) },
                })),
              })
            } catch {
              /* 权限被拒或系统限制 */
            }
          }
        }
        return added
      } finally {
        this.polling = false
      }
    },
  },
})
