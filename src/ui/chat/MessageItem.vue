<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { QText } from 'fake-qq-ui'
import type { Message } from '@/core/types'
import { avatarSvg } from '@/core/avatar'
import { usageLabel } from '@/core/pricing'
import { PauseOutline, PlayOutline } from '@vicons/ionicons5'

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
const isCard = computed(() => props.message.kind === 'card')
const isImage = computed(() => props.message.kind === 'image')
const isVideo = computed(() => props.message.kind === 'video')
const isVoice = computed(() => props.message.kind === 'voice')
const playing = ref(false)
let audio: HTMLAudioElement | null = null

const voiceSeconds = computed(() => Math.max(1, Math.round(props.message.voice?.duration ?? 1)))
const voiceWidth = computed(() => Math.min(220, 108 + voiceSeconds.value * 7))

function toggleVoicePlayback() {
  const url = props.message.voice?.url
  if (!url) return
  if (!audio) {
    audio = new Audio(url)
    audio.onended = () => {
      playing.value = false
    }
    audio.onerror = () => {
      playing.value = false
    }
  }
  if (playing.value) {
    audio.pause()
    playing.value = false
  } else {
    void audio.play().then(() => {
      playing.value = true
    }).catch(() => {
      playing.value = false
    })
  }
}

onUnmounted(() => {
  audio?.pause()
})

let lastAvatarTap = 0

function onRowClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.qq-message__avatar-span')) return
  if (isSelf.value) return
  const now = Date.now()
  if (now - lastAvatarTap < 320) {
    lastAvatarTap = 0
    emit('poke', props.characterName)
  } else {
    lastAvatarTap = now
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '').slice(0, 32)
  }
}

function formatSize(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const emit = defineEmits<{ longpress: [Message]; poke: [string]; preview: [string] }>()
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
      'msg--hide-name': !showName || isSelf,
      'msg--sticker': isSticker,
      'msg--card': isCard,
      'msg--media': isImage || isVideo,
    }"
    @pointerdown="down"
    @pointerup="cancel"
    @pointerleave="cancel"
    @pointermove="move"
    @contextmenu.prevent="emit('longpress', message)"
    @click="onRowClick"
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
          v-if="isImage && message.image"
          class="media-link"
          @click.prevent="emit('preview', message.image.url)"
        >
          <img class="chat-image" :src="message.image.url" alt="图片" draggable="false" />
        </a>

        <button
          v-else-if="isVoice && message.voice"
          class="voice-bubble"
          :class="{ playing }"
          :style="{ width: voiceWidth + 'px' }"
          @click.stop="toggleVoicePlayback"
        >
          <span class="voice-bubble__icon">
            <PauseOutline v-if="playing" />
            <PlayOutline v-else />
          </span>
          <span class="voice-bubble__wave"><i /><i /><i /><i /><i /></span>
          <span class="voice-bubble__dur">{{ voiceSeconds }}″</span>
        </button>

        <video
          v-else-if="isVideo && message.video"
          class="chat-video"
          :src="message.video.url"
          controls
          preload="metadata"
        />

        <a
          v-else-if="isCard && message.card"
          class="link-card"
          :href="message.card.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="link-card__body">
            <span class="link-card__title">{{ message.card.title }}</span>
            <span v-if="message.card.description" class="link-card__desc">{{ message.card.description }}</span>
            <span class="link-card__url">{{ hostOf(message.card.url) }}</span>
          </span>
          <span class="link-card__thumb">🔗</span>
        </a>

        <a
          v-else-if="isFile && message.file"
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
.msg--media :deep(.msg-content-container) {
  background: transparent !important;
  padding: 0 !important;
}
.msg--media :deep(.mix-message__container) {
  padding: 0 !important;
}
.msg--media :deep(.message-content) {
  padding: 0;
}
.media-link {
  display: block;
  line-height: 0;
  text-decoration: none;
}
.chat-image {
  display: block;
  max-width: 200px;
  max-height: 260px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg);
}
.voice-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 96px;
  max-width: 220px;
  padding: 2px 0;
  color: inherit;
}
.voice-bubble__icon {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  flex: none;
}
.voice-bubble__icon svg {
  width: 18px;
  height: 18px;
}
.voice-bubble__wave {
  display: flex;
  align-items: center;
  gap: 2.5px;
  flex: 1;
  height: 20px;
}
.voice-bubble__wave i {
  width: 2.5px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.55;
  height: 8px;
}
.voice-bubble__wave i:nth-child(2) {
  height: 13px;
}
.voice-bubble__wave i:nth-child(3) {
  height: 18px;
}
.voice-bubble__wave i:nth-child(4) {
  height: 12px;
}
.voice-bubble__wave i:nth-child(5) {
  height: 7px;
}
.voice-bubble.playing .voice-bubble__wave i {
  animation: voice-wave 0.9s ease-in-out infinite;
  opacity: 0.9;
}
.voice-bubble.playing .voice-bubble__wave i:nth-child(2) {
  animation-delay: 0.12s;
}
.voice-bubble.playing .voice-bubble__wave i:nth-child(3) {
  animation-delay: 0.24s;
}
.voice-bubble.playing .voice-bubble__wave i:nth-child(4) {
  animation-delay: 0.36s;
}
.voice-bubble.playing .voice-bubble__wave i:nth-child(5) {
  animation-delay: 0.48s;
}
@keyframes voice-wave {
  0%,
  100% {
    transform: scaleY(0.6);
  }
  50% {
    transform: scaleY(1.25);
  }
}
.voice-bubble__dur {
  font-size: 11px;
  opacity: 0.75;
  flex: none;
}
.chat-video {
  display: block;
  width: 220px;
  max-width: 64vw;
  max-height: 300px;
  border-radius: 8px;
  background: #000;
}
.msg--card :deep(.mix-message__container) {
  padding: 6px !important;
}
.msg :deep(.link-card) {
  text-decoration: none !important;
  color: #14171c !important;
}
.link-card {
  display: flex;
  align-items: stretch;
  gap: 10px;
  width: 228px;
  max-width: 64vw;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  color: #14171c;
}
.link-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.link-card__title {
  color: #14171c;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.link-card__desc {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.link-card__url {
  font-size: 10px;
  color: #9aa1ad;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.link-card__thumb {
  width: 46px;
  height: 46px;
  border-radius: 8px;
  background: linear-gradient(135deg, #dbeafe, #e0e7ff);
  display: grid;
  place-items: center;
  font-size: 20px;
  flex: none;
  align-self: center;
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
