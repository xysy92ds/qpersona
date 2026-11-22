<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AddOutline,
  BookOutline,
  ChatbubblesOutline,
  CloudUploadOutline,
  CreateOutline,
  NotificationsOffOutline,
  PeopleOutline,
  PersonAddOutline,
  SearchOutline,
  SettingsOutline,
  SparklesOutline,
} from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { useChatStore } from '@/store/chat'
import { useSettingsStore } from '@/store/settings'
import type { Conversation } from '@/core/types'
import { listTime } from '@/core/util'
import { showToast } from '@/ui/common/toast'
import { useUiStore } from '@/store/ui'

const router = useRouter()
const ui = useUiStore()
const contacts = useContactsStore()
const chat = useChatStore()
const settings = useSettingsStore()

const convs = computed(() => contacts.sorted.filter((c) => c.profile === 'qq'))

const menu = ref(false)
const actionsOpen = ref(false)
const actionConv = ref<Conversation | null>(null)
const confirmDelete = ref(false)

const actionTitle = computed(() => (actionConv.value ? titleOf(actionConv.value) : ''))

function titleOf(c: Conversation): string {
  if (c.kind === 'group') return c.title
  return contacts.characterById(c.characterId)?.ext.qq.nickname || c.title
}

function avatarOf(c: Conversation): string {
  return c.avatar || contacts.characterById(c.characterId)?.ext.qq.avatar || ''
}

function previewOf(c: Conversation): string {
  if (chat.isStreaming(c.id)) return '正在输入…'
  return c.lastText || '开始聊天吧'
}

function open(c: Conversation) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  contacts.markRead(c.id)
  router.push(`/chat/${c.id}`)
}

// —— 长按菜单（QQ 的置顶 / 免打扰 / 删除都在这里）——
let pressTimer: number | null = null
let suppressClick = false
let startX = 0
let startY = 0

function pressDown(c: Conversation, e: PointerEvent) {
  suppressClick = false
  startX = e.clientX
  startY = e.clientY
  pressTimer = window.setTimeout(() => {
    pressTimer = null
    suppressClick = true
    actionConv.value = c
    confirmDelete.value = false
    actionsOpen.value = true
  }, 420)
}

function pressCancel() {
  if (pressTimer) {
    window.clearTimeout(pressTimer)
    pressTimer = null
  }
}

function pressMove(e: PointerEvent) {
  if (Math.abs(e.clientX - startX) > 9 || Math.abs(e.clientY - startY) > 9) pressCancel()
}

function openActions(c: Conversation) {
  suppressClick = true
  actionConv.value = c
  confirmDelete.value = false
  actionsOpen.value = true
}

async function togglePin() {
  if (!actionConv.value) return
  await contacts.togglePin(actionConv.value.id)
  actionsOpen.value = false
}

async function toggleMute() {
  if (!actionConv.value) return
  await contacts.touch(actionConv.value.id, { muted: !actionConv.value.muted })
  actionsOpen.value = false
  showToast(actionConv.value.muted ? '已设为消息免打扰' : '已取消免打扰')
}

async function removeConv() {
  if (!actionConv.value) return
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  await contacts.removeConversation(actionConv.value.id)
  actionsOpen.value = false
  showToast('聊天已删除')
}

const menuItems = [
  { label: '加好友', icon: PersonAddOutline, color: '#3b82f6', to: '/add' },
  { label: '导入角色卡', icon: CloudUploadOutline, color: '#0ea5e9', to: '/add?action=import' },
  { label: '新建角色', icon: CreateOutline, color: '#f59e0b', to: '/add?action=create' },
  { label: '发起群聊', icon: PeopleOutline, color: '#22c55e', action: () => showToast('群聊 · 下个版本见') },
  { label: '搜索', icon: SearchOutline, color: '#64748b', to: '/search' },
  { label: '酒馆', icon: BookOutline, color: '#f97316', to: '/tavern' },
  { label: 'AI 设置', icon: SparklesOutline, color: '#8b5cf6', to: '/settings/ai' },
  { label: '设置', icon: SettingsOutline, color: '#6b7280', to: '/settings' },
]

function runMenu(item: (typeof menuItems)[number]) {
  menu.value = false
  if (item.to) router.push(item.to)
  else item.action?.()
}
</script>

