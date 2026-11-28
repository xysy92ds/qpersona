<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import StatusBar from '@/ui/common/StatusBar.vue'
import BottomNav from '@/ui/shell/BottomNav.vue'
import SideDrawer from '@/ui/shell/SideDrawer.vue'
import CallHost from '@/ui/chat/CallHost.vue'
import DesktopSidebar from '@/ui/shell/DesktopSidebar.vue'
import { useProactiveStore } from '@/store/proactive'
import { useHumanStore } from '@/store/human'
import { useGroupsStore } from '@/store/groups'
import { useCloudStore } from '@/store/cloud'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useSettingsStore } from '@/store/settings'
import { start as startDmPush, stop as stopDmPush } from '@/core/push'
import ToastHost from '@/ui/common/ToastHost.vue'

const route = useRoute()
const hideNav = computed(() => !['messages', 'contacts', 'tavern'].includes(String(route.name)))
const isWide = ref(typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches)
const desktopChat = computed(() => isWide.value && route.name === 'chat')
let media: MediaQueryList | null = null
function onMedia() {
  isWide.value = !!media?.matches
}

const proactive = useProactiveStore()
const human = useHumanStore()
const groups = useGroupsStore()
const cloud = useCloudStore()
const settings = useSettingsStore()
let warmup: number | null = null
let timer: number | null = null
let dmTimer: number | null = null
let syncTimer: number | null = null

function autoSync() {
  if (cloud.loggedIn && !cloud.syncing) void cloud.syncNow()
}

onMounted(() => {
  media = window.matchMedia('(min-width: 900px)')
  media.addEventListener('change', onMedia)
  warmup = window.setTimeout(() => void proactive.tick(), 20_000)
  timer = window.setInterval(() => void proactive.tick(), 60_000)
  dmTimer = window.setInterval(() => {
    void human.poll().catch(() => {})
    void groups.poll().catch(() => {})
  }, 10_000)
  window.setTimeout(() => void human.poll().catch(() => {}), 3_000)
  window.setTimeout(() => void groups.poll().catch(() => {}), 3_500)
  window.setTimeout(autoSync, 3_000)
  syncTimer = window.setInterval(autoSync, 120_000)
  if (Capacitor.isNativePlatform()) {
    void LocalNotifications.requestPermissions().catch(() => {})
  }
  if (cloud.loggedIn) void startDmPush({ token: cloud.token, baseUrl: settings.cloudUrl })
  document.addEventListener('visibilitychange', onVisible)
})

watch(
  () => [cloud.loggedIn, cloud.token, settings.cloudUrl],
  () => {
    if (cloud.loggedIn && cloud.token) {
      void startDmPush({ token: cloud.token, baseUrl: settings.cloudUrl })
    } else {
      void stopDmPush()
    }
  },
)

function onVisible() {
  if (document.visibilityState !== 'visible') return
  autoSync()
  if (cloud.loggedIn && cloud.token) void startDmPush({ token: cloud.token, baseUrl: settings.cloudUrl })
}

onUnmounted(() => {
  if (warmup) window.clearTimeout(warmup)
  if (timer) window.clearInterval(timer)
  if (dmTimer) window.clearInterval(dmTimer)
  if (syncTimer) window.clearInterval(syncTimer)
  document.removeEventListener('visibilitychange', onVisible)
  media?.removeEventListener('change', onMedia)
})
</script>

<template>
  <div class="phone" :class="{ 'desktop-chat': desktopChat }">
    <StatusBar v-if="!desktopChat" />
    <DesktopSidebar v-if="desktopChat" />
    <div class="phone-body">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </div>
    <BottomNav v-if="!hideNav && !desktopChat" />
    <SideDrawer />
    <CallHost />
    <ToastHost />
  </div>
</template>
