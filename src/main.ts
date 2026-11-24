import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useSettingsStore } from './store/settings'
import { useContactsStore } from './store/contacts'

import './styles/chat-bubbles.css'
import './styles/base.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)

  const settings = useSettingsStore(pinia)
  const contacts = useContactsStore(pinia)
  await settings.load()
  await contacts.load()

  // Android 壳：隐藏系统状态栏，使用应用自己的状态栏；避免顶部出现两套时间/电量
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.hide()
    } catch {
      /* Web/PWA 或旧壳没有这个能力 */
    }
  }

  app.mount('#app')
}

void bootstrap()
