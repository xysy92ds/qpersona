import { createRouter, createWebHashHistory } from 'vue-router'

import MessagesPage from '@/ui/pages/MessagesPage.vue'
import ContactsPage from '@/ui/pages/ContactsPage.vue'
import MePage from '@/ui/pages/MePage.vue'
import ChatRoute from '@/ui/chat/ChatRoute.vue'
import AddFriendPage from '@/ui/add/AddFriendPage.vue'
import SettingsPage from '@/ui/pages/SettingsPage.vue'
import AiSettingsPage from '@/ui/pages/AiSettingsPage.vue'
import CharacterPage from '@/ui/pages/CharacterPage.vue'
import TavernPage from '@/ui/pages/TavernPage.vue'
import SearchPage from '@/ui/pages/SearchPage.vue'
import ProfileEditPage from '@/ui/pages/ProfileEditPage.vue'
import StickersPage from '@/ui/pages/StickersPage.vue'

/**
 * 用 hash 路由：静态部署到任何地方（GitHub Pages / 本地文件）都不会 404，
 * 同时保留 /tavern 这样的独立路由语义。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'messages', component: MessagesPage },
    { path: '/contacts', name: 'contacts', component: ContactsPage },
    { path: '/me', name: 'me', component: MePage },
    { path: '/chat/:id', name: 'chat', component: ChatRoute, props: true },
    { path: '/add', name: 'add', component: AddFriendPage },
    { path: '/search', name: 'search', component: SearchPage },
    { path: '/profile', name: 'profile', component: ProfileEditPage },
    { path: '/stickers', name: 'stickers', component: StickersPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/settings/ai', name: 'ai-settings', component: AiSettingsPage },
    { path: '/character/:id', name: 'character', component: CharacterPage, props: true },
    { path: '/tavern', name: 'tavern', component: TavernPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
