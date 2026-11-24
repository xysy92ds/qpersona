import { defineStore } from 'pinia'
import type { ApiProfile, AppUser, SlotId } from '@/core/types'
import { DEFAULT_USER } from '@/core/types'
import { kvGet, kvSet } from '@/core/db'
import { uid } from '@/core/util'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type FontScale = 'small' | 'normal' | 'large'
export type BubbleStyle = 'classic' | 'mint' | 'sunset' | 'sakura' | 'ink' | 'lavender' | 'cocoa'
export type TextStyle = 'default' | 'serif'

export interface Flags {
  memory: boolean
  groupInterest: boolean
  tts: boolean
  notify: boolean
  sound: boolean
}

export interface Appearance {
  fontScale: FontScale
  bubble: BubbleStyle
  textStyle: TextStyle
  /** 聊天背景图 dataURL，空串 = 默认 */
  chatBackground: string
}

export interface MemoryPlan {
  mode: 'messages' | 'time'
  /** 每多少条消息总结一次 */
  every: number
  /** 按时间模式：多少分钟一次 */
  minutes: number
}

export interface ProactivePlan {
  enabled: boolean
  /** 到点后触发的概率 0~100 */
  probability: number
  /** 距离上一条消息至少多少分钟 */
  minutes: number
  /** 免打扰时段 */
  quietEnabled: boolean
  quietStart: number
  quietEnd: number
}

export interface ChatPrefs {
  /** 模型回多行时自动拆成几条消息 */
  autoSplit: boolean
  /** 聊天里显示时间分隔 */
  showTime: boolean
  /** 每条回复下面显示 token 用量与估算花费 */
  showUsage: boolean
}

interface PersistedSettings {
  profiles: ApiProfile[]
  bindings: Partial<Record<SlotId, string>>
  theme: ThemeMode
  flags: Flags
  appearance: Appearance
  chat: ChatPrefs
  memoryPlan: MemoryPlan
  proactive: ProactivePlan
  plazaUrl: string
  user: AppUser
}

const DEFAULTS: PersistedSettings = {
  profiles: [],
  bindings: {},
  theme: 'light',
  flags: { memory: true, groupInterest: true, tts: false, notify: true, sound: true },
  appearance: { fontScale: 'normal', bubble: 'classic', textStyle: 'default', chatBackground: '' },
  chat: { autoSplit: true, showTime: true, showUsage: true },
  memoryPlan: { mode: 'messages', every: 40, minutes: 120 },
  proactive: { enabled: false, probability: 30, minutes: 60, quietEnabled: true, quietStart: 23, quietEnd: 8 },
  plazaUrl: '',
  user: DEFAULT_USER,
}

let mediaCleanup: (() => void) | null = null

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    loaded: false,
    systemDark: false,
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
        // memory_summary / 其他槽位留空 → 复用 text_main
        return state.profiles.find((p) => p.id === state.bindings.text_main) ?? state.profiles[0] ?? null
      }
    },
    isDark(state): boolean {
      return state.theme === 'auto' ? !!state.systemDark : state.theme === 'dark'
    },
  },

  actions: {
    async load() {
      const saved = await kvGet<PersistedSettings>('settings', DEFAULTS)
      this.profiles = saved.profiles ?? []
      this.bindings = saved.bindings ?? {}
      this.theme = saved.theme ?? 'light'
      this.flags = { ...DEFAULTS.flags, ...(saved.flags ?? {}) }
      this.appearance = { ...DEFAULTS.appearance, ...(saved.appearance ?? {}) }
      this.chat = { ...DEFAULTS.chat, ...(saved.chat ?? {}) }
      this.memoryPlan = { ...DEFAULTS.memoryPlan, ...(saved.memoryPlan ?? {}) }
      this.proactive = { ...DEFAULTS.proactive, ...(saved.proactive ?? {}) }
      this.plazaUrl = saved.plazaUrl ?? ''
      this.user = { ...DEFAULT_USER, ...(saved.user ?? {}) }
      this.loaded = true

      // 跟随系统时，系统切换要实时生效
      if (typeof matchMedia !== 'undefined') {
        const mq = matchMedia('(prefers-color-scheme: dark)')
        this.systemDark = mq.matches
        if (!mediaCleanup) {
          const onChange = () => {
            this.systemDark = mq.matches
            this.applyAppearance()
          }
          mq.addEventListener('change', onChange)
          mediaCleanup = () => mq.removeEventListener('change', onChange)
        }
      }
      this.applyAppearance()
    },

    snapshot(): PersistedSettings {
      return {
        profiles: this.profiles,
        bindings: this.bindings,
        theme: this.theme,
        flags: { ...this.flags },
        appearance: { ...this.appearance },
        chat: { ...this.chat },
        memoryPlan: { ...this.memoryPlan },
        proactive: { ...this.proactive },
        plazaUrl: this.plazaUrl,
        user: { ...this.user },
      }
    },

    async persist() {
      await kvSet('settings', this.snapshot())
    },

    applyAppearance() {
      if (typeof document === 'undefined') return
      const el = document.documentElement
      const dark = this.isDark
      el.dataset.theme = dark ? 'dark' : 'light'
      el.classList.toggle('dark', dark)
      el.dataset.font = this.appearance.fontScale
      el.dataset.bubble = this.appearance.bubble
      el.dataset.text = this.appearance.textStyle
      el.style.colorScheme = dark ? 'dark' : 'light'
    },

    async setTheme(t: ThemeMode) {
      this.theme = t
      this.applyAppearance()
      await this.persist()
    },

    async toggleTheme() {
      await this.setTheme(this.isDark ? 'light' : 'dark')
    },

    async setFontScale(v: FontScale) {
      this.appearance.fontScale = v
      this.applyAppearance()
      await this.persist()
    },

    async setBubble(v: BubbleStyle) {
      this.appearance.bubble = v
      this.applyAppearance()
      await this.persist()
    },


    async setTextStyle(v: TextStyle) {
      this.appearance.textStyle = v
      this.applyAppearance()
      await this.persist()
    },

    async setChatBackground(dataUrl: string) {
      this.appearance.chatBackground = dataUrl
      await this.persist()
    },

    async setMemoryPlan(patch: Partial<MemoryPlan>) {
      this.memoryPlan = { ...this.memoryPlan, ...patch }
      await this.persist()
    },

    async setProactive(patch: Partial<ProactivePlan>) {
      this.proactive = { ...this.proactive, ...patch }
      await this.persist()
    },

    async setPlazaUrl(url: string) {
      this.plazaUrl = url.trim()
      await this.persist()
    },

    async setChatPref<K extends keyof ChatPrefs>(key: K, value: ChatPrefs[K]) {
      this.chat[key] = value
      await this.persist()
    },

    async setFlag(key: keyof Flags, value: boolean) {
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
