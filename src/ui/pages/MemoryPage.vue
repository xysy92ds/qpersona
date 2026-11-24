<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AddOutline,
  ChevronBack,
  CreateOutline,
  GitMergeOutline,
  SearchOutline,
  Star,
  StarOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { useMemoryStore } from '@/store/memory'
import { MEMORY_TYPES, type Memory, type MemoryType } from '@/core/types'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ id: string }>()
const router = useRouter()
const contacts = useContactsStore()
const memory = useMemoryStore()

const ch = computed(() => contacts.characterById(props.id))
const q = ref('')
const typeFilter = ref<MemoryType | ''>('')
const sort = ref<'importance' | 'recent'>('importance')
const open = ref(false)
const editing = ref<Memory | null>(null)
const busy = ref(false)

const form = reactive({
  type: 'fact' as MemoryType,
  content: '',
  importance: 5,
  tags: '',
  pinned: false,
})

const rows = computed(() => {
  const list = memory.memoriesOf(props.id)
  const query = q.value.trim().toLowerCase()
  return list
    .filter((m) => (typeFilter.value ? m.type === typeFilter.value : true))
    .filter((m) => {
      if (!query) return true
      return `${m.content} ${m.tags.join(' ')}`.toLowerCase().includes(query)
    })
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
      return sort.value === 'recent'
        ? b.createdAt - a.createdAt
        : b.importance - a.importance || b.createdAt - a.createdAt
    })
})

const pinnedCount = computed(() => memory.memoriesOf(props.id).filter((m) => m.pinned).length)
const groupCount = computed(() => memory.memoriesOf(props.id).filter((m) => m.source === 'group').length)

const typeMeta = (t: MemoryType) => MEMORY_TYPES.find((x) => x.id === t) ?? MEMORY_TYPES[0]!

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace(`/character/${props.id}`)
}

function openAdd() {
  editing.value = null
  form.type = 'fact'
  form.content = ''
  form.importance = 5
  form.tags = ''
  form.pinned = false
  open.value = true
}

function openEdit(m: Memory) {
  editing.value = m
  form.type = m.type
  form.content = m.content
  form.importance = m.importance
  form.tags = m.tags.join(', ')
  form.pinned = !!m.pinned
  open.value = true
}

async function save() {
  if (!form.content.trim()) {
    showToast('先写一句要记住的事')
    return
  }
  busy.value = true
  try {
    const tags = form.tags
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (editing.value) {
      await memory.update(editing.value.id, {
        type: form.type,
        content: form.content,
        importance: form.importance,
        tags,
        pinned: form.pinned,
      })
      showToast('记忆已更新')
    } else {
      await memory.add(props.id, {
        type: form.type,
        content: form.content,
        importance: form.importance,
        tags,
        pinned: form.pinned,
      })
      showToast('已记住')
    }
    open.value = false
  } finally {
    busy.value = false
  }
}

async function togglePin(m: Memory) {
  await memory.togglePin(m.id)
}

async function remove(m: Memory) {
  if (!window.confirm(`删除这条记忆？\n\n${m.content}`)) return
  await memory.remove(m.id)
  showToast('已删除')
}

async function merge() {
  busy.value = true
  try {
    const n = await memory.mergeDuplicates(props.id)
    showToast(n ? `合并了 ${n} 条重复记忆` : '没有发现重复记忆')
  } finally {
    busy.value = false
  }
}

