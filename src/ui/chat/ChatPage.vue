<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  CallOutline,
  ChevronBack,
  EllipsisHorizontal,
  VolumeHighOutline,
  VolumeMuteOutline,
} from '@vicons/ionicons5'
import MessageItem from './MessageItem.vue'
import Composer from './Composer.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'
import { useChatStore } from '@/store/chat'
import { useSettingsStore } from '@/store/settings'
import { avatarSvg, characterAvatar } from '@/core/avatar'
import { chatTime } from '@/core/util'
import { showToast } from '@/ui/common/toast'
import { useUiStore } from '@/store/ui'
import { ping } from '@/core/audio'
import type {
  CardPayload,
  FilePayload,
  ImagePayload,
  Message,
  QuotePayload,
  Sticker,
  VideoPayload,
  VoicePayload,
} from '@/core/types'

const props = defineProps<{ id: string }>()
const router = useRouter()
const contacts = useContactsStore()
const chat = useChatStore()
const settings = useSettingsStore()
const ui = useUiStore()

const conv = computed(() => contacts.conversationById(props.id))
const msgs = computed(() => chat.messagesOf(props.id))
const streaming = computed(() => chat.isStreaming(props.id))
const isSingle = computed(() => conv.value?.kind === 'single')
const ch = computed(() => contacts.characterById(conv.value?.characterId))

const title = computed(() => conv.value?.title || '聊天')
const subtitle = computed(() => {
  if (streaming.value) return '正在输入…'
  if (conv.value?.profile === 'tavern') return '酒馆叙事'
  return conv.value?.kind === 'group' ? '群聊' : '在线'
})
const userAvatar = computed(() => settings.user.avatar || avatarSvg(settings.user.nickname))
const chatBgStyle = computed(() => {
  const bg = settings.appearance.chatBackground
  if (!bg) return undefined
  const overlay = settings.isDark ? 'rgba(10, 12, 16, 0.7)' : 'rgba(245, 247, 250, 0.52)'
  return {
    backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})
const charAvatar = computed(() => characterAvatar(ch.value))

type Item = { key: string; type: 'time'; text: string } | { key: string; type: 'msg'; msg: Message }

const items = computed<Item[]>(() => {
  const out: Item[] = []
  let lastTs = 0
  for (const m of msgs.value) {
    if (settings.chat.showTime && (!lastTs || m.ts - lastTs > 5 * 60 * 1000)) {
      out.push({ key: 't' + m.id, type: 'time', text: chatTime(m.ts) })
    }
    out.push({ key: m.id, type: 'msg', msg: m })
    lastTs = m.ts
  }
  return out
})

const listEl = ref<HTMLElement>()
const stick = ref(true)
const sheet = ref(false)
const msgMenu = ref(false)
const activeMsg = ref<Message | null>(null)
const quoting = ref<QuotePayload | null>(null)
const previewUrl = ref('')
const membersOpen = ref(false)

const members = computed(() =>
  (conv.value?.memberIds ?? [])
    .map((id) => contacts.characterById(id))
    .filter((m): m is NonNullable<typeof m> => !!m),
)

const mentionNames = computed(() =>
  conv.value?.kind === 'group'
    ? members.value.map((m) => m.ext.qq.nickname || m.card.name)
    : [],
)
const msgConfirm = ref(false)
let armed = false
const spoken = new Set<string>()

function onScroll() {
  const el = listEl.value
  if (!el) return
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120
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
    return last ? `${last.id}:${last.text.length}:${last.status}` : ''
  },
  async () => {
    await nextTick()
    scrollBottom()
  },
)

async function enter() {
  if (!conv.value) return
  armed = false
  await chat.syncFromDb(props.id)
  await contacts.markRead(props.id)
  await nextTick()
  scrollBottom(true)
  window.setTimeout(() => (armed = true), 350)
}

let deliveryTimer: number | null = null

let syncTimer: number | null = null

function onDmEvent(e: Event) {
  const detail = (e as CustomEvent<{ conversationIds?: string[] }>).detail
  if (detail?.conversationIds && !detail.conversationIds.includes(props.id)) return
  void chat.syncFromDb(props.id)
}

