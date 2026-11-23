<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import StatusBar from '@/ui/common/StatusBar.vue'
import BottomNav from '@/ui/shell/BottomNav.vue'
import SideDrawer from '@/ui/shell/SideDrawer.vue'
import CallHost from '@/ui/chat/CallHost.vue'
import { useProactiveStore } from '@/store/proactive'
import ToastHost from '@/ui/common/ToastHost.vue'

const route = useRoute()
const hideNav = computed(() => !['messages', 'contacts', 'tavern'].includes(String(route.name)))

const proactive = useProactiveStore()
let warmup: number | null = null
let timer: number | null = null

onMounted(() => {
  warmup = window.setTimeout(() => void proactive.tick(), 20_000)
  timer = window.setInterval(() => void proactive.tick(), 60_000)
})

onUnmounted(() => {
  if (warmup) window.clearTimeout(warmup)
  if (timer) window.clearInterval(timer)
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
