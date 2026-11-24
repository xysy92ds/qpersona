<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  AddCircleOutline,
  AddOutline,
  AtOutline,
  CallOutline,
  CloseOutline,
  DocumentAttachOutline,
  HappyOutline,
  ImagesOutline,
  LinkOutline,
  MicOutline,
  StopCircleOutline,
  VideocamOutline,
} from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { showToast } from '@/ui/common/toast'
import { imageToDataUrl } from '@/core/util'
import { useStickersStore } from '@/store/stickers'
import type {
  CardPayload,
  FilePayload,
  ImagePayload,
  QuotePayload,
  Sticker,
  VideoPayload,
  VoicePayload,
} from '@/core/types'

const props = defineProps<{
  disabled?: boolean
  streaming?: boolean
  quote?: QuotePayload | null
  mentionNames?: string[]
}>()
const emit = defineEmits<{
  send: [string]
  stop: []
  poke: []
  sticker: [Sticker]
  file: [FilePayload]
  card: [CardPayload]
  image: [ImagePayload]
  video: [VideoPayload]
  voice: [VoicePayload]
  call: []
  closeQuote: []
}>()

const router = useRouter()
const stickers = useStickersStore()

const text = ref('')
const area = ref<HTMLTextAreaElement>()
const panel = ref<'emoji' | 'sticker' | null>(null)
const moreOpen = ref(false)
const cardOpen = ref(false)
const mentionOpen = ref(false)
const mentionQuery = ref<string | null>(null)
const mentionStart = ref(0)
const listening = ref(false)
const recording = ref(false)
const recordSeconds = ref(0)
const card = ref({ title: '', url: '', description: '' })
const fileInput = ref<HTMLInputElement>()
const imageInput = ref<HTMLInputElement>()
const videoInput = ref<HTMLInputElement>()

let rec: any = null
let recorder: MediaRecorder | null = null
let recChunks: BlobPart[] = []
let recStream: MediaStream | null = null
let recStart = 0
let recTimer: number | null = null
let cancelRecorded = false

const EMOJIS = [
  '😀', '😄', '😁', '😆', '🥹', '😊', '🙂', '😉',
  '😍', '🥰', '😘', '😜', '🤪', '😎', '🤔', '😴',
  '😭', '😤', '😡', '🥺', '😳', '🙄', '😏', '🤗',
  '🤭', '🫠', '😵‍💫', '🤯', '🥳', '😇', '🤡', '👻',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '❤️', '💔',
  '🔥', '✨', '🎉', '🌙', '☕', '🍜', '🐱', '🌧️',
]

onMounted(() => {
  void stickers.load()
})

function resize() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(96, el.scrollHeight) + 'px'
}

function submit() {
  const v = text.value.trim()
  if (!v || props.disabled) return
  emit('send', v)
  text.value = ''
  panel.value = null
  nextTick(resize)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    if (mentionQuery.value !== null && mentionMatches.value.length) {
      e.preventDefault()
      chooseMention(mentionMatches.value[0]!)
      return
    }
    e.preventDefault()
    submit()
  }
}

function insertText(s: string) {
  const el = area.value
  const start = el?.selectionStart ?? text.value.length
  const end = el?.selectionEnd ?? text.value.length
  text.value = text.value.slice(0, start) + s + text.value.slice(end)
  nextTick(() => {
    el?.focus()
    el?.setSelectionRange(start + s.length, start + s.length)
    resize()
  })
}

function pickEmoji(e: string) {
  insertText(e)
}

function pickMention(name: string) {
  insertText(`@${name} `)
  mentionOpen.value = false
}

const mentionMatches = computed(() => {
  if (mentionQuery.value === null) return []
  const q = mentionQuery.value.toLowerCase()
  return (props.mentionNames ?? []).filter((n) => n.toLowerCase().includes(q)).slice(0, 6)
})

