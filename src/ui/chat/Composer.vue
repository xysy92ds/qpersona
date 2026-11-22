<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  AddCircleOutline,
  AddOutline,
  CloseOutline,
  HappyOutline,
  MicOutline,
  StopCircleOutline,
} from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { showToast } from '@/ui/common/toast'
import { useStickersStore } from '@/store/stickers'
import type { CardPayload, FilePayload, QuotePayload, Sticker } from '@/core/types'

const props = defineProps<{ disabled?: boolean; streaming?: boolean; quote?: QuotePayload | null }>()
const emit = defineEmits<{
  send: [string]
  stop: []
  poke: []
  sticker: [Sticker]
  file: [FilePayload]
  card: [CardPayload]
  closeQuote: []
}>()

const router = useRouter()
const stickers = useStickersStore()

const text = ref('')
const area = ref<HTMLTextAreaElement>()
const panel = ref<'emoji' | 'sticker' | null>(null)
const moreOpen = ref(false)
const cardOpen = ref(false)
const listening = ref(false)
const card = ref({ title: '', url: '', description: '' })
const fileInput = ref<HTMLInputElement>()

let rec: any = null

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
    e.preventDefault()
    submit()
  }
}

function pickEmoji(e: string) {
  const el = area.value
  const start = el?.selectionStart ?? text.value.length
  const end = el?.selectionEnd ?? text.value.length
  text.value = text.value.slice(0, start) + e + text.value.slice(end)
  nextTick(() => {
    el?.focus()
    el?.setSelectionRange(start + e.length, start + e.length)
    resize()
  })
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

/** 语音输入：用浏览器自带的识别能力，没有就直说 */
function toggleVoice() {
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

onUnmounted(() => {
  try {
    rec?.stop()
  } catch {
    /* ignore */
  }
})

watch(text, () => nextTick(resize))
</script>

<template>
  <div class="composer">
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

    <div class="bar">
      <button class="cbtn" :class="{ active: listening }" aria-label="语音输入" @click="toggleVoice">
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
          @input="resize"
          @focus="panel = null"
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
        <button class="more-item" @click="moreOpen = false; emit('poke')">
          <span class="more-item__icon" style="background: #f59e0b">👋</span>
          <span>拍一拍</span>
        </button>
        <button class="more-item" @click="fileInput?.click()">
          <span class="more-item__icon" style="background: #8b5cf6">📎</span>
          <span>文件</span>
        </button>
        <button class="more-item" @click="openCardForm">
          <span class="more-item__icon" style="background: #0ea5e9">📇</span>
          <span>卡片</span>
        </button>
        <button class="more-item" @click="moreOpen = false; showToast('图片消息 · 下次做')">
          <span class="more-item__icon" style="background: #e11d48">🖼️</span>
          <span>图片</span>
          <em>即将推出</em>
        </button>
        <button class="more-item" @click="moreOpen = false; showToast('语音通话 · Phase 4')">
          <span class="more-item__icon" style="background: #22c55e">📞</span>
          <span>语音通话</span>
          <em>即将推出</em>
        </button>
      </div>
    </BottomSheet>

    <input ref="fileInput" type="file" hidden @change="onFile" />

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
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 24px;
}
.more-item em {
  font-style: normal;
  font-size: 9px;
  color: var(--text-3);
}
</style>
