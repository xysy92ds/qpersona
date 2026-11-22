<script setup lang="ts">
import { toasts } from './toast'
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast">{{ t.text }}</div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 90;
}
.toast {
  max-width: 76%;
  padding: 9px 16px;
  border-radius: 10px;
  background: rgba(20, 23, 28, 0.86);
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  backdrop-filter: blur(6px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}
</style>
