<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AddOutline, PeopleOutline, SearchOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'
import { useSettingsStore } from '@/store/settings'
import { avatarSvg } from '@/core/avatar'

const route = useRoute()
const router = useRouter()
const contacts = useContactsStore()
const settings = useSettingsStore()

const convs = computed(() => [...contacts.conversations].sort((a, b) => b.lastTs - a.lastTs))

function titleOf(id: string) {
  const c = contacts.conversationById(id)
  return c?.title || '会话'
}
function avatarOf(id: string) {
  const c = contacts.conversationById(id)
  return c?.avatar || contacts.characterById(c?.characterId)?.ext.qq.avatar || ''
}
function previewOf(id: string) {
  return contacts.conversationById(id)?.lastText || '还没有消息'
}
function active(id: string) {
  return route.name === 'chat' && route.params.id === id
}
</script>

<template>
  <aside class="desk-side">
    <div class="desk-user" @click="router.push('/me')">
      <Avatar :name="settings.user.nickname" :src="settings.user.avatar || avatarSvg(settings.user.nickname)" :size="42" />
      <div class="desk-user__body">
        <b>{{ settings.user.nickname }}</b>
        <small>{{ settings.user.signature || '笺页 · JianYIE' }}</small>
      </div>
    </div>

    <div class="desk-actions">
      <button @click="router.push('/search')"><SearchOutline /> 搜索</button>
      <button @click="router.push('/add')"><AddOutline /> 添加</button>
      <button @click="router.push('/group/new')"><PeopleOutline /> 群聊</button>
    </div>

    <div class="desk-title">消息</div>
    <div class="desk-list">
      <button
        v-for="c in convs"
        :key="c.id"
        class="desk-conv"
        :class="{ on: active(c.id) }"
        @click="router.push(`/chat/${c.id}`)"
      >
        <div class="desk-conv__avatar">
          <Avatar :name="titleOf(c.id)" :src="avatarOf(c.id)" :size="42" />
          <span v-if="c.unread && !c.muted" class="desk-badge">{{ c.unread > 99 ? '99+' : c.unread }}</span>
        </div>
        <div class="desk-conv__body">
          <div class="desk-conv__top">
            <b>{{ titleOf(c.id) }}</b>
            <small>{{ new Date(c.lastTs).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</small>
          </div>
          <div class="desk-conv__preview">{{ previewOf(c.id) }}</div>
        </div>
      </button>
      <div v-if="!convs.length" class="desk-empty">还没有会话</div>
    </div>

    <div class="desk-foot" @click="router.push('/settings')">设置 · 外观 · 账号与同步</div>
  </aside>
</template>

<style scoped>
.desk-side {
  width: 280px;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: var(--bg-sheet);
}
.desk-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 12px;
  cursor: pointer;
}
.desk-user__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.desk-user__body b {
  font-size: 14px;
}
.desk-user__body small {
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desk-actions {
  display: flex;
  gap: 6px;
  padding: 0 12px 12px;
}
.desk-actions button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 7px 4px;
  border-radius: 8px;
  background: var(--bg-hover);
  color: var(--text-2);
  font-size: 11px;
}
.desk-actions button svg {
  width: 14px;
  height: 14px;
}
.desk-title {
  padding: 4px 16px 6px;
  font-size: 10.5px;
  color: var(--text-3);
}
.desk-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}
.desk-conv {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 9px 8px;
  border-radius: 9px;
}
.desk-conv:hover {
  background: var(--bg-hover);
}
.desk-conv.on {
  background: rgba(47, 134, 255, 0.1);
}
.desk-conv__avatar {
  position: relative;
  flex: none;
}
.desk-badge {
  position: absolute;
  right: -4px;
  top: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--danger);
  color: #fff;
  font-size: 9px;
  display: grid;
  place-items: center;
}
.desk-conv__body {
  flex: 1;
  min-width: 0;
}
.desk-conv__top {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
.desk-conv__top b {
  font-size: 12.5px;
  font-weight: 500;
}
.desk-conv__top small {
  font-size: 9.5px;
  color: var(--text-3);
}
.desk-conv__preview {
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desk-empty {
  padding: 24px 10px;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}
.desk-foot {
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--text-3);
  cursor: pointer;
}
</style>
