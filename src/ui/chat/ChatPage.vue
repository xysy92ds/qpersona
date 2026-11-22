<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CallOutline, ChevronBack, EllipsisHorizontal } from '@vicons/ionicons5'
import MessageItem from './MessageItem.vue'
import Composer from './Composer.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { useChatStore } from '@/store/chat'
import { useSettingsStore } from '@/store/settings'
import { avatarSvg, characterAvatar } from '@/core/avatar'
import { chatTime } from '@/core/util'
import { showToast } from '@/ui/common/toast'
import type { Message } from '@/core/types'

const props = defineProps<{ id: string }>()
const router = useRouter()
const contacts = useContactsStore()
const chat = useChatStore()
const settings = useSettingsStore()

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
const charAvatar = computed(() => characterAvatar(ch.value))

type Item = { key: string; type: 'time'; text: string } | { key: string; type: 'msg'; msg: Message }

const items = computed<Item[]>(() => {
  const out: Item[] = []
  let lastTs = 0
  for (const m of msgs.value) {
    if (!lastTs || m.ts - lastTs > 5 * 60 * 1000) {
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
  await chat.load(props.id)
  await contacts.markRead(props.id)
  await nextTick()
  scrollBottom(true)
}

onMounted(enter)
watch(
  () => props.id,
  () => {
    sheet.value = false
    void enter()
  },
)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}

async function send(text: string) {
  stick.value = true
  await chat.send(props.id, text)
}

async function switchProfile(target: 'qq' | 'tavern') {
  if (!ch.value) return
  const c = await contacts.ensureConversation(ch.value.id, target)
  sheet.value = false
  router.push(`/chat/${c.id}`)
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
</script>

<template>
  <div v-if="conv" class="chat">
    <header class="topbar chat-head">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="chat-head__title" @click="ch && router.push(`/character/${ch.id}`)">
        <div class="topbar__title">{{ title }}</div>
        <div class="topbar__sub">{{ subtitle }}</div>
      </div>
      <button class="iconbtn" aria-label="语音通话" @click="showToast('语音通话 · 即将推出')">
        <CallOutline />
      </button>
      <button class="iconbtn" aria-label="更多" @click="sheet = true"><EllipsisHorizontal /></button>
    </header>

    <div ref="listEl" class="chat-list" :class="{ 'is-tavern': conv.profile === 'tavern' }" @scroll.passive="onScroll">
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
        />
      </template>
      <div class="chat-list__pad" />
    </div>

    <Composer :streaming="streaming" @send="send" @stop="chat.stop(props.id)" />

    <BottomSheet v-model="sheet" title="聊天设置">
      <button class="cell" @click="regenerate">
        <span class="cell__body">
          <span class="cell__title">重新生成</span>
          <span class="cell__desc">把最后一条回复重写一遍</span>
        </span>
      </button>
      <button v-if="ch" class="cell" @click="switchProfile(conv.profile === 'qq' ? 'tavern' : 'qq')">
        <span class="cell__body">
          <span class="cell__title">{{ conv.profile === 'qq' ? '切到酒馆里继续' : '切回 QQ 聊天' }}</span>
          <span class="cell__desc">
            {{ conv.profile === 'qq' ? '同一角色、同一份设定，换一套叙事提示词' : '短消息风格的 QQ 对话' }}
          </span>
        </span>
      </button>
      <button v-if="ch" class="cell" @click="sheet = false; router.push(`/character/${ch.id}`)">
        <span class="cell__body">
          <span class="cell__title">角色资料</span>
          <span class="cell__desc">查看设定、开关和提示词</span>
        </span>
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
