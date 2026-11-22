<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import StatusBar from '@/ui/common/StatusBar.vue'
import BottomNav from '@/ui/shell/BottomNav.vue'
import SideDrawer from '@/ui/shell/SideDrawer.vue'
import ToastHost from '@/ui/common/ToastHost.vue'

const route = useRoute()
const hideNav = computed(() => !['messages', 'contacts', 'tavern'].includes(String(route.name)))
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
    <ToastHost />
  </div>
</template>
