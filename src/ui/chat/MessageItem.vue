<script setup lang="ts">
import { computed } from 'vue'
import { QText } from 'fake-qq-ui'
import type { Message } from '@/core/types'
import { avatarSvg } from '@/core/avatar'
import { usageLabel } from '@/core/pricing'

const props = defineProps<{
  message: Message
  /** 单聊不显示昵称，群聊显示 */
  showName: boolean
  characterName: string
  characterAvatar: string
  userName: string
  userAvatar: string
  showUsage?: boolean
}>()

const isSelf = computed(() => props.message.role === 'user')
const name = computed(() => (isSelf.value ? props.userName : props.characterName))
const avatar = computed(() => (isSelf.value ? props.userAvatar || avatarSvg(props.userName) : props.characterAvatar))
const isTip = computed(() => props.message.kind === 'tip')
const usageText = computed(() => usageLabel(props.message))
const isSticker = computed(() => props.message.kind === 'sticker')
const isFile = computed(() => props.message.kind === 'file')

function formatSize(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const emit = defineEmits<{ longpress: [Message] }>()
let timer: number | null = null
let startX = 0
let startY = 0

function down(e: PointerEvent) {
  startX = e.clientX
  startY = e.clientY
  timer = window.setTimeout(() => {
    timer = null
    emit('longpress', props.message)
  }, 450)
}
function cancel() {
  if (timer) {
    window.clearTimeout(timer)
    timer = null
  }
}
function move(e: PointerEvent) {
  if (Math.abs(e.clientX - startX) > 9 || Math.abs(e.clientY - startY) > 9) cancel()
}
</script>

<template>
  <div v-if="isTip" class="tip">{{ message.text }}</div>
  <div
    v-else
    class="msg"
    :class="{
      'msg--self': isSelf,
      'msg--error': message.status === 'error',
      'msg--hide-name': !showName,
      'msg--sticker': isSticker,
    }"
    @pointerdown="down"
    @pointerup="cancel"
    @pointerleave="cancel"
    @pointermove="move"
    @contextmenu.prevent="emit('longpress', message)"
  >
    <QText :self="isSelf" :name="name" :avatar="avatar">
      <div v-if="isSticker && message.sticker" class="sticker-wrap">
        <img class="sticker-img" :src="message.sticker.url" :alt="message.sticker.name" draggable="false" />
      </div>

      <template v-else>
        <div v-if="message.quote" class="quote-inline">
          <span class="quote-inline__name">{{ message.quote.name }}</span>
          <span class="quote-inline__text">{{ message.quote.text }}</span>
        </div>

        <a
          v-if="isFile && message.file"
          class="file-card"
          :href="message.file.url"
          :download="message.file.name"
        >
          <span class="file-card__icon">📄</span>
          <span class="file-card__body">
            <span class="file-card__name">{{ message.file.name }}</span>
            <span class="file-card__size">{{ formatSize(message.file.size) }}</span>
          </span>
          <span class="file-card__dl">下载</span>
        </a>

        <span v-else class="bubble-text" :class="{ 'is-error': message.status === 'error' }">
          <template v-if="message.text">{{ message.text }}</template>
          <span v-else-if="message.status === 'streaming'" class="dots"><i /><i /><i /></span>
        </span>
      </template>
    </QText>
    <div
      v-if="showUsage && !isSelf && message.usage"
      class="usage"
      :title="`输入 ${message.usage.prompt} / 输出 ${message.usage.completion} tokens`"
    >
      {{ usageText }}
    </div>
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
  display: none !important;
}
.msg--hide-name :deep(.message-container) {
  padding-top: 5px;
}
.bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: calc(15px * var(--fs-scale));
  line-height: 1.52;
  letter-spacing: 0.1px;
}
.msg--sticker :deep(.msg-content-container) {
  background: transparent !important;
  padding: 0 !important;
  overflow: visible;
}
.msg--sticker :deep(.mix-message__container) {
  padding: 0 !important;
}
.msg--sticker :deep(.message-content) {
  padding: 0;
}
.msg--sticker :deep(.mix-message__inner img) {
  width: 112px !important;
  height: 112px !important;
  max-width: 112px !important;
  max-height: 112px !important;
  object-fit: contain;
  display: block;
  margin: 0 !important;
  border-radius: 6px;
}
.quote-inline {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-width: 220px;
  padding: 5px 8px;
  margin-bottom: 5px;
  border-left: 3px solid var(--brand);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.06);
}
[data-theme='dark'] .quote-inline {
  background: rgba(255, 255, 255, 0.08);
}
.quote-inline__name {
  font-size: 10px;
  color: var(--brand);
}
.quote-inline__text {
  font-size: 11px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.msg :deep(.file-card) {
  text-decoration: none !important;
  color: inherit !important;
}
.file-card {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 210px;
  max-width: 62vw;
  color: inherit;
  text-decoration: none;
}
.file-card__icon {
  width: 38px;
  height: 44px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
  display: grid;
  place-items: center;
  font-size: 19px;
  flex: none;
}
.file-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.file-card__name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-card__size {
  font-size: 10.5px;
  opacity: 0.65;
}
.file-card__dl {
  font-size: 10.5px;
  color: var(--brand);
  flex: none;
}
.msg--self .file-card__icon {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.msg--self .file-card__dl {
  color: #fff;
}
.msg--self .quote-inline {
  background: rgba(255, 255, 255, 0.16);
  border-left-color: rgba(255, 255, 255, 0.9);
}
.msg--self .quote-inline__name {
  color: #fff;
}
.msg--self .quote-inline__text {
  color: rgba(255, 255, 255, 0.86);
}
.msg--error :deep(.msg-content-container) {
  background: rgba(255, 77, 79, 0.09) !important;
  color: var(--danger) !important;
}
.msg--error .is-error {
  font-size: 13px;
}
.usage {
  padding-left: 45px;
  margin-top: -1px;
  font-size: 9.5px;
  line-height: 15px;
  color: var(--text-3);
  opacity: 0.62;
  user-select: none;
  letter-spacing: 0.2px;
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
