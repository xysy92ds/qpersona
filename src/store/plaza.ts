import { defineStore } from 'pinia'
import { useContactsStore } from './contacts'
import { useSettingsStore } from './settings'
import {
  extForPlaza,
  normalizePlaza,
  searchPlaza,
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
        const configured = settings.plazaUrl.trim()
        const url = configured
          ? configured
          : new URL('plaza/cards.json', document.baseURI).toString()
        this.source = url
        const res = await fetch(force ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        this.cards = normalizePlaza(data)
        this.loaded = true
        if (!this.cards.length) this.error = '广场里还没有卡片'
      } catch (e) {
        this.error = `广场加载失败：${e instanceof Error ? e.message : String(e)}`
      } finally {
        this.loading = false
      }
    },

    async importCard(item: PlazaCard): Promise<Character> {
      const contacts = useContactsStore()
      return contacts.addCharacter(item.card, extForPlaza(item))
    },
  },
})