function updateMention() {
  const el = area.value
  if (!el || !props.mentionNames?.length) {
    mentionQuery.value = null
    return
  }
  const pos = el.selectionStart ?? text.value.length
  const before = text.value.slice(0, pos)
  const m = before.match(/@([^\s@]{0,16})$/)
  if (!m) {
    mentionQuery.value = null
    return
  }
  mentionStart.value = pos - m[0].length
  mentionQuery.value = m[1] ?? ''
}

function chooseMention(name: string) {
  const el = area.value
  const pos = el?.selectionStart ?? text.value.length
  const before = text.value.slice(0, mentionStart.value)
  const after = text.value.slice(pos)
  const insert = `@${name} `
  text.value = before + insert + after
  mentionQuery.value = null
  nextTick(() => {
    el?.focus()
    const p = before.length + insert.length
    el?.setSelectionRange(p, p)
    resize()
  })
}

function onInput() {
  resize()
  updateMention()
}

function hideMentionSoon() {
  window.setTimeout(() => {
    mentionQuery.value = null
  }, 180)
}

function openMention() {
  moreOpen.value = false
  mentionOpen.value = true
}

async function onImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const url = await imageToDataUrl(file, 1280)
    emit('image', { url })
    moreOpen.value = false
  } catch {
    showToast('这张图读不出来，换一张试试')
  }
}

async function onVideo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    showToast('视频别超过 8MB')
    return
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  emit('video', { url, name: file.name, size: file.size })
  moreOpen.value = false
}

function pickSticker(s: Sticker) {
  emit('sticker', s)
  panel.value = null
}

function openCardForm() {
  moreOpen.value = false
  card.value = { title: '', url: '', description: '' }
  cardOpen.value = true
}

function submitCard() {
  const title = card.value.title.trim()
  const raw = card.value.url.trim()
  if (!title || !raw) {
    showToast('标题和链接都要填')
    return
  }
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  emit('card', { title, description: card.value.description.trim(), url })
  cardOpen.value = false
}

function manageStickers() {
  panel.value = null
  router.push('/stickers')
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 2.5 * 1024 * 1024) {
    showToast('文件别超过 2.5MB')
    return
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  emit('file', { name: file.name, size: file.size, mime: file.type, url })
  moreOpen.value = false
}

/** 语音转文字：用浏览器自带的识别能力，没有就直说 */
function startSpeech() {
  moreOpen.value = false
  if (listening.value && rec) {
    rec.stop()
    return
  }
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) {
    showToast('这个浏览器没有语音输入，换 Chrome 试试')
    return
  }
  const r = new SR()
  r.lang = 'zh-CN'
  r.interimResults = true
  r.continuous = false
  r.onresult = (ev: any) => {
    let s = ''
    for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript
    text.value = s
    nextTick(resize)
  }
  r.onerror = () => showToast('没听清，再说一次')
  r.onend = () => {
    listening.value = false
    rec = null
    nextTick(resize)
  }
  r.start()
  rec = r
  listening.value = true
  showToast('正在听…说完会自动填进来')
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function cleanupRecord() {
  if (recTimer) window.clearInterval(recTimer)
  recTimer = null
  recStream?.getTracks().forEach((t) => t.stop())
  recStream = null
  recorder = null
  recChunks = []
  recording.value = false
  recordSeconds.value = 0
}

async function toggleRecord() {
  if (recording.value) {
    cancelRecorded = false
    try {
      recorder?.stop()
    } catch {
      cleanupRecord()
    }
    return
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showToast('这个浏览器不支持录音')
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime =
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      ) || ''
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    cancelRecorded = false
    recChunks = []
    mr.ondataavailable = (e) => {
      if (e.data.size) recChunks.push(e.data)
    }
    mr.onstop = async () => {
      const blob = new Blob(recChunks, { type: mr.mimeType || 'audio/webm' })
      const duration = Math.max(0.5, (Date.now() - recStart) / 1000)
      const cancelled = cancelRecorded
      cleanupRecord()
      if (cancelled || !blob.size) return
      try {
        const url = await blobToDataUrl(blob)
        emit('voice', { url, duration, mime: blob.type, size: blob.size })
      } catch {
        showToast('录音保存失败')
      }
    }
    recStream = stream
    recorder = mr
    recStart = Date.now()
    recording.value = true
    recordSeconds.value = 0
    mr.start()
    recTimer = window.setInterval(() => {
      recordSeconds.value = Math.floor((Date.now() - recStart) / 1000)
    }, 250)
  } catch {
    showToast('没有麦克风权限，或浏览器不支持录音')
    cleanupRecord()
  }
}

