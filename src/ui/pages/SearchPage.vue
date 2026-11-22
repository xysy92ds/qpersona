<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronBack, SearchOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'
import { db } from '@/core/db'
import type { Character, Message } from '@/core/types'
import { chatTime } from '@/core/util'

const router = useRouter()
const contacts = useContactsStore()

const q = ref('')
const input = ref<HTMLInputElement>()
const chars = ref<Character[]>([])
const msgs = ref<Message[]>([])
const scanned = ref(false)

let timer: number | null = null

async function run() {
  const term = q.value.trim().toLowerCase()
  if (!term) {
    chars.value = []
    msgs.value = []
    return
  }
  chars.value = contacts.characters.filter((c) => {
    const hay = [
      c.card.name,
      c.ext.qq.nickname ?? '',
      c.ext.qq.signature ?? '',
      c.ext.qq.qqNumber,
      ...(c.card.tags ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(term)
  })

  const all = await db.messages.filter((m) => m.kind !== 'tip' && m.text.toLowerCase().includes(term)).toArray()
  all.sort((a, b) => b.ts - a.ts)
  msgs.value = all.slice(0, 40)
  scanned.value = true
}

watch(q, () => {
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(run, 180)
})

onMounted(() => {
  input.value?.focus()
})

function convTitle(id: string): string {
  const c = contacts.conversationById(id)
  if (!c) return '已删除的会话'
  return contacts.characterById(c.characterId)?.ext.qq.nickname || c.title
}

function openMessage(m: Message) {
  router.push(`/chat/${m.conversationId}`)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}
</script>

<template>
  <div class="page">
    <div class="bar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="field">
        <SearchOutline />
        <input ref="input" v-model="q" placeholder="搜索联系人、聊天记录" enterkeyhint="search" />
      </div>
      <button class="cancel" @click="goBack">取消</button>
    </div>

    <div class="scroll">
      <template v-if="!q.trim()">
        <div class="hint">
          可以搜角色名、昵称、签名、标签、QQ 号，<br />也可以直接搜聊天记录里的字。
        </div>
      </template>
      <template v-else>
        <div v-if="chars.length" class="group-title">联系人 · {{ chars.length }}</div>
        <button v-for="c in chars" :key="c.id" class="cell" @click="router.push(`/character/${c.id}`)">
          <Avatar :name="c.card.name" :src="c.ext.qq.avatar" :size="42" />
          <span class="cell__body">
            <span class="cell__title">{{ c.ext.qq.nickname || c.card.name }}</span>
            <span class="cell__desc">{{ c.ext.qq.signature || c.card.tags?.join(' · ') || '暂无签名' }}</span>
          </span>
        </button>

        <div v-if="msgs.length" class="group-title">聊天记录 · {{ msgs.length }}</div>
        <button v-for="m in msgs" :key="m.id" class="cell" @click="openMessage(m)">
          <span class="cell__body">
            <span class="cell__title">{{ convTitle(m.conversationId) }}</span>
            <span class="cell__desc snippet">{{ m.text }}</span>
            <span class="cell__desc">{{ chatTime(m.ts) }}</span>
          </span>
        </button>

        <div v-if="!chars.length && !msgs.length && scanned" class="empty">
          <SearchOutline />
          没有找到「{{ q.trim() }}」
        </div>
      </template>
    </div>
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
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 10px 6px;
  background: var(--topbar-bg);
  backdrop-filter: blur(18px);
}
.field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--bg-sheet);
}
.field svg {
  width: 16px;
  height: 16px;
  color: var(--text-3);
  flex: none;
}
.field input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14.5px;
  color: var(--text);
}
.cancel {
  font-size: 14px;
  color: var(--brand);
  flex: none;
  padding: 0 4px;
}
.scroll {
  padding-bottom: 20px;
}
.group-title {
  padding: 16px 18px 7px;
  font-size: 12px;
  color: var(--text-3);
}
.cell {
  background: transparent;
}
.cell__desc.snippet {
  color: var(--text-2);
  font-size: 13px;
  margin-top: 3px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
}
</style>
