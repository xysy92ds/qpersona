<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import StatusBar from '@/ui/common/StatusBar.vue'
import BottomNav from '@/ui/shell/BottomNav.vue'
import SideDrawer from '@/ui/shell/SideDrawer.vue'
import CallHost from '@/ui/chat/CallHost.vue'
import { useProactiveStore } from '@/store/proactive'
import { useHumanStore } from '@/store/human'
import ToastHost from '@/ui/common/ToastHost.vue'

const route = useRoute()
const hideNav = computed(() => !['messages', 'contacts', 'tavern'].includes(String(route.name)))

const proactive = useProactiveStore()
const human = useHumanStore()
let warmup: number | null = null
let timer: number | null = null
let dmTimer: number | null = null

onMounted(() => {
  warmup = window.setTimeout(() => void proactive.tick(), 20_000)
  timer = window.setInterval(() => void proactive.tick(), 60_000)
  dmTimer = window.setInterval(() => void human.poll().catch(() => {}), 10_000)
  window.setTimeout(() => void human.poll().catch(() => {}), 3_000)
})

onUnmounted(() => {
  if (warmup) window.clearTimeout(warmup)
  if (timer) window.clearInterval(timer)
  if (dmTimer) window.clearInterval(dmTimer)
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