function sendRecording() {
  cancelRecorded = false
  try {
    recorder?.stop()
  } catch {
    cleanupRecord()
  }
}

function cancelRecording() {
  cancelRecorded = true
  try {
    recorder?.stop()
  } catch {
    cleanupRecord()
  }
}

onUnmounted(() => {
  try {
    rec?.stop()
  } catch {
    /* ignore */
  }
  cancelRecorded = true
  try {
    recorder?.stop()
  } catch {
    /* ignore */
  }
  cleanupRecord()
})

watch(text, () => nextTick(resize))
</script>

<template>
  <div class="composer">
    <div v-if="recording" class="recording">
      <span class="recording__dot" />
      <span class="recording__text">正在录音 {{ recordSeconds }}s</span>
      <button class="recording__btn" @click="cancelRecording">取消</button>
      <button class="recording__btn recording__btn--send" @click="sendRecording">发送</button>
    </div>

    <div v-if="quote" class="quote-bar">
      <div class="quote-bar__body">
        <span class="quote-bar__name">{{ quote.name }}</span>
        <span class="quote-bar__text">{{ quote.text }}</span>
      </div>
      <button class="quote-bar__close" aria-label="取消引用" @click="$emit('closeQuote')"><CloseOutline /></button>
    </div>

    <div v-if="panel" class="panel">
      <div class="panel__tabs">
        <button class="panel__tab" :class="{ on: panel === 'emoji' }" @click="panel = 'emoji'">表情</button>
        <button class="panel__tab" :class="{ on: panel === 'sticker' }" @click="panel = 'sticker'">表情包</button>
        <button class="panel__manage" @click="manageStickers">管理</button>
      </div>

      <div v-if="panel === 'emoji'" class="emoji-panel">
        <button v-for="e in EMOJIS" :key="e" class="emoji" @click="pickEmoji(e)">{{ e }}</button>
      </div>

      <div v-else class="sticker-panel">
        <button v-for="s in stickers.list" :key="s.id" class="sticker-cell" @click="pickSticker(s)">
          <img :src="s.dataUrl" :alt="s.name" />
          <span>{{ s.name }}</span>
        </button>
        <button class="sticker-cell sticker-cell--add" @click="manageStickers">
          <AddOutline />
          <span>添加</span>
        </button>
        <div v-if="!stickers.list.length" class="sticker-empty">
          还没有表情包，点「添加」上传一张。
        </div>
      </div>
    </div>

    <div v-if="mentionQuery !== null && mentionMatches.length" class="mention-pop">
      <button
        v-for="name in mentionMatches"
        :key="name"
        class="mention-item"
        @mousedown.prevent="chooseMention(name)"
      >
        <AtOutline />
        <span>{{ name }}</span>
      </button>
    </div>

    <div class="bar">
      <button
        class="cbtn"
        :class="{ active: recording }"
        aria-label="录音"
        @click="toggleRecord"
      >
        <MicOutline />
      </button>
      <div class="field-wrap">
        <textarea
          ref="area"
          v-model="text"
          class="area"
          rows="1"
          placeholder=""
          enterkeyhint="send"
          @keydown="onKey"
          @input="onInput"
          @click="updateMention"
          @focus="panel = null"
          @blur="hideMentionSoon"
        />
      </div>
      <button class="cbtn" :class="{ active: panel }" aria-label="表情" @click="panel = panel ? null : 'emoji'">
        <HappyOutline />
      </button>
      <button class="cbtn" aria-label="更多" @click="moreOpen = true">
        <AddCircleOutline />
      </button>
      <button v-if="streaming" class="send send--stop" @click="$emit('stop')">
        <StopCircleOutline />
      </button>
      <button v-else class="send" :disabled="!text.trim()" @click="submit">发送</button>
    </div>

    <BottomSheet v-model="moreOpen" title="更多">
      <div class="more-grid">
        <button class="more-item" @click="imageInput?.click()">
          <span class="more-item__icon" style="background: #e8f2ff; color: #2b7fff"><ImagesOutline /></span>
          <span>图片</span>
        </button>
        <button class="more-item" @click="videoInput?.click()">
          <span class="more-item__icon" style="background: #ffeef0; color: #ff4d6a"><VideocamOutline /></span>
          <span>视频</span>
        </button>
        <button class="more-item" @click="fileInput?.click()">
          <span class="more-item__icon" style="background: #f3e9ff; color: #8b5cf6"><DocumentAttachOutline /></span>
          <span>文件</span>
        </button>
        <button class="more-item" @click="openCardForm">
          <span class="more-item__icon" style="background: #e6f7ff; color: #0891b2"><LinkOutline /></span>
          <span>卡片</span>
        </button>
        <button class="more-item" @click="startSpeech">
          <span class="more-item__icon" style="background: #eef2ff; color: #4f46e5"><MicOutline /></span>
          <span>语音转文字</span>
        </button>
        <button v-if="mentionNames?.length" class="more-item" @click="openMention">
          <span class="more-item__icon" style="background: #fff4e6; color: #f59e0b"><AtOutline /></span>
          <span>提到成员</span>
        </button>
        <button class="more-item" @click="moreOpen = false; emit('call')">
          <span class="more-item__icon" style="background: #e8f8ee; color: #22c55e"><CallOutline /></span>
          <span>语音通话</span>
        </button>
      </div>
      <div class="more-hint">双击对方头像可以拍一拍</div>
    </BottomSheet>

    <BottomSheet v-model="mentionOpen" title="提到成员">
      <button
        v-for="name in mentionNames"
        :key="name"
        class="cell"
        @click="pickMention(name)"
      >
        <span class="cell__body"><span class="cell__title">@{{ name }}</span></span>
      </button>
    </BottomSheet>

    <input ref="fileInput" type="file" hidden @change="onFile" />
    <input ref="imageInput" type="file" accept="image/*" hidden @change="onImage" />
    <input ref="videoInput" type="file" accept="video/*" hidden @change="onVideo" />

    <BottomSheet v-model="cardOpen" title="发送链接卡片">
      <label class="field">
        <span class="field__label">标题</span>
        <input v-model="card.title" class="input" maxlength="40" placeholder="例如：周末的展" />
      </label>
      <label class="field">
        <span class="field__label">链接</span>
        <input v-model="card.url" class="input" inputmode="url" placeholder="https://" />
      </label>
      <label class="field">
        <span class="field__label">描述（可选）</span>
        <textarea v-model="card.description" class="textarea" maxlength="120" placeholder="一句话说说这是什么" />
      </label>
      <template #footer>
        <button class="btn btn--ghost" @click="cardOpen = false">取消</button>
        <button class="btn" @click="submitCard">发送</button>
      </template>
    </BottomSheet>
  </div>
