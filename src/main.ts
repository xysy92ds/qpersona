import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useSettingsStore } from './store/settings'
import { useContactsStore } from './store/contacts'

import 'fake-qq-ui/styles/fake-qq-ui.css'
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

  app.mount('#app')
}

void bootstrap()