onMounted(() => {
  void enter()
  void chat.checkDelivery(props.id)
  deliveryTimer = window.setInterval(() => void chat.checkDelivery(props.id), 15_000)
  syncTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void chat.syncFromDb(props.id)
  }, 5_000)
  window.addEventListener('jianyie:dm', onDmEvent)
})
watch(
  () => props.id,
  () => {
    sheet.value = false
    void enter()
    void chat.checkDelivery(props.id)
  },
)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}

async function send(text: string) {
  stick.value = true
  const q = quoting.value
  quoting.value = null
  await chat.send(props.id, text, q ?? undefined)
}

async function sendSticker(sticker: Sticker) {
  stick.value = true
  await chat.sendSticker(props.id, sticker)
}

async function sendFile(file: FilePayload) {
  stick.value = true
  await chat.sendFile(props.id, file)
}

async function sendCard(card: CardPayload) {
  stick.value = true
  await chat.sendCard(props.id, card)
}

async function sendImage(image: ImagePayload) {
  stick.value = true
  await chat.sendImage(props.id, image)
}

async function sendVideo(video: VideoPayload) {
  stick.value = true
  await chat.sendVideo(props.id, video)
}

async function sendVoice(voice: VoicePayload) {
  stick.value = true
  await chat.sendVoice(props.id, voice)
}

function quoteMessage() {
  const m = activeMsg.value
  if (!m) return
  quoting.value = {
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    name: m.role === 'assistant' ? ch.value?.ext.qq.nickname || title.value : settings.user.nickname,
    text: m.text || (m.kind === 'sticker' ? `[表情包] ${m.sticker?.name}` : m.kind === 'file' ? `[文件] ${m.file?.name}` : ''),
  }
  msgMenu.value = false
  nextTick(() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus())
}

async function switchProfile(target: 'qq' | 'tavern') {
  if (!ch.value) return
  const c = await contacts.ensureConversation(ch.value.id, target)
  sheet.value = false
  router.push(`/chat/${c.id}`)
}

function openCallFromMenu() {
  const c = conv.value
  if (!ch.value || !c || c.kind !== 'single') {
    showToast('群语音 · 后面做')
    return
  }
  ui.openCall(c.id)
}

async function toggleProactiveMute() {
  if (!conv.value) return
  await contacts.touch(conv.value.id, { proactiveMuted: !conv.value.proactiveMuted })
  showToast(conv.value.proactiveMuted ? '已允许这个会话的主动消息' : '已关闭这个会话的主动消息')
}

async function clearChat() {
  sheet.value = false
  await chat.clear(props.id)
  showToast('聊天记录已清空')
}

async function regenerate() {
  sheet.value = false
  await chat.regenerate(props.id)
}

