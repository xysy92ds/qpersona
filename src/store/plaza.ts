import { defineStore } from 'pinia'
import { useContactsStore } from './contacts'
import { useCloudStore } from './cloud'
import { useSettingsStore } from './settings'
import {
  extForPlaza,
  fetchCloudPlaza,
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
      await uploadCloudPlaza(settings.cloudUrl, cloud.token, ch.card, ch.ext.qq, ch.ext.qq.avatar)
      this.mode = 'cloud'
      this.loaded = false
      await this.load(true)
    },

    async importCard(item: PlazaCard): Promise<Character> {
      const contacts = useContactsStore()
      return contacts.addCharacter(item.card, extForPlaza(item))
    },
  },
})
