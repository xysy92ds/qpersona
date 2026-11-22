<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { clockOf } from '@/core/util'

const time = ref(clockOf(Date.now()))
const timer = window.setInterval(() => {
  time.value = clockOf(Date.now())
}, 20_000)
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <div class="statusbar">
    <span class="sb-time">{{ time }}</span>
    <div class="statusbar__right">
      <div class="sb-signal"><i /><i /><i /><i /></div>
      <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
        <path d="M7.5 9.6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
        <path
          d="M4.6 6.7a4.1 4.1 0 0 1 5.8 0M2.2 4.3a7.5 7.5 0 0 1 10.6 0"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
      </svg>
      <div class="sb-batt"><b style="width: 78%" /></div>
    </div>
  </div>
</template>

<style scoped>
.sb-time {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
