import { defineStore } from 'pinia'
import {
  applyRemoteItems,
  clearDemoIfOnly,
  cloudLogin,
  cloudLogout,
  cloudPull,
  cloudPush,
  cloudRegister,
  collectLocalItems,
  type CloudUser,
} from '@/core/cloud'
import { useContactsStore } from './contacts'
import { useSettingsStore } from './settings'

const TOKEN_KEY = 'jianyie.cloud.token'
const USER_KEY = 'jianyie.cloud.user'
const SINCE_KEY = 'jianyie.cloud.since'

function readUser(): CloudUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as CloudUser) : null
  } catch {
    return null
  }
}

export const useCloudStore = defineStore('cloud', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: readUser(),
    syncing: false,
    lastSync: Number(localStorage.getItem(SINCE_KEY) || 0),
    lastResult: '',
    error: '',
  }),

  getters: {
    loggedIn: (s) => !!s.token && !!s.user,
    displayName: (s) => s.user?.username || '游客',
  },

  actions: {
    saveSession(token: string, user: CloudUser) {
      this.token = token
      this.user = user
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    },

    async register(username: string, password: string) {
      const settings = useSettingsStore()
      const res = await cloudRegister(settings.cloudUrl, username, password)
      this.saveSession(res.token, res.user)
      this.error = ''
      this.lastSync = 0
      localStorage.setItem(SINCE_KEY, '0')
    },

    async login(username: string, password: string) {
      const settings = useSettingsStore()
      const res = await cloudLogin(settings.cloudUrl, username, password)
      this.saveSession(res.token, res.user)
      this.error = ''
    },

    async logout() {
      const settings = useSettingsStore()
      if (this.token) await cloudLogout(settings.cloudUrl, this.token)
      this.token = ''
      this.user = null
      this.lastSync = 0
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(SINCE_KEY)
    },

    /** 先拉云端（只拉比本地新的），再推本地，保证本地优先 */
    async syncNow() {
      if (!this.loggedIn || this.syncing) return
      const settings = useSettingsStore()
      const contacts = useContactsStore()
      this.syncing = true
      this.error = ''
      try {
        let localBefore = await collectLocalItems()
        const pull = await cloudPull(settings.cloudUrl, this.token, this.lastSync)
        if (pull.items.length) {
          await clearDemoIfOnly(localBefore)
          localBefore = await collectLocalItems()
        }
        const applied = await applyRemoteItems(pull.items, localBefore)
        const localAfter = await collectLocalItems()
        const pushed = await cloudPush(settings.cloudUrl, this.token, localAfter)
        this.lastSync = pushed.now
        localStorage.setItem(SINCE_KEY, String(pushed.now))
        await contacts.load()
        this.lastResult = `拉取 ${applied} 条，上传 ${pushed.accepted} 条`
      } catch (e) {
        this.error = e instanceof Error ? e.message : '同步失败'
      } finally {
        this.syncing = false
      }
    },
  },
})