<template>
  <div class="page">
    <div class="hero">
      <button class="me" @click="ui.openDrawer()">
        <Avatar :name="settings.user.nickname" :src="settings.user.avatar" :size="46" />
        <span class="me__body">
          <span class="me__name">{{ settings.user.nickname }}</span>
          <span class="me__sign">
            {{ settings.user.signature || '编辑个签，展示你的状态' }}
            <i>›</i>
          </span>
        </span>
      </button>
      <button class="plus" aria-label="更多" @click="menu = true"><AddOutline /></button>
    </div>

    <button class="search" @click="router.push('/search')">
      <SearchOutline />
      <span>搜索</span>
    </button>

    <div class="scroll list">
      <template v-if="convs.length">
        <button
          v-for="c in convs"
          :key="c.id"
          class="conv"
          :class="{ pinned: c.pinned }"
          @click="open(c)"
          @pointerdown="pressDown(c, $event)"
          @pointerup="pressCancel"
          @pointerleave="pressCancel"
          @pointermove="pressMove"
          @contextmenu.prevent="openActions(c)"
        >
          <div class="conv__avatar">
            <Avatar :name="titleOf(c)" :src="avatarOf(c)" :size="52" />
            <span v-if="c.unread && !c.muted" class="conv__badge">{{ c.unread > 99 ? '99+' : c.unread }}</span>
            <span v-else-if="c.unread && c.muted" class="conv__dot" />
          </div>
          <div class="conv__body">
            <div class="conv__row">
              <span class="conv__name">{{ titleOf(c) }}</span>
              <span class="conv__time">{{ listTime(c.lastTs) }}</span>
            </div>
            <div class="conv__row">
              <span class="conv__preview" :class="{ typing: chat.isStreaming(c.id) }">{{ previewOf(c) }}</span>
              <NotificationsOffOutline v-if="c.muted" class="mute" />
              <span v-else-if="c.pinned" class="pin">置顶</span>
            </div>
          </div>
        </button>
      </template>

      <div v-else class="empty">
        <ChatbubblesOutline />
        <div>还没有聊天。点右上角「+」导入角色卡，<br />或者去「联系人」看看。</div>
      </div>
    </div>

    <!-- 右上角 + 菜单 -->
    <BottomSheet v-model="menu" title="更多">
      <div class="menu-grid">
        <button v-for="item in menuItems" :key="item.label" class="menu-item" @click="runMenu(item)">
          <span class="menu-item__icon" :style="{ background: item.color }">
            <component :is="item.icon" />
          </span>
          <span>{{ item.label }}</span>
        </button>
      </div>
      <div class="hint" style="text-align: center">长按会话可置顶、免打扰或删除</div>
    </BottomSheet>

    <!-- 会话长按菜单 -->
    <BottomSheet v-model="actionsOpen" :title="actionTitle">
      <button class="cell" @click="togglePin">
        <span class="cell__body"><span class="cell__title">{{ actionConv?.pinned ? '取消置顶' : '置顶聊天' }}</span></span>
      </button>
      <button class="cell" @click="toggleMute">
        <span class="cell__body">
          <span class="cell__title">{{ actionConv?.muted ? '取消消息免打扰' : '消息免打扰' }}</span>
        </span>
      </button>
      <button class="cell" @click="actionsOpen = false; actionConv && contacts.markRead(actionConv.id)">
        <span class="cell__body"><span class="cell__title">标记为已读</span></span>
      </button>
      <button class="cell" @click="removeConv">
        <span class="cell__body">
          <span class="cell__title" style="color: var(--danger)">{{ confirmDelete ? '再点一次，确认删除' : '删除聊天' }}</span>
          <span class="cell__desc">只删除聊天记录，角色还在联系人里</span>
        </span>
      </button>
    </BottomSheet>

  </div>
</template>

<style scoped>
.page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}
.hero {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 10px 16px;
}
.me {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.me__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}
.me__name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--text);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.me__sign {
  font-size: 11.5px;
  color: var(--text-2);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.me__sign i {
  font-style: normal;
  color: var(--text-3);
  margin-left: 2px;
}
.plus {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--text);
  border-radius: 50%;
}
.plus svg {
  width: 26px;
  height: 26px;
  stroke-width: 3px;
}
.plus:active {
  background: var(--bg-hover);
}
.search {
  flex: none;
  margin: 2px 16px 10px;
  height: 42px;
  border-radius: 12px;
  background: var(--bg-sheet);
  color: var(--text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
}
.search svg {
  width: 17px;
  height: 17px;
}
.list {
  padding: 0 0 12px;
}
.conv {
  display: flex;
  user-select: none;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  width: 100%;
  text-align: left;
  transition: background 0.12s;
}
.conv:active {
  background: rgba(16, 24, 40, 0.045);
}
.conv.pinned {
  background: rgba(255, 255, 255, 0.4);
}
.conv__avatar {
  position: relative;
  flex: none;
}
.conv__badge {
  position: absolute;
  top: -3px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #ff3b30;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--bg);
}
.conv__dot {
  position: absolute;
  top: 1px;
  right: -1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ff3b30;
  box-shadow: 0 0 0 2px var(--bg);
}
.conv__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.conv__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.conv__name {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv__time {
  font-size: 11px;
  color: var(--text-3);
  flex: none;
  font-variant-numeric: tabular-nums;
}
.conv__preview {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-2);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv__preview.typing {
  color: var(--brand);
  opacity: 1;
}
.mute {
  width: 14px;
  height: 14px;
  color: var(--text-3);
  flex: none;
}
.pin {
  font-size: 10px;
  color: var(--text-3);
  border: 0.5px solid var(--line-2);
  border-radius: 4px;
  padding: 0 3px;
  flex: none;
}
.menu-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px 0;
  padding: 4px 8px 14px;
}
.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 10px 2px;
  font-size: 11.5px;
  color: var(--text-2);
  border-radius: 12px;
}
.menu-item:active {
  background: var(--bg-hover);
}
.menu-item__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  color: #fff;
  display: grid;
  place-items: center;
}
.menu-item__icon svg {
  width: 25px;
  height: 25px;
}

</style>
