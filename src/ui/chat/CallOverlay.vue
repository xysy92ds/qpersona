<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CallOutline, MicOutline, MicOffOutline, CloseOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useChatStore } from '@/store/chat'
import { useSettingsStore } from '@/store/settings'
import type { Character } from '@/core/types'
import { transcribeAudio, synthesizeSpeech } from '@/core/audio'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ character: Character; conversationId: string }>()
const emit = defineEmits<{ close: [] }>()

const chat = useChatStore()
const settings = useSettingsStore()

const status = ref<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
const seconds = ref(0)
const muted = ref(false)
const error = ref('')
const lastHeard = ref('')
const lastSaid = ref('')

const sttProfile = computed(() => (settings.bindings.stt ? settings.profileFor('stt') : null))
const ttsProfile = computed(() => (settings.bindings.tts ? settings.profileFor('tts') : null))
const statusText = computed(() => {
  if (status.value === 'listening') return '正在听…'
  if (status.value === 'thinking') return 'TA 在想…'
  if (status.value === 'speaking') return 'TA 在说…'
  return muted.value ? '已静音' : '按住下方按钮说话'
})
const clock = computed(() => {
  const m = Math.floor(seconds.value / 60)
  const s = seconds.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

let timer: number | null = null
let recorder: MediaRecorder | null = null
let recChunks: BlobPart[] = []
let recStream: MediaStream | null = null
let recognition: any = null
let resolveRecognition: ((text: string) => void) | null = null
let audioEl: HTMLAudioElement | null = null
let audioUrl: string | null = null

onMounted(() => {
  timer = window.setInterval(() => (seconds.value += 1), 1000)
})

function cleanupMic() {
  recStream?.getTracks().forEach((t) => t.stop())
  recStream = null
  recorder = null
  recChunks = []
}

function startBrowserRecognition(): boolean {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) return false
  const r = new SR()
  r.lang = 'zh-CN'
  r.interimResults = false
  r.continuous = false
  let text = ''
  r.onresult = (ev: any) => {
    for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript
  }
  r.onerror = (ev: any) => {
    if (ev?.error && ev.error !== 'aborted') error.value = `没听清：${ev.error}`
  }
  r.onend = () => {
    resolveRecognition?.(text.trim())
    resolveRecognition = null
  }
  r.start()
  recognition = r
  return true
}

function stopBrowserRecognition(): Promise<string> {
  return new Promise((resolve) => {
    if (!recognition) {
      resolve('')
      return
    }
    resolveRecognition = resolve
    try {
      recognition.stop()
    } catch {
      resolve('')
    }
  })
}

async function startTurn() {
  if (status.value !== 'idle' || muted.value) return
  error.value = ''
  try {
    if (sttProfile.value) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime =
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
          MediaRecorder.isTypeSupported(t),
        ) || ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recChunks = []
      mr.ondataavailable = (e) => {
        if (e.data.size) recChunks.push(e.data)
      }
      recStream = stream
      recorder = mr
      mr.start()
      status.value = 'listening'
      return
    }
    if (!startBrowserRecognition()) {
      error.value = '这个浏览器不支持语音识别，去 AI 设置里配置「语音识别」槽位'
      return
    }
    status.value = 'listening'
  } catch {
    error.value = '麦克风打不开，检查一下权限'
    status.value = 'idle'
  }
}

function stopRecorder(): Promise<Blob> {
  return new Promise((resolve) => {
    if (!recorder) {
      resolve(new Blob())
      return
    }
    const mr = recorder
    mr.onstop = () => resolve(new Blob(recChunks, { type: mr.mimeType || 'audio/webm' }))
    try {
      mr.stop()
    } catch {
      resolve(new Blob())
    }
  })
}

async function endTurn() {
  if (status.value !== 'listening') return
  status.value = 'thinking'
  let text = ''
  try {
    if (recorder) {
      const blob = await stopRecorder()
      cleanupMic()
      if (!blob.size) throw new Error('没有录到声音')
      if (!sttProfile.value) throw new Error('语音识别槽位没有配置')
      text = await transcribeAudio(sttProfile.value, blob)
    } else {
      text = await stopBrowserRecognition()
      recognition = null
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '没听清，再说一次'
    cleanupMic()
    status.value = 'idle'
    return
  }

  if (!text.trim()) {
    status.value = 'idle'
    return
  }
  lastHeard.value = text
  try {
    await chat.send(props.conversationId, text, undefined, { call: true })
    const msgs = chat.messagesOf(props.conversationId)
    const reply = [...msgs].reverse().find((m) => m.role === 'assistant' && m.text.trim())
    if (reply) {
      lastSaid.value = reply.text
      await speak(reply.text)
    }
  } catch {
    error.value = '回复失败了，检查一下模型配置'
  }
  status.value = 'idle'
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    audioEl = new Audio(url)
    audioEl.onended = () => resolve()
    audioEl.onerror = () => reject(new Error('音频播放失败'))
    audioEl.play().catch(reject)
  })
}