/* ---- 语音朗读 ---- */
function speak(text: string) {
  if (!('speechSynthesis' in window)) {
    showToast('这个浏览器不支持朗读')
    return
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/[*#`_~]/g, ''))
  u.lang = 'zh-CN'
  u.rate = 1.03
  u.pitch = 1.04
  speechSynthesis.speak(u)
}

async function toggleTts() {
  const on = !settings.flags.tts
  await settings.setFlag('tts', on)
  if (!on) speechSynthesis?.cancel()
  showToast(on ? '新回复会自动朗读' : '已关闭语音朗读')
}

watch(
  () => {
    const m = msgs.value[msgs.value.length - 1]
    return m ? `${m.id}:${m.status}:${m.text.length}` : ''
  },
  () => {
    const m = msgs.value[msgs.value.length - 1]
    if (!armed || !m || !settings.flags.tts) return
    if (m.role !== 'assistant' || m.status !== 'ok' || !m.text.trim()) return
    if (spoken.has(m.id)) return
    spoken.add(m.id)
    if (settings.flags.notify && settings.flags.sound) ping()
    speak(m.text)
  },
)

onUnmounted(() => {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  if (deliveryTimer) window.clearInterval(deliveryTimer)
  if (syncTimer) window.clearInterval(syncTimer)
  window.removeEventListener('jianyie:dm', onDmEvent)
})

/* ---- 消息长按 ---- */
function openMsgMenu(m: Message) {
  activeMsg.value = m
  msgConfirm.value = false
  msgMenu.value = true
}

function copyMsg() {
  const t = activeMsg.value?.text || ''
  navigator.clipboard
    ?.writeText(t)
    .then(() => showToast('已复制'))
    .catch(() => showToast('复制失败'))
  msgMenu.value = false
}

function readMsg() {
  if (activeMsg.value?.text) speak(activeMsg.value.text)
  msgMenu.value = false
}

async function removeMsg() {
  if (!activeMsg.value) return
  if (!msgConfirm.value) {
    msgConfirm.value = true
    return
  }
  await chat.deleteMessage(props.id, activeMsg.value.id)
  msgMenu.value = false
  showToast('已删除')
}

async function poke() {
  if (!conv.value) return
  await chat.addTip(props.id, `你拍了拍「${title.value}」`)
}

async function pokeBy(name: string) {
  await chat.addTip(props.id, `你拍了拍「${name}」`)
}
</script>

<template>
  <div v-if="conv" class="chat">
    <header class="topbar chat-head">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div
        class="chat-head__title"
        @click="ch ? router.push(`/character/${ch.id}`) : (membersOpen = true)"
      >
        <div class="topbar__title">{{ title }}</div>
        <div class="topbar__sub">{{ subtitle }}</div>
      </div>
      <button
        v-if="ch && conv.kind === 'single' && !ch.ext.human"
        class="iconbtn"
        aria-label="语音通话"
        @click="ui.openCall(conv.id)"
      >
        <CallOutline />
      </button>
      <button
        v-else-if="conv.kind === 'group'"
        class="iconbtn"
        aria-label="语音通话"
        @click="showToast('群语音 · 后面做')"
      >
        <CallOutline />
      </button>
      <button
        class="iconbtn"
        :style="settings.flags.tts ? 'color: var(--brand)' : ''"
        aria-label="语音朗读"
        @click="toggleTts"
      >
        <VolumeHighOutline v-if="settings.flags.tts" />
        <VolumeMuteOutline v-else />
      </button>
      <button class="iconbtn" aria-label="更多" @click="sheet = true"><EllipsisHorizontal /></button>
    </header>

    <div
      ref="listEl"
      class="chat-list"
      :class="{ 'is-tavern': conv.profile === 'tavern' }"
      :style="chatBgStyle"
      @scroll.passive="onScroll"
    >
      <div v-if="!msgs.length" class="chat-empty">发条消息，开始聊天吧。</div>
      <template v-for="item in items" :key="item.key">
        <div v-if="item.type === 'time'" class="time-tip">{{ item.text }}</div>
        <MessageItem
          v-else
          :message="item.msg"
          :show-name="!isSingle"
          :character-name="contacts.characterById(item.msg.characterId)?.card.name || title"
          :character-avatar="
            item.msg.characterId
              ? characterAvatar(contacts.characterById(item.msg.characterId))
              : charAvatar
          "
          :user-name="settings.user.nickname"
          :user-avatar="userAvatar"
          :show-usage="settings.chat.showUsage"
          @longpress="openMsgMenu"
          @poke="pokeBy"
          @preview="previewUrl = $event"
        />
      </template>
      <div class="chat-list__pad" />
    </div>

    <Composer
      :streaming="streaming"
      :quote="quoting"
      :mention-names="mentionNames"
      @send="send"
      @stop="chat.stop(props.id)"
      @poke="poke"
      @sticker="sendSticker"
      @file="sendFile"
      @card="sendCard"
      @image="sendImage"
      @video="sendVideo"
      @voice="sendVoice"
      @call="openCallFromMenu"
      @close-quote="quoting = null"
    />

    <Transition name="fade">
      <div v-if="previewUrl" class="img-viewer" @click="previewUrl = ''">
        <img :src="previewUrl" alt="预览" />
      </div>
    </Transition>

    <BottomSheet v-model="membersOpen" :title="`群成员 · ${members.length}`">
      <button
        v-for="m in members"
        :key="m.id"
        class="cell"
        @click="membersOpen = false; router.push(`/character/${m.id}`)"
      >
        <Avatar :name="m.card.name" :src="m.ext.qq.avatar" :size="40" />
        <span class="cell__body">
          <span class="cell__title">{{ m.ext.qq.nickname || m.card.name }}</span>
          <span class="cell__desc">
            {{ conv.groupMuted?.[m.id] ? '已免打扰' : m.ext.qq.signature || m.card.tags?.join(' · ') || '群成员' }}
          </span>
        </span>
      </button>
    </BottomSheet>

    <BottomSheet v-model="msgMenu" title="消息">
      <button class="cell" @click="quoteMessage">
        <span class="cell__body">
          <span class="cell__title">引用</span>
          <span class="cell__desc">回消息时带上这一段</span>
        </span>
      </button>
      <button class="cell" @click="copyMsg">
        <span class="cell__body"><span class="cell__title">复制</span></span>
      </button>
      <button class="cell" @click="readMsg">
        <span class="cell__body"><span class="cell__title">朗读这条</span></span>
      </button>
      <button class="cell" @click="msgMenu = false; regenerate()">
        <span class="cell__body">
          <span class="cell__title">重新生成</span>
          <span class="cell__desc">把最后一条回复重写一遍</span>
        </span>
      </button>
      <button class="cell" @click="removeMsg">
        <span class="cell__body">
          <span class="cell__title" style="color: var(--danger)">
            {{ msgConfirm ? '再点一次，确认删除' : '删除' }}
          </span>
        </span>
      </button>
    </BottomSheet>

    <BottomSheet v-model="sheet" title="聊天设置">
      <button v-if="conv.kind === 'group'" class="cell" @click="sheet = false; membersOpen = true">
        <span class="cell__body">
          <span class="cell__title">群成员（{{ members.length }}）</span>
          <span class="cell__desc">看看这个群里都有谁</span>
        </span>
      </button>
      <button
        v-if="conv.kind === 'group'"
        class="cell"
        @click="sheet = false; router.push(`/group/${conv.id}/info`)"
      >
        <span class="cell__body">
          <span class="cell__title">群聊设置</span>
          <span class="cell__desc">改群名、群头像、成员和唤醒时长</span>
        </span>
      </button>
      <button class="cell" @click="regenerate">
        <span class="cell__body">
          <span class="cell__title">重新生成</span>
          <span class="cell__desc">把最后一条回复重写一遍</span>
        </span>
      </button>
      <button
        v-if="ch && conv.kind === 'single'"
        class="cell"
        @click="switchProfile(conv.profile === 'qq' ? 'tavern' : 'qq')"
      >
        <span class="cell__body">
          <span class="cell__title">{{ conv.profile === 'qq' ? '切到酒馆里继续' : '切回 聊天' }}</span>
          <span class="cell__desc">
            {{ conv.profile === 'qq' ? '同一角色、同一份设定，换一套叙事提示词' : '短消息风格的对话' }}
          </span>
        </span>
      </button>
      <button
        v-if="ch && conv.kind === 'single'"
        class="cell"
        @click="sheet = false; router.push(`/character/${ch.id}`)"
      >
        <span class="cell__body">
          <span class="cell__title">角色资料</span>
          <span class="cell__desc">查看设定、开关和提示词</span>
        </span>
      </button>
      <button v-if="ch && conv.kind === 'single'" class="cell" @click="toggleProactiveMute">
        <span class="cell__body">
          <span class="cell__title">允许主动消息</span>
          <span class="cell__desc">全局开关打开时，这个会话是否允许 TA 主动找你</span>
        </span>
        <span class="switch" :class="{ on: !conv.proactiveMuted }" />
      </button>
      <button class="cell" @click="clearChat">
        <span class="cell__body">
          <span class="cell__title" style="color: var(--danger)">清空聊天记录</span>
          <span class="cell__desc">只删除这一端的记录，不影响角色卡</span>
        </span>
      </button>
    </BottomSheet>
  </div>

  <div v-else class="notfound">
    <p>这个会话不存在，可能已经被删掉了。</p>
    <button class="btn" @click="router.replace('/')">回到消息</button>
  </div>
</template>

<style scoped>
.chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-chat);
}
.chat-head {
  min-height: 50px;
  padding: 0 6px 0 2px;
}
.chat-head__title {
  flex: 1;
  min-width: 0;
  padding: 0 4px;
  text-align: center;
}
.chat-list {
  --qq-avatar_size_2: 38px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 8px 0;
  background: var(--bg-chat);
  overscroll-behavior: contain;
}
.chat-list.is-tavern {
  background: color-mix(in srgb, var(--bg-chat) 90%, #ffd8a8);
}
.time-tip {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  margin: 12px 0 2px;
}
.chat-empty {
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
  padding: 40px 0;
}
.chat-list__pad {
  height: 10px;
}
.chat {
  position: relative;
}
.img-viewer {
  position: absolute;
  inset: 0;
  z-index: 80;
  background: rgba(5, 8, 12, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.img-viewer img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
}
.notfound {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-2);
  font-size: 14px;
}
</style>