</template>

<style scoped>
.composer {
  flex: none;
  background: var(--bg-sheet);
  border-top: 0.5px solid var(--line);
  z-index: 10;
}
.recording {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 12px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 59, 48, 0.08);
}
.recording__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff3b30;
  animation: rec-blink 1s infinite;
}
@keyframes rec-blink {
  50% {
    opacity: 0.25;
  }
}
.recording__text {
  flex: 1;
  font-size: 12px;
  color: #d93025;
}
.recording__btn {
  font-size: 12px;
  color: var(--text-2);
  padding: 4px 8px;
  border-radius: 7px;
  background: var(--bg-hover);
}
.recording__btn--send {
  background: var(--brand);
  color: #fff;
}
.quote-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 12px 0;
  padding: 7px 10px;
  border-left: 3px solid var(--brand);
  border-radius: 8px;
  background: var(--bg);
}
.quote-bar__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.quote-bar__name {
  font-size: 10.5px;
  color: var(--brand);
}
.quote-bar__text {
  font-size: 11.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quote-bar__close {
  color: var(--text-3);
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
}
.quote-bar__close svg {
  width: 14px;
  height: 14px;
}
.mention-pop {
  display: flex;
  flex-direction: column;
  max-height: 170px;
  overflow-y: auto;
  padding: 4px 8px 6px;
  border-bottom: 0.5px solid var(--line);
  background: var(--bg-sheet);
}
.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13.5px;
  color: var(--text);
  text-align: left;
}
.mention-item:active {
  background: var(--bg-hover);
}
.mention-item svg {
  width: 16px;
  height: 16px;
  color: var(--brand);
  flex: none;
}
.panel {
  border-bottom: 0.5px solid var(--line);
}
.panel__tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 4px;
}
.panel__tab {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-2);
}
.panel__tab.on {
  background: rgba(0, 153, 255, 0.12);
  color: var(--brand);
}
.panel__manage {
  margin-left: auto;
  font-size: 12px;
  color: var(--brand);
  padding: 5px 6px;
}
.emoji-panel {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 6px 10px 10px;
  max-height: 208px;
  overflow-y: auto;
}
.emoji {
  height: 38px;
  font-size: 22px;
  border-radius: 8px;
  display: grid;
  place-items: center;
}
.emoji:active {
  background: var(--bg-hover);
}
.sticker-panel {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 6px 12px 12px;
  max-height: 224px;
  overflow-y: auto;
}
.sticker-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border-radius: 10px;
}
.sticker-cell:active {
  background: var(--bg-hover);
}
.sticker-cell img {
  width: 100%;
  height: 64px;
  object-fit: contain;
  border-radius: 8px;
}
.sticker-cell span {
  font-size: 9.5px;
  color: var(--text-3);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sticker-cell--add {
  min-height: 92px;
  justify-content: center;
  border: 1.5px dashed var(--line-2);
  color: var(--text-3);
  font-size: 10px;
}
.sticker-cell--add svg {
  width: 22px;
  height: 22px;
}
.sticker-empty {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  padding: 6px 0 2px;
}
.bar {
  display: flex;
  align-items: flex-end;
  gap: 7px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
}
.cbtn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: var(--text-2);
  flex: none;
  border-radius: 50%;
  margin-bottom: 3px;
  transition: color 0.15s, background 0.15s;
}
.cbtn:active {
  background: var(--bg-hover);
}
.cbtn.active {
  color: var(--brand);
  background: rgba(0, 153, 255, 0.1);
}
.cbtn.active[aria-label='录音'] {
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.1);
}
.cbtn svg {
  width: 24px;
  height: 24px;
}
.field-wrap {
  flex: 1;
  min-width: 0;
  background: var(--bg);
  border-radius: 10px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  min-height: 36px;
}
.area {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  line-height: 1.4;
  max-height: 96px;
  padding: 0;
  margin: 0;
}
.send {
  flex: none;
  height: 32px;
  min-width: 52px;
  padding: 0 12px;
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
}
.send:disabled {
  opacity: 0.4;
}
.send--stop {
  display: grid;
  place-items: center;
  min-width: 44px;
  background: var(--bg-hover);
  color: var(--text-2);
}
.send--stop svg {
  width: 20px;
  height: 20px;
}
.more-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 4px;
  padding: 8px 12px 20px;
}
.more-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--text-2);
}
.more-item__icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
}
.more-item__icon svg {
  width: 25px;
  height: 25px;
}
.more-hint {
  text-align: center;
  font-size: 10.5px;
  color: var(--text-3);
  padding: 0 0 14px;
}
.more-item em {
  font-style: normal;
  font-size: 9px;
  color: var(--text-3);
}
</style>