async function speak(text: string) {
  status.value = 'speaking'
  try {
    if (ttsProfile.value) {
      const blob = await synthesizeSpeech(ttsProfile.value, text)
      audioUrl = URL.createObjectURL(blob)
      await playUrl(audioUrl)
    } else if ('speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'zh-CN'
        u.rate = 1.03
        u.onend = () => resolve()
        u.onerror = () => resolve()
        speechSynthesis.speak(u)
      })
    }
  } catch {
    error.value = '语音播放失败，文字已经发在聊天里'
  } finally {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      audioUrl = null
    }
    status.value = 'idle'
  }
}

function toggleMute() {
  muted.value = !muted.value
  if (muted.value) {
    audioEl?.pause()
    speechSynthesis?.cancel()
    if (status.value === 'listening') {
      try {
        recorder?.stop()
      } catch {
        /* ignore */
      }
      recognition?.stop()
      cleanupMic()
      status.value = 'idle'
    }
  }
}

function hangup() {
  if (timer) window.clearInterval(timer)
  timer = null
  audioEl?.pause()
  speechSynthesis?.cancel()
  try {
    recorder?.stop()
  } catch {
    /* ignore */
  }
  recognition?.abort?.()
  cleanupMic()
  void chat.addTip(props.conversationId, `通话结束 · ${clock.value}`)
  emit('close')
}

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
  audioEl?.pause()
  speechSynthesis?.cancel()
  cleanupMic()
  recognition?.abort?.()
})
</script>

<template>
  <div class="call">
    <div class="call__glow" />
    <div class="call__top">
      <button class="call__close" aria-label="挂断" @click="hangup"><CloseOutline /></button>
      <Avatar :name="character.card.name" :src="character.ext.qq.avatar" :size="96" round />
      <div class="call__name">{{ character.card.name }}</div>
      <div class="call__status">{{ statusText }}</div>
      <div class="call__timer">{{ clock }}</div>

      <div class="call__lines">
        <div v-if="lastHeard" class="call__line">
          <span>你</span>
          <p>{{ lastHeard }}</p>
        </div>
        <div v-if="lastSaid" class="call__line call__line--ai">
          <span>{{ character.card.name }}</span>
          <p>{{ lastSaid }}</p>
        </div>
        <div v-if="!lastHeard && !lastSaid" class="call__hint">
          按住下面的按钮说话，松开后 TA 会接话。{{ sttProfile || ttsProfile ? '' : '当前用浏览器的识别与朗读。' }}
        </div>
      </div>
      <div v-if="error" class="call__error">{{ error }}</div>
    </div>

    <div class="call__controls">
      <button class="call__ctrl" :class="{ active: muted }" @click="toggleMute">
        <MicOffOutline v-if="muted" />
        <MicOutline v-else />
        <span>{{ muted ? '取消静音' : '静音' }}</span>
      </button>
      <button
        class="call__ptt"
        :class="{ active: status === 'listening', disabled: muted || status === 'thinking' || status === 'speaking' }"
        @pointerdown.prevent="startTurn"
        @pointerup.prevent="endTurn"
        @pointerleave="status === 'listening' && endTurn()"
        @contextmenu.prevent
      >
        <MicOutline />
        <span>{{ status === 'listening' ? '松开结束' : '按住说话' }}</span>
      </button>
      <button class="call__ctrl call__ctrl--hangup" @click="hangup">
        <CallOutline />
        <span>挂断</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.call {
  position: absolute;
  inset: 0;
  z-index: 95;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: calc(24px + env(safe-area-inset-top, 0px)) 22px calc(28px + env(safe-area-inset-bottom, 0px));
  color: #fff;
  background:
    radial-gradient(110% 70% at 50% 0%, rgba(62, 132, 255, 0.55), transparent 60%),
    linear-gradient(180deg, #14213d 0%, #0b1220 100%);
  overflow: hidden;
}
.call__glow {
  position: absolute;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  top: -160px;
  left: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(90, 160, 255, 0.3), transparent 65%);
  pointer-events: none;
}
.call__top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
}
.call__close {
  position: absolute;
  top: 0;
  right: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
}
.call__close svg {
  width: 18px;
  height: 18px;
}
.call__name {
  font-size: 22px;
  font-weight: 600;
  margin-top: 4px;
}
.call__status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}
.call__timer {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.call__lines {
  width: 100%;
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
}
.call__line {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  line-height: 1.6;
}
.call__line span {
  flex: none;
  color: rgba(255, 255, 255, 0.5);
  min-width: 44px;
}
.call__line p {
  margin: 0;
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 7px 10px;
}
.call__line--ai p {
  background: rgba(80, 150, 255, 0.2);
}
.call__hint {
  text-align: center;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.7;
  padding: 30px 10px;
}
.call__error {
  margin-top: 8px;
  font-size: 11.5px;
  color: #ffb4a8;
  text-align: center;
}
.call__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  position: relative;
}
.call__ctrl {
  width: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.7);
}
.call__ctrl svg {
  width: 24px;
  height: 24px;
}
.call__ctrl.active {
  color: #ffd166;
}
.call__ctrl--hangup {
  color: #ff6b6b;
}
.call__ptt {
  flex: 1;
  height: 82px;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 12.5px;
  transition: background 0.15s, transform 0.1s;
}
.call__ptt svg {
  width: 26px;
  height: 26px;
}
.call__ptt.active {
  background: rgba(90, 160, 255, 0.55);
  transform: scale(0.99);
}
.call__ptt.disabled {
  opacity: 0.45;
}
</style>
