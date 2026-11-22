<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronBack, EllipsisHorizontal } from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { useChatStore } from '@/store/chat'
import type { Message } from '@/core/types'
import { chatTime } from '@/core/util'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ id: string }>()
const router = useRouter()
const contacts = useContactsStore()
const chat = useChatStore()

const conv = computed(() => contacts.conversationById(props.id))
const ch = computed(() => contacts.characterById(conv.value?.characterId))
const msgs = computed(() => chat.messagesOf(props.id))
const streaming = computed(() => chat.isStreaming(props.id))
const title = computed(() => ch.value?.card.name || conv.value?.title || '酒馆')

const listEl = ref<HTMLElement>()
const input = ref<HTMLTextAreaElement>()
const text = ref('')
const stick = ref(true)
const sheet = ref(false)

const turns = computed(() => {
  const out: { m: Message; time: string; showTime: boolean }[] = []
  let lastTs = 0
  for (const m of msgs.value) {
    out.push({ m, time: chatTime(m.ts), showTime: !lastTs || m.ts - lastTs > 8 * 60 * 1000 })
    lastTs = m.ts
  }
  return out
})

function onScroll() {
  const el = listEl.value
  if (!el) return
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 140
}

function scrollBottom(force = false) {
  const el = listEl.value
  if (!el) return
  if (!force && !stick.value) return
  el.scrollTop = el.scrollHeight
}

watch(
  () => msgs.value.length,
  async () => {
    await nextTick()
    scrollBottom()
  },
)
watch(
  () => {
    const last = msgs.value[msgs.value.length - 1]
    return last ? `${last.id}:${last.text.length}` : ''
  },
  async () => {
    await nextTick()
    scrollBottom()
  },
)

async function enter() {
  await chat.load(props.id)
  await contacts.markRead(props.id)
  await nextTick()
  scrollBottom(true)
}

onMounted(enter)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/tavern')
}

async function send() {
  const v = text.value.trim()
  if (!v || streaming.value) return
  text.value = ''
  stick.value = true
  nextTick(resize)
  await chat.send(props.id, v)
}

function resize() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(110, el.scrollHeight) + 'px'
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void send()
  }
}

async function switchToQq() {
  if (!ch.value) return
  const c = await contacts.ensureConversation(ch.value.id, 'qq')
  sheet.value = false
  router.push(`/chat/${c.id}`)
}

async function clearStory() {
  await chat.clear(props.id)
  sheet.value = false
  showToast('这一页已经翻过去了')
}

onUnmounted(() => {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
})
</script>

<template>
  <div v-if="conv" class="tavern-chat">
    <header class="tc-head">
      <button class="tc-icon" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="tc-title">
        <div class="tc-name">{{ title }}</div>
        <div class="tc-sub">{{ streaming ? '正在落笔…' : '酒馆叙事' }}</div>
      </div>
      <button class="tc-icon" aria-label="更多" @click="sheet = true"><EllipsisHorizontal /></button>
    </header>

    <div ref="listEl" class="tc-body" @scroll.passive="onScroll">
      <div class="tc-lamp" />
      <div v-if="!msgs.length" class="tc-empty">烛火刚点起，故事还没开始。</div>

      <template v-for="t in turns" :key="t.m.id">
        <div v-if="t.showTime" class="tc-time"><span>{{ t.time }}</span></div>

        <div v-if="t.m.kind === 'tip'" class="tc-tip">{{ t.m.text }}</div>

        <div v-else-if="t.m.role === 'user'" class="tc-user">
          <div class="tc-user__label">你</div>
          <p>{{ t.m.text }}</p>
        </div>

        <article v-else class="tc-turn">
          <div class="tc-who">{{ ch?.card.name || title }}</div>
          <p class="tc-prose" :class="{ 'is-typing': t.m.status === 'streaming' }">
            {{ t.m.text }}<span v-if="t.m.status === 'streaming'" class="tc-caret" />
          </p>
        </article>
      </template>

      <div v-if="msgs.length" class="tc-end">· 本章未完 ·</div>
    </div>

    <div class="tc-composer">
      <textarea
        ref="input"
        v-model="text"
        class="tc-input"
        rows="1"
        placeholder="继续写下去…"
        @keydown="onKey"
        @input="resize"
      />
      <button class="tc-send" :disabled="!text.trim() || streaming" @click="send">
        {{ streaming ? '…' : '送出' }}
      </button>
    </div>

    <BottomSheet v-model="sheet" title="叙事选项">
      <button class="tc-option" @click="switchToQq">
        <span class="tc-option__title">回到 QQ 里聊</span>
        <span class="tc-option__desc">同一份记忆，换回短消息语法</span>
      </button>
      <button
        class="tc-option"
        @click="sheet = false; ch && router.push(`/character/${ch.id}`)"
      >
        <span class="tc-option__title">角色设定</span>
        <span class="tc-option__desc">看看注入的提示词与设定</span>
      </button>
      <button class="tc-option" @click="clearStory">
        <span class="tc-option__title" style="color: #e08a6a">翻过这一页</span>
        <span class="tc-option__desc">清空酒馆端的聊天记录</span>
      </button>
    </BottomSheet>
  </div>

  <div v-else class="tc-missing">
    <p>这个故事还没有开场。</p>
    <button class="btn" @click="router.replace('/tavern')">回到酒馆</button>
  </div>
