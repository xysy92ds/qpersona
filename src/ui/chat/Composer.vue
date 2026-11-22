<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import {
  AddCircleOutline,
  HappyOutline,
  MicOutline,
  StopCircleOutline,
} from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ disabled?: boolean; streaming?: boolean }>()
const emit = defineEmits<{ send: [string]; stop: []; poke: [] }>()

const text = ref('')
const area = ref<HTMLTextAreaElement>()
const emojiOpen = ref(false)
const moreOpen = ref(false)
const listening = ref(false)

let rec: any = null

const EMOJIS = [
  '😀', '😄', '😁', '😆', '🥹', '😊', '🙂', '😉',
  '😍', '🥰', '😘', '😜', '🤪', '😎', '🤔', '😴',
  '😭', '😤', '😡', '🥺', '😳', '🙄', '😏', '🤗',
  '🤭', '🫠', '😵‍💫', '🤯', '🥳', '😇', '🤡', '👻',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '❤️', '💔',
  '🔥', '✨', '🎉', '🌙', '☕', '🍜', '🐱', '🌧️',
]

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
  emojiOpen.value = false
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
    <div v-if="emojiOpen" class="emoji-panel">
      <button v-for="e in EMOJIS" :key="e" class="emoji" @click="pickEmoji(e)">{{ e }}</button>
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
          @focus="emojiOpen = false"
        />
      </div>
      <button class="cbtn" :class="{ active: emojiOpen }" aria-label="表情" @click="emojiOpen = !emojiOpen">
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
        <button
          class="more-item"
          @click="moreOpen = false; showToast('图片消息 · 下一步就做')"
        >
          <span class="more-item__icon" style="background: #0ea5e9">🖼️</span>
          <span>图片</span>
          <em>即将推出</em>
        </button>
        <button class="more-item" @click="moreOpen = false; showToast('文件消息 · 下一步就做')">
          <span class="more-item__icon" style="background: #8b5cf6">📎</span>
          <span>文件</span>
          <em>即将推出</em>
        </button>
        <button class="more-item" @click="moreOpen = false; showToast('语音通话 · Phase 4')">
          <span class="more-item__icon" style="background: #22c55e">📞</span>
          <span>语音通话</span>
          <em>即将推出</em>
        </button>
      </div>
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
.emoji-panel {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 10px 10px 6px;
  max-height: 208px;
  overflow-y: auto;
  border-bottom: 0.5px solid var(--line);
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
