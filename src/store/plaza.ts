import { defineStore } from 'pinia'
import { resizeDataUrl } from '@/core/util'
import { useContactsStore } from './contacts'
import { useCloudStore } from './cloud'
import { useSettingsStore } from './settings'
import {
  extForPlaza,
  deleteCloudPlaza,
  fetchCloudPlaza,
  fetchMyPlaza,
  normalizePlaza,
  searchPlaza,
  uploadCloudPlaza,
  type PlazaCard,
  type PlazaSort,
} from '@/core/plaza'
import type { Character } from '@/core/types'

export const usePlazaStore = defineStore('plaza', {
  state: () => ({
    cards: [] as PlazaCard[],
    loading: false,
    loaded: false,
    error: '',
    source: '',
    mode: 'static' as 'static' | 'cloud',
    myCards: [] as any[],
    query: '',
    tag: '',
    sort: 'hot' as PlazaSort,
  }),

  getters: {
    visible(state): PlazaCard[] {
      return searchPlaza(state.cards, state.query, state.tag, state.sort)
    },
  },

  actions: {
    async load(force = false) {
      const settings = useSettingsStore()
      if (this.loading) return
      if (this.loaded && !force) return
      this.loading = true
      this.error = ''
      try {
        if (this.mode === 'cloud') {
          const cloud = useCloudStore()
          if (!cloud.loggedIn) throw new Error('登录后才能使用云端广场')
          this.source = `${settings.cloudUrl}/api/plaza/cards`
          this.cards = await fetchCloudPlaza(settings.cloudUrl)
        } else {
          const configured = settings.plazaUrl.trim()
          const url = configured
            ? configured
            : new URL('plaza/cards.json', document.baseURI).toString()
          this.source = url
          const res = await fetch(force ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          this.cards = normalizePlaza(data)
        }
        this.loaded = true
        if (!this.cards.length) this.error = '广场里还没有卡片'
      } catch (e) {
        this.error = `广场加载失败：${e instanceof Error ? e.message : String(e)}`
      } finally {
        this.loading = false
      }
    },

    async setMode(mode: 'static' | 'cloud') {
      this.mode = mode
      this.loaded = false
      await this.load(true)
    },

    async uploadCharacter(ch: Character): Promise<void> {
      const settings = useSettingsStore()
      const cloud = useCloudStore()
      if (!cloud.loggedIn) throw new Error('登录后才能上传')

      // 头像/背景是本地 dataURL，原样上传很容易超过 D1/Worker 的请求上限。
      // 广场只需要一个小头像和展示字段，背景/原图不上传。
      let avatar = ch.ext.qq.avatar || ''
      if (avatar.startsWith('data:image/')) {
        try {
          avatar = await resizeDataUrl(avatar, 224, 0.8)
        } catch {
          avatar = ''
        }
      }
      const qq = {
        qqNumber: ch.ext.qq.qqNumber,
        nickname: ch.ext.qq.nickname,
        signature: ch.ext.qq.signature,
        interests: ch.ext.qq.interests,
        aliases: ch.ext.qq.aliases,
      }
      const extensions = { ...(ch.card.extensions || {}) }
      delete (extensions as any).qpersona
      const card = { ...ch.card, extensions }
      if (JSON.stringify({ card, qq, avatar }).length > 850_000) {
        throw new Error('这张卡的设定文字太大，先精简角色卡再上传')
      }
      await uploadCloudPlaza(settings.cloudUrl, cloud.token, card, qq, avatar)
      this.mode = 'cloud'
      this.loaded = false
      await this.load(true)
    },

    async loadMine(): Promise<void> {
      const cloud = useCloudStore()
      const settings = useSettingsStore()
      if (!cloud.loggedIn) throw new Error('登录后才能查看投稿')
      this.myCards = await fetchMyPlaza(settings.cloudUrl, cloud.token)
    },

    async removeMine(id: string): Promise<void> {
      const cloud = useCloudStore()
      const settings = useSettingsStore()
      if (!cloud.loggedIn) throw new Error('登录后才能删除')
      await deleteCloudPlaza(settings.cloudUrl, cloud.token, id)
      await this.loadMine()
      await this.load(true)
    },

    async removeCloudCard(item: PlazaCard): Promise<void> {
      const settings = useSettingsStore()
      const cloud = useCloudStore()
      if (!cloud.loggedIn || !item.authorId || cloud.user?.id !== item.authorId) throw new Error('只能删除自己上传的卡')
      await deleteCloudPlaza(settings.cloudUrl, cloud.token, item.id)
      await this.load(true)
    },

    async importCard(item: PlazaCard): Promise<Character> {
      const contacts = useContactsStore()
      return contacts.addCharacter(item.card, extForPlaza(item))
    },
  },
})