</template>

<style scoped>
.tavern-chat {
  --tc-bg: #17110c;
  --tc-bg-2: #211710;
  --tc-text: #e9dcc9;
  --tc-dim: #a08c74;
  --tc-gold: #e0b072;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(120% 70% at 50% -10%, rgba(255, 170, 92, 0.16), transparent 60%),
    linear-gradient(180deg, var(--tc-bg-2), var(--tc-bg) 55%);
  color: var(--tc-text);
}
.tc-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  background: rgba(18, 12, 8, 0.72);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(224, 176, 114, 0.12);
  z-index: 5;
}
.tc-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: var(--tc-dim);
  border-radius: 50%;
}
.tc-icon svg {
  width: 22px;
  height: 22px;
}
.tc-icon:active {
  background: rgba(255, 255, 255, 0.06);
}
.tc-title {
  flex: 1;
  text-align: center;
  min-width: 0;
}
.tc-name {
  font-family: 'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', serif;
  font-size: 17px;
  letter-spacing: 2px;
  color: var(--tc-gold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tc-sub {
  font-size: 10px;
  letter-spacing: 1.5px;
  color: rgba(224, 176, 114, 0.5);
  margin-top: 1px;
}
.tc-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 22px 10px;
  position: relative;
  overscroll-behavior: contain;
}
.tc-lamp {
  position: absolute;
  top: -80px;
  left: 50%;
  width: 320px;
  height: 220px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse, rgba(255, 178, 102, 0.14), transparent 70%);
  pointer-events: none;
}
.tc-time {
  text-align: center;
  margin: 20px 0 14px;
  color: rgba(160, 140, 116, 0.55);
  font-size: 10px;
  letter-spacing: 1px;
}
.tc-time span::before,
.tc-time span::after {
  content: '';
  display: inline-block;
  width: 18px;
  height: 1px;
  background: rgba(160, 140, 116, 0.25);
  vertical-align: middle;
  margin: 0 8px;
}
.tc-turn {
  margin: 0 0 24px;
}
.tc-who {
  font-size: 10.5px;
  letter-spacing: 2px;
  color: var(--tc-gold);
  margin-bottom: 7px;
  opacity: 0.85;
}
.tc-who::before {
  content: '◆';
  font-size: 7px;
  margin-right: 6px;
  vertical-align: 2px;
}
.tc-prose {
  margin: 0;
  font-family: 'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', serif;
  font-size: 15.5px;
  line-height: 2.0;
  letter-spacing: 0.3px;
  color: var(--tc-text);
  white-space: pre-wrap;
  text-align: justify;
}
.tc-caret {
  display: inline-block;
  width: 2px;
  height: 15px;
  margin-left: 3px;
  background: var(--tc-gold);
  vertical-align: -2px;
  animation: tc-blink 1s steps(2) infinite;
}
@keyframes tc-blink {
  50% {
    opacity: 0;
  }
}
.tc-user {
  margin: 0 0 24px auto;
  max-width: 88%;
  padding: 2px 14px 2px 0;
  border-right: 1.5px solid rgba(224, 176, 114, 0.42);
  text-align: right;
}
.tc-user__label {
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(224, 176, 114, 0.6);
  margin-bottom: 4px;
}
.tc-user p {
  margin: 0;
  font-family: 'Songti SC', 'Noto Serif SC', serif;
  font-size: 14.5px;
  line-height: 1.9;
  color: #cbb8a2;
  font-style: italic;
  white-space: pre-wrap;
}
.tc-tip {
  text-align: center;
  font-size: 10.5px;
  color: rgba(160, 140, 116, 0.6);
  margin: 4px 0 18px;
  letter-spacing: 1px;
}
.tc-end {
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 4px;
  color: rgba(224, 176, 114, 0.35);
  padding: 10px 0 18px;
}
.tc-empty {
  text-align: center;
  color: rgba(160, 140, 116, 0.7);
  font-size: 12px;
  padding: 60px 0;
  letter-spacing: 1px;
}
.tc-composer {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
  background: rgba(18, 12, 8, 0.9);
  border-top: 1px solid rgba(224, 176, 114, 0.14);
}
.tc-input {
  flex: 1;
  min-width: 0;
  max-height: 110px;
  resize: none;
  border: none;
  outline: none;
  background: rgba(255, 255, 255, 0.045);
  border-radius: 10px;
  padding: 9px 12px;
  color: var(--tc-text);
  font-family: 'Songti SC', 'Noto Serif SC', serif;
  font-size: 14.5px;
  line-height: 1.7;
}
.tc-input::placeholder {
  color: rgba(160, 140, 116, 0.6);
}
.tc-send {
  flex: none;
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, #d7a05f, #b9793c);
  color: #241708;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
}
.tc-send:disabled {
  opacity: 0.45;
}
.tc-option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  text-align: left;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-sheet);
}
.tc-option:last-child {
  border-bottom: none;
}
.tc-option__title {
  font-size: 15px;
  color: var(--text);
}
.tc-option__desc {
  font-size: 12px;
  color: var(--text-3);
}
.tc-missing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-2);
}
</style>