function dateText(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(() => {
  void memory.load(props.id)
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">记忆管理</div>
      <button class="iconbtn" aria-label="添加记忆" @click="openAdd"><AddOutline /></button>
    </header>

    <div class="scroll">
      <div v-if="ch" class="hero">
        <Avatar :name="ch.card.name" :src="ch.ext.qq.avatar" :size="52" />
        <div class="hero__body">
          <div class="hero__name">{{ ch.card.name }}</div>
          <div class="hero__meta">{{ rows.length }} 条记忆 · 置顶 {{ pinnedCount }} · 群聊 {{ groupCount }}</div>
        </div>
        <button class="merge" :disabled="busy" @click="merge"><GitMergeOutline /> 合并重复</button>
      </div>

      <div class="search">
        <SearchOutline />
        <input v-model="q" placeholder="搜内容或标签" />
      </div>

      <div class="filters">
        <button class="chip" :class="{ on: !typeFilter }" @click="typeFilter = ''">全部</button>
        <button
          v-for="t in MEMORY_TYPES"
          :key="t.id"
          class="chip"
          :class="{ on: typeFilter === t.id }"
          @click="typeFilter = typeFilter === t.id ? '' : t.id"
        >{{ t.label }}</button>
      </div>

      <div class="sort-row">
        <span>{{ rows.length }} 条</span>
        <div>
          <button :class="{ on: sort === 'importance' }" @click="sort = 'importance'">按重要度</button>
          <button :class="{ on: sort === 'recent' }" @click="sort = 'recent'">按时间</button>
        </div>
      </div>

      <div v-if="!rows.length" class="empty">
        还没有记忆。可以点右上角手动添加，或者在聊天里点「立即整理」。
      </div>
      <div v-else class="list">
        <div v-for="m in rows" :key="m.id" class="mem" :class="{ pinned: m.pinned }">
          <div class="mem__top">
            <span
              class="mem__type"
              :style="{ color: typeMeta(m.type).color, background: typeMeta(m.type).color + '1a' }"
            >{{ typeMeta(m.type).label }}</span>
            <span v-if="m.source === 'group'" class="mem__source">群聊</span>
            <span v-if="m.pinned" class="mem__pinned">置顶</span>
            <span class="mem__date">{{ dateText(m.createdAt) }}</span>
            <button class="mem__icon" :aria-label="m.pinned ? '取消置顶' : '置顶'" @click="togglePin(m)">
              <Star v-if="m.pinned" />
              <StarOutline v-else />
            </button>
            <button class="mem__icon" aria-label="编辑" @click="openEdit(m)"><CreateOutline /></button>
            <button class="mem__icon mem__icon--danger" aria-label="删除" @click="remove(m)"><TrashOutline /></button>
          </div>
          <div class="mem__text">{{ m.content }}</div>
          <div class="mem__bottom">
            <div class="mem__tags">
              <span v-for="t in m.tags" :key="t">{{ t }}</span>
            </div>
            <div class="mem__bar" :title="`重要度 ${m.importance}/10`">
              <span :style="{ width: `${m.importance * 10}%` }" />
            </div>
          </div>
        </div>
      </div>

      <div class="hint">
        置顶记忆会优先注入提示词；自动总结不会覆盖你手动改过的内容。群聊记忆带「群聊」标记。
      </div>
    </div>

    <BottomSheet v-model="open" :title="editing ? '编辑记忆' : '添加记忆'">
      <div class="types">
        <button
          v-for="t in MEMORY_TYPES"
          :key="t.id"
          class="type-btn"
          :class="{ on: form.type === t.id }"
          :style="form.type === t.id ? { borderColor: t.color, color: t.color } : undefined"
          @click="form.type = t.id"
        >{{ t.label }}</button>
      </div>
      <label class="field">
        <span class="field__label">内容</span>
        <textarea v-model="form.content" class="textarea" maxlength="120" placeholder="一句话，不超过 120 字" />
      </label>
      <label class="field">
        <span class="field__label">标签（逗号分隔）</span>
        <input v-model="form.tags" class="input" placeholder="猫, 书店, 约定" />
      </label>
      <div class="slider-row">
        <span>重要度</span>
        <input v-model.number="form.importance" type="range" min="1" max="10" step="1" />
        <b>{{ form.importance }}</b>
      </div>
      <button class="pin-row" @click="form.pinned = !form.pinned">
        <span>置顶（每次召回优先）</span>
        <span class="switch" :class="{ on: form.pinned }" />
      </button>
      <template #footer>
        <button class="btn btn--ghost" @click="open = false">取消</button>
        <button class="btn" :disabled="busy" @click="save">{{ editing ? '保存' : '记住' }}</button>
      </template>
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
.scroll {
  padding: 0 0 24px;
}
.hero {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px;
  padding: 12px;
  border-radius: 14px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.hero__body {
  flex: 1;
  min-width: 0;
}
.hero__name {
  font-size: 16px;
  font-weight: 600;
}
.hero__meta {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 3px;
}
.merge {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--brand);
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(0, 153, 255, 0.08);
}
.merge svg {
  width: 13px;
  height: 13px;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px;
  padding: 0 12px;
  height: 38px;
  border-radius: 10px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.search svg {
  width: 15px;
  height: 15px;
  color: var(--text-3);
}
.search input {
  flex: 1;
  min-width: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.filters {
  display: flex;
  gap: 6px;
  padding: 10px 12px 4px;
  overflow-x: auto;
}
.chip {
  flex: none;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--bg-hover);
  font-size: 11px;
  color: var(--text-2);
}
.chip.on {
  background: rgba(0, 153, 255, 0.12);
  color: var(--brand);
}
.sort-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  font-size: 10.5px;
  color: var(--text-3);
}
.sort-row div {
  display: flex;
  gap: 10px;
}
.sort-row button {
  font-size: 10.5px;
  color: var(--text-3);
}
.sort-row button.on {
  color: var(--brand);
}
.list {
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mem {
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.mem.pinned {
  border-color: rgba(245, 158, 11, 0.35);
}
.mem__top {
  display: flex;
  align-items: center;
  gap: 5px;
}
.mem__type {
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 4px;
}
.mem__source,
.mem__pinned {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 4px;
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.1);
}
.mem__pinned {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}
.mem__date {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--text-3);
}
.mem__icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--text-3);
}
.mem__icon svg {
  width: 15px;
  height: 15px;
}
.mem__icon--danger {
  color: var(--danger);
}
.mem__text {
  margin-top: 5px;
  font-size: 13px;
  line-height: 1.6;
}
.mem__bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 7px;
}
.mem__tags {
  flex: 1;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.mem__tags span {
  font-size: 9.5px;
  color: var(--text-3);
  background: var(--bg-hover);
  padding: 1px 5px;
  border-radius: 4px;
}
.mem__bar {
  width: 48px;
  height: 3px;
  border-radius: 2px;
  background: var(--line-2);
  overflow: hidden;
  flex: none;
}
.mem__bar span {
  display: block;
  height: 100%;
  background: var(--brand);
}
.empty {
  margin: 20px;
  padding: 30px 16px;
  text-align: center;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-3);
  background: var(--bg-sheet);
  border-radius: 14px;
}
.types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.type-btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-2);
}
.type-btn.on {
  background: var(--bg-hover);
}
.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 12px;
  font-size: 12px;
  color: var(--text-2);
}
.slider-row input {
  flex: 1;
  accent-color: var(--brand);
}
.pin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 0;
  font-size: 12px;
  color: var(--text-2);
}
</style>
