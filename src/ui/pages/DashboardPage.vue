<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronBack, AddOutline, ChatbubblesOutline, PeopleOutline, SparklesOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { db } from '@/core/db'
import { useContactsStore } from '@/store/contacts'
import { formatCost } from '@/core/pricing'

const router = useRouter()
const contacts = useContactsStore()

const stats = ref({
  todayMessages: 0,
  activeConvs: 0,
  todayCost: 0,
  characters: 0,
  memories: 0,
  stickers: 0,
  conversations: 0,
})
const loading = ref(true)

const todayStart = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

onMounted(async () => {
  try {
    const start = todayStart()
    const [messages, characters, memories, stickers] = await Promise.all([
      db.messages.where('ts').aboveOrEqual(start).toArray(),
      db.characters.count(),
      db.memories.count(),
      db.stickers.count(),
    ])
    const activeConvs = contacts.conversations.filter((c) => c.lastTs >= start).length
    stats.value = {
      todayMessages: messages.filter((m) => m.kind !== 'tip').length,
      activeConvs,
      todayCost: messages.reduce((n, m) => n + (m.cost ?? 0), 0),
      characters,
      memories,
      stickers,
      conversations: contacts.conversations.length,
    }
  } finally {
    loading.value = false
  }
})

const recent = computed(() =>
  [...contacts.conversations].sort((a, b) => b.lastTs - a.lastTs).slice(0, 4),
)

function openConv(id: string) {
  router.push(`/chat/${id}`)
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="router.back()"><ChevronBack /></button>
      <div class="topbar__title">看板</div>
      <button class="iconbtn" aria-label="添加朋友" @click="router.push('/add')"><AddOutline /></button>
    </header>

    <div class="scroll">
      <div class="hello">
        <div class="hello__title">今天也和角色聊两句吧</div>
        <div class="hello__date">{{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}</div>
      </div>

      <div class="metrics">
        <div class="metric">
          <span class="metric__label">今日消息</span>
          <b>{{ stats.todayMessages }}</b>
          <span class="metric__hint">{{ stats.activeConvs }} 个活跃会话</span>
        </div>
        <div class="metric">
          <span class="metric__label">今日花费</span>
          <b>{{ formatCost(stats.todayCost) }}</b>
          <span class="metric__hint">按单价估算</span>
        </div>
        <div class="metric">
          <span class="metric__label">角色</span>
          <b>{{ stats.characters }}</b>
          <span class="metric__hint">{{ stats.conversations }} 个会话</span>
        </div>
        <div class="metric">
          <span class="metric__label">记忆</span>
          <b>{{ stats.memories }}</b>
          <span class="metric__hint">{{ stats.stickers }} 个表情</span>
        </div>
      </div>

      <div class="group-title">最近在聊</div>
      <div class="recent">
        <button v-for="c in recent" :key="c.id" class="recent__row" @click="openConv(c.id)">
          <Avatar :name="c.title" :src="c.avatar || contacts.characterById(c.characterId)?.ext.qq.avatar" :size="38" />
          <div class="recent__body">
            <div class="recent__top">
              <span class="recent__name">{{ c.title }}</span>
              <span class="recent__time">{{ new Date(c.lastTs).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
            <div class="recent__text">{{ c.lastText || '还没有消息' }}</div>
          </div>
        </button>
        <div v-if="!recent.length" class="empty">还没有会话，去添加一个角色。</div>
      </div>

      <div class="group-title">快捷入口</div>
      <div class="quick">
        <button class="quick__item" @click="router.push('/add')">
          <span class="quick__icon" style="background:#e8f2ff;color:#2b7fff"><AddOutline /></span>
          <span>添加角色</span>
        </button>
        <button class="quick__item" @click="router.push('/group/new')">
          <span class="quick__icon" style="background:#f3e9ff;color:#8b5cf6"><PeopleOutline /></span>
          <span>新建群聊</span>
        </button>
        <button class="quick__item" @click="router.push('/settings/ai')">
          <span class="quick__icon" style="background:#e6f7ff;color:#0891b2"><SparklesOutline /></span>
          <span>AI 设置</span>
        </button>
        <button class="quick__item" @click="router.push('/stickers')">
          <span class="quick__icon" style="background:#fff1e6;color:#f56e0f"><ChatbubblesOutline /></span>
          <span>表情包</span>
        </button>
      </div>

      <div v-if="loading" class="hint" style="text-align:center">统计中…</div>
      <div class="hint">
        所有统计都在本地计算，不上传；云端同步和账号用量会在接入服务器后显示。
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
  background: var(--bg-page);
}
.scroll {
  padding-bottom: 24px;
}
.hello {
  margin: 12px;
  padding: 16px;
  border-radius: 16px;
  color: #fff;
  background:
    radial-gradient(120% 130% at 100% 0%, rgba(255, 255, 255, 0.25), transparent 55%),
    linear-gradient(135deg, #2fb6ff, #0b6fe0);
  box-shadow: 0 10px 24px rgba(11, 111, 224, 0.22);
}
.hello__title {
  font-size: 17px;
  font-weight: 600;
}
.hello__date {
  margin-top: 5px;
  font-size: 11.5px;
  opacity: 0.85;
}
.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0 10px;
}
.metric {
  display: flex;
  flex-direction: column;
  padding: 13px;
  border-radius: 13px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.metric__label {
  font-size: 11px;
  color: var(--text-3);
}
.metric b {
  font-size: 22px;
  margin: 4px 0 1px;
  font-variant-numeric: tabular-nums;
}
.metric__hint {
  font-size: 10px;
  color: var(--text-3);
}
.group-title {
  padding: 16px 16px 7px;
  font-size: 12px;
  color: var(--text-3);
}
.recent {
  margin: 0 10px;
  border-radius: 13px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  overflow: hidden;
}
.recent__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}
.recent__row:last-child {
  border-bottom: none;
}
.recent__body {
  flex: 1;
  min-width: 0;
}
.recent__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.recent__name {
  font-size: 13px;
  font-weight: 500;
}
.recent__time {
  font-size: 10px;
  color: var(--text-3);
}
.recent__text {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quick {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 0 10px;
}
.quick__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  border-radius: 12px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  font-size: 11px;
  color: var(--text-2);
}
.quick__icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}
.quick__icon svg {
  width: 19px;
  height: 19px;
}
.empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}
</style>
