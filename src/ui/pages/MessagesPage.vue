<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AddOutline, ChatbubblesOutline, SearchOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'
import { useChatStore } from '@/store/chat'
import type { Conversation } from '@/core/types'
import { listTime } from '@/core/util'

const router = useRouter()
const contacts = useContactsStore()
const chat = useChatStore()

// QQ 消息列表只显示 QQ 端会话；酒馆会话在 /tavern 里进入，两边共享角色卡
const convs = computed(() => contacts.sorted.filter((c) => c.profile === 'qq'))

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
  contacts.markRead(c.id)
  router.push(`/chat/${c.id}`)
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="topbar head__bar">
        <h1>消息</h1>
        <button class="iconbtn" aria-label="添加好友" @click="router.push('/add')">
          <AddOutline />
        </button>
      </div>
      <div class="searchbar">
        <SearchOutline />
        <span>搜索</span>
      </div>
    </div>

    <div class="scroll list">
      <template v-if="convs.length">
        <button
          v-for="c in convs"
          :key="c.id"
          class="conv"
          :class="{ pinned: c.pinned }"
          @click="open(c)"
        >
          <div class="conv__avatar">
            <Avatar :name="titleOf(c)" :src="avatarOf(c)" :size="49" />
            <span v-if="c.unread" class="conv__badge">{{ c.unread > 99 ? '99+' : c.unread }}</span>
          </div>
          <div class="conv__body">
            <div class="conv__row">
              <span class="conv__name">{{ titleOf(c) }}</span>
              <span class="conv__time">{{ listTime(c.lastTs) }}</span>
            </div>
            <div class="conv__row">
              <span class="conv__preview" :class="{ typing: chat.isStreaming(c.id) }">{{ previewOf(c) }}</span>
              <span v-if="c.pinned" class="pin">置顶</span>
            </div>
          </div>
        </button>
      </template>

      <div v-else class="empty">
        <ChatbubblesOutline />
        <div>还没有聊天。点右上角「+」导入角色卡，<br />或者去「联系人」看看。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.head {
  flex: none;
  background: var(--brand-grad);
  padding-bottom: 18px;
  z-index: 2;
}
.head__bar {
  background: transparent;
  min-height: 44px;
  padding: 0 12px;
}
.head__bar h1 {
  font-size: 20px;
}
.searchbar {
  margin: 6px 14px 0;
  height: 34px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.22);
  color: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
}
.searchbar svg {
  width: 15px;
  height: 15px;
  opacity: 0.9;
}
.list {
  margin-top: -10px;
  border-radius: 16px 16px 0 0;
  background: var(--bg-sheet);
  position: relative;
  z-index: 3;
  padding: 4px 0 12px;
}
.conv {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  width: 100%;
  text-align: left;
  transition: background 0.12s;
}
.conv:active {
  background: var(--bg-hover);
}
.conv.pinned {
  background: color-mix(in srgb, var(--bg-sheet) 90%, var(--line-2));
}
.conv__avatar {
  position: relative;
  flex: none;
}
.conv__badge {
  position: absolute;
  top: -4px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--danger);
  color: #fff;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 17px;
  text-align: center;
  box-shadow: 0 0 0 1.5px var(--bg-sheet);
}
.conv__body {
  flex: 1;
  min-width: 0;
  padding-bottom: 1px;
}
.conv__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.conv__name {
  flex: 1;
  min-width: 0;
  font-size: 15.5px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
}
.conv__time {
  font-size: 11px;
  color: var(--text-3);
  flex: none;
}
.conv__preview {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv__preview.typing {
  color: var(--brand);
}
.pin {
  font-size: 10px;
  color: var(--text-3);
  border: 0.5px solid var(--line-2);
  border-radius: 4px;
  padding: 0 3px;
  flex: none;
}
</style>
