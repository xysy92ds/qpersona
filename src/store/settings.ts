import { defineStore } from 'pinia'
import type { ApiProfile, AppUser, SlotId } from '@/core/types'
import { DEFAULT_USER } from '@/core/types'
import { kvGet, kvSet } from '@/core/db'
import { uid } from '@/core/util'

export type ThemeMode = 'light' | 'dark'

interface PersistedSettings {
  profiles: ApiProfile[]
  bindings: Partial<Record<SlotId, string>>
  theme: ThemeMode
  flags: { memory: boolean; groupInterest: boolean; tts: boolean; notify: boolean }
  user: AppUser
}

const DEFAULTS: PersistedSettings = {
  profiles: [],
  bindings: {},
  theme: 'light',
  flags: { memory: true, groupInterest: true, tts: false, notify: true },
  user: DEFAULT_USER,
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    loaded: false,
    ...structuredClone(DEFAULTS),
  }),

  getters: {
    mainProfile(state): ApiProfile | null {
      const id = state.bindings.text_main
      return state.profiles.find((p) => p.id === id) ?? state.profiles[0] ?? null
    },
    /** 槽位解析：未绑定则回落到主对话模型 */
    profileFor(state) {
      return (slot: SlotId, overrideId?: string): ApiProfile | null => {
        const id = overrideId || state.bindings[slot]
        if (id) {
          const found = state.profiles.find((p) => p.id === id)
          if (found) return found
        }
        if (slot === 'memory_summary') return state.profiles.find((p) => p.id === state.bindings.text_main) ?? state.profiles[0] ?? null
        return state.profiles.find((p) => p.id === state.bindings.text_main) ?? state.profiles[0] ?? null
      }
    },
    themeClass(state): string {
      return state.theme === 'dark' ? 'dark' : ''
    },
  },

  actions: {
    async load() {
      const saved = await kvGet<PersistedSettings>('settings', DEFAULTS)
      this.profiles = saved.profiles ?? []
      this.bindings = saved.bindings ?? {}
      this.theme = saved.theme ?? 'light'
      this.flags = { ...DEFAULTS.flags, ...(saved.flags ?? {}) }
      this.user = { ...DEFAULT_USER, ...(saved.user ?? {}) }
      this.loaded = true
      this.applyTheme()
    },

    snapshot(): PersistedSettings {
      return {
        profiles: this.profiles,
        bindings: this.bindings,
        theme: this.theme,
        flags: { ...this.flags },
        user: { ...this.user },
      }
    },

    async persist() {
      await kvSet('settings', this.snapshot())
    },

    applyTheme() {
      const el = document.documentElement
      el.dataset.theme = this.theme
      el.classList.toggle('dark', this.theme === 'dark')
    },

    async setTheme(t: ThemeMode) {
      this.theme = t
      this.applyTheme()
      await this.persist()
    },

    async setFlag(key: keyof PersistedSettings['flags'], value: boolean) {
      this.flags[key] = value
      await this.persist()
    },

    async saveUser(patch: Partial<AppUser>) {
      this.user = { ...this.user, ...patch }
      await this.persist()
    },

    async addProfile(input: Omit<ApiProfile, 'id' | 'createdAt'>): Promise<ApiProfile> {
      const profile: ApiProfile = { ...input, id: uid('api'), createdAt: Date.now() }
      this.profiles.push(profile)
      if (!this.bindings.text_main) this.bindings.text_main = profile.id
      await this.persist()
      return profile
    },

    async updateProfile(id: string, patch: Partial<ApiProfile>) {
      const i = this.profiles.findIndex((p) => p.id === id)
      if (i >= 0) {
        this.profiles[i] = { ...this.profiles[i]!, ...patch }
        await this.persist()
      }
    },

    async removeProfile(id: string) {
      this.profiles = this.profiles.filter((p) => p.id !== id)
      for (const [slot, pid] of Object.entries(this.bindings)) {
        if (pid === id) delete this.bindings[slot as SlotId]
      }
      await this.persist()
    },

    async bind(slot: SlotId, profileId: string | null) {
      if (profileId) this.bindings[slot] = profileId
      else delete this.bindings[slot]
      await this.persist()
    },
  },
})
