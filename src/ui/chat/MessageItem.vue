<script setup lang="ts">
import { computed } from 'vue'
import { QText } from 'fake-qq-ui'
import type { Message } from '@/core/types'
import { avatarSvg } from '@/core/avatar'

const props = defineProps<{
  message: Message
  /** 单聊不显示昵称，群聊显示 */
  showName: boolean
  characterName: string
  characterAvatar: string
  userName: string
  userAvatar: string
}>()

const isSelf = computed(() => props.message.role === 'user')
const name = computed(() => (isSelf.value ? props.userName : props.characterName))
const avatar = computed(() => (isSelf.value ? props.userAvatar || avatarSvg(props.userName) : props.characterAvatar))
const isTip = computed(() => props.message.kind === 'tip')
</script>

<template>
  <div v-if="isTip" class="tip">{{ message.text }}</div>
  <div v-else class="msg" :class="{ 'msg--self': isSelf, 'msg--error': message.status === 'error', 'msg--hide-name': !showName }">
    <QText :self="isSelf" :name="name" :avatar="avatar">
      <span class="bubble-text" :class="{ 'is-error': message.status === 'error' }">
        <template v-if="message.text">{{ message.text }}</template>
        <span v-else-if="message.status === 'streaming'" class="dots"><i /><i /><i /></span>
      </span>
    </QText>
  </div>
</template>

<style scoped>
.msg {
  padding: 0 6px;
}
.msg :deep(.message-container) {
  padding-top: 7px;
  padding-bottom: 1px;
}
.msg :deep(.msg-content-container) {
  border-radius: 9px;
  max-width: 100%;
}
.msg :deep(.mix-message__container) {
  padding: 8px 11px;
}
.msg :deep(.qq-message__user-name) {
  font-size: 11.5px;
  color: var(--text-3);
}
.msg--hide-name :deep(.qq-message__user-name) {
  display: none;
}
.msg--hide-name :deep(.message-container) {
  padding-top: 5px;
}
.bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.52;
  letter-spacing: 0.1px;
}
.msg--error :deep(.msg-content-container) {
  background: rgba(255, 77, 79, 0.09) !important;
  color: var(--danger) !important;
}
.msg--error .is-error {
  font-size: 13px;
}
.tip {
  margin: 10px 28px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.5;
  white-space: pre-wrap;
}
.dots {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 20px;
  padding: 0 2px;
}
.dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
  animation: blink 1.1s infinite ease-in-out;
}
.dots i:nth-child(2) {
  animation-delay: 0.18s;
}
.dots i:nth-child(3) {
  animation-delay: 0.36s;
}
@keyframes blink {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  30% {
    opacity: 0.95;
    transform: translateY(-2px);
  }
}
</style>
