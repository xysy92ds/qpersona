<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import StatusBar from '@/ui/common/StatusBar.vue'
import BottomNav from '@/ui/shell/BottomNav.vue'
import SideDrawer from '@/ui/shell/SideDrawer.vue'
import CallHost from '@/ui/chat/CallHost.vue'
import { useProactiveStore } from '@/store/proactive'
import { useHumanStore } from '@/store/human'
import { useCloudStore } from '@/store/cloud'
import ToastHost from '@/ui/common/ToastHost.vue'

const route = useRoute()
const hideNav = computed(() => !['messages', 'contacts', 'tavern'].includes(String(route.name)))

const proactive = useProactiveStore()
const human = useHumanStore()
const cloud = useCloudStore()
let warmup: number | null = null
let timer: number | null = null
let dmTimer: number | null = null
let syncTimer: number | null = null

function autoSync() {
  if (cloud.loggedIn && !cloud.syncing) void cloud.syncNow()
}

onMounted(() => {
  warmup = window.setTimeout(() => void proactive.tick(), 20_000)
  timer = window.setInterval(() => void proactive.tick(), 60_000)
  dmTimer = window.setInterval(() => void human.poll().catch(() => {}), 10_000)
  window.setTimeout(() => void human.poll().catch(() => {}), 3_000)
  window.setTimeout(autoSync, 3_000)
  syncTimer = window.setInterval(autoSync, 120_000)
  document.addEventListener('visibilitychange', onVisible)
})

function onVisible() {
  if (document.visibilityState === 'visible') autoSync()
}

onUnmounted(() => {
  if (warmup) window.clearTimeout(warmup)
  if (timer) window.clearInterval(timer)
  if (dmTimer) window.clearInterval(dmTimer)
  if (syncTimer) window.clearInterval(syncTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <div class="phone">
    <StatusBar />
    <div class="phone-body">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </div>
    <BottomNav v-if="!hideNav" />
    <SideDrawer />
    <CallHost />
    <ToastHost />
  </div>
</template>
