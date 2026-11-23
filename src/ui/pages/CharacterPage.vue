<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CameraOutline, ChatbubblesOutline, ChevronBack, SparklesOutline, TrashOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { useSettingsStore } from '@/store/settings'
import { buildSystemPrompt } from '@/core/prompt'
import { MEMORY_TYPES, type MemoryType } from '@/core/types'
import { useMemoryStore } from '@/store/memory'
import { imageToDataUrl } from '@/core/util'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ id: string }>()
const router = useRouter()
const contacts = useContactsStore()
const settings = useSettingsStore()
const memory = useMemoryStore()

const ch = computed(() => contacts.characterById(props.id))
const tab = ref<'qq' | 'tavern'>('qq')
const confirmDelete = ref(false)
const avatarInput = ref<HTMLInputElement>()
const bgInput = ref<HTMLInputElement>()
const memoryBusy = ref(false)

const memoryList = computed(() => memory.memoriesOf(ch.value?.id))
const memoryConv = computed(
  () =>
    contacts.conversations.find((c) => c.characterId === ch.value?.id && c.kind === 'single') ??
    contacts.conversations.find((c) => c.characterId === ch.value?.id),
)

onMounted(() => {
  if (ch.value) void memory.load(ch.value.id)
})

function typeMeta(t: MemoryType) {
  return MEMORY_TYPES.find((x) => x.id === t) ?? MEMORY_TYPES[0]!
}

async function summarizeMemory() {
  if (memoryBusy.value || !ch.value) return
  if (!memoryConv.value) {
    showToast('先和 TA 聊几句')
    return
  }
  if (!settings.profileFor('memory_summary', ch.value.ext.routing.memory_summary)) {
    showToast('先去 AI 设置里配置记忆总结模型')
    return
  }
  memoryBusy.value = true
  try {
    const n = await memory.summarize(memoryConv.value.id, {
      characterId: ch.value.id,
      source: memoryConv.value.kind === 'group' ? 'group' : 'private',
    })
    showToast(n ? `记下了 ${n} 条` : '这次没有新的可记内容')
  } finally {
    memoryBusy.value = false
  }
}

async function removeMemory(id: string) {
  await memory.remove(id)
  showToast('已删除这条记忆')
}

const heroStyle = computed(() => {
  const bg = ch.value?.ext.qq.background
  if (!bg) return undefined
  const overlay = settings.isDark
    ? 'linear-gradient(180deg, rgba(12,14,18,.6), rgba(12,14,18,.78))'
    : 'linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.86))'
  return {
    backgroundImage: `${overlay}, url(${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const promptText = computed(() =>
  ch.value ? buildSystemPrompt(ch.value, tab.value, settings.user.nickname) : '',
)

async function openChat(profile: 'qq' | 'tavern') {
  if (!ch.value) return
  const conv = await contacts.ensureConversation(ch.value.id, profile)
  router.push(`/chat/${conv.id}`)
}

async function pickAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !ch.value) return
  if (!file.type.startsWith('image/')) {
    showToast('选一张图片')
    return
  }
  try {
    const data = await imageToDataUrl(file, 360)
    const ext = { ...ch.value.ext, qq: { ...ch.value.ext.qq, avatar: data } }
    await contacts.updateCharacter(ch.value.id, { ext })
    showToast('头像已更新')
  } catch {
    showToast('这张图读不出来，换一张试试')
  }
}

async function pickBackground(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !ch.value) return
  try {
    const data = await imageToDataUrl(file, 1400)
    const ext = { ...ch.value.ext, qq: { ...ch.value.ext.qq, background: data } }
    await contacts.updateCharacter(ch.value.id, { ext })
    showToast('主页背景已更新')
  } catch {
    showToast('这张图读不出来，换一张试试')
  }
}

async function resetBackground() {
  if (!ch.value) return
  const ext = { ...ch.value.ext, qq: { ...ch.value.ext.qq, background: '' } }
  await contacts.updateCharacter(ch.value.id, { ext })
  showToast('已恢复默认背景')
}

async function resetAvatar() {
  if (!ch.value) return
  const ext = { ...ch.value.ext, qq: { ...ch.value.ext.qq, avatar: '' } }
  await contacts.updateCharacter(ch.value.id, { ext })
  showToast('已恢复默认头像')
}

async function toggle(key: 'chat' | 'memory' | 'proactive') {
  if (!ch.value) return
  const current =
    key === 'proactive' ? ch.value.ext.toggles.proactive !== false : ch.value.ext.toggles[key]
  const ext = { ...ch.value.ext, toggles: { ...ch.value.ext.toggles, [key]: !current } }
  await contacts.updateCharacter(ch.value.id, { ext })
  if (key === 'chat') showToast(ext.toggles.chat ? '已开启主对话' : '已关闭主对话，不会再调用模型')
  else if (key === 'memory') showToast(ext.toggles.memory ? '已开启记忆总结' : '已关闭记忆总结')
  else showToast(ext.toggles.proactive ? 'TA 可以主动找你了' : '已关闭 TA 的主动消息')
}

async function onRoute(e: Event) {
  if (!ch.value) return
  const v = (e.target as HTMLSelectElement).value
  const routing = { ...ch.value.ext.routing }
  if (v) routing.text_main = v
  else delete routing.text_main
  await contacts.updateCharacter(ch.value.id, { ext: { ...ch.value.ext, routing } })
  showToast(v ? '已为该角色单独指定模型' : '已恢复全局主对话模型')
}

async function doDelete() {
  if (!ch.value) return
  await contacts.removeCharacter(ch.value.id)
  showToast('角色已删除')
  router.replace('/contacts')
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/contacts')
}
</script>

<template>
  <div v-if="ch" class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">角色资料</div>
      <div style="width: 36px" />
    </header>

    <div class="scroll">
      <div class="hero" :style="heroStyle">
        <button class="hero__avatar" aria-label="更换头像" @click="avatarInput?.click()">
          <Avatar :name="ch.card.name" :src="ch.ext.qq.avatar" :size="72" />
          <span class="hero__cam"><CameraOutline /></span>
        </button>
        <div class="hero__body">
          <div class="hero__name">{{ ch.card.name }}</div>
          <div class="hero__meta">QQ {{ ch.ext.qq.qqNumber }} · {{ ch.ext.qq.nickname }}</div>
          <div class="hero__sign">{{ ch.ext.qq.signature || '这个人很懒，什么都没写' }}</div>
          <div v-if="ch.card.tags?.length" class="hero__tags">
            <span v-for="t in ch.card.tags.slice(0, 6)" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn" @click="openChat('qq')"><ChatbubblesOutline /> 发消息</button>
        <button class="btn btn--ghost" @click="openChat('tavern')"><SparklesOutline /> 酒馆叙事</button>
      </div>

      <div class="group-title">设定</div>
      <div class="sheet-block">
        <div class="prose" v-if="ch.card.description">
          <div class="prose__label">简介</div>
          <p>{{ ch.card.description }}</p>
        </div>
        <div class="prose" v-if="ch.card.personality">
          <div class="prose__label">性格</div>
          <p>{{ ch.card.personality }}</p>
        </div>
        <div class="prose" v-if="ch.card.scenario">
          <div class="prose__label">场景</div>
          <p>{{ ch.card.scenario }}</p>
        </div>
        <div class="prose" v-if="ch.card.first_mes">
          <div class="prose__label">开场白</div>
          <p class="quote">{{ ch.card.first_mes }}</p>
        </div>
      </div>

      <div class="group-title">开关</div>
      <div class="sheet-block">
        <button class="cell" @click="toggle('chat')">
          <div class="cell__body">
            <div class="cell__title">主对话（QQ / 酒馆通用）</div>
            <div class="cell__desc">关闭后这个角色不会调用文本模型</div>
          </div>
          <span class="switch" :class="{ on: ch.ext.toggles.chat }" />
        </button>
        <button class="cell" @click="toggle('memory')">
          <div class="cell__body">
            <div class="cell__title">记忆总结</div>
            <div class="cell__desc">按设置里的频率后台整理，不影响聊天</div>
          </div>
          <span class="switch" :class="{ on: ch.ext.toggles.memory }" />
        </button>
        <button class="cell" @click="toggle('proactive')">
          <div class="cell__body">
            <div class="cell__title">主动消息</div>
            <div class="cell__desc">全局开关打开时，TA 可能主动找你</div>
          </div>
          <span class="switch" :class="{ on: ch.ext.toggles.proactive !== false }" />
        </button>
        <button class="cell" @click="bgInput?.click()">
          <div class="cell__body">
            <div class="cell__title">主页背景</div>
            <div class="cell__desc">{{ ch.ext.qq.background ? '点一下换一张' : '给 TA 的主页加一张封面' }}</div>
          </div>
          <span class="cell__value">{{ ch.ext.qq.background ? '更换' : '上传' }}</span>
        </button>
        <button v-if="ch.ext.qq.background" class="cell" @click="resetBackground">
          <div class="cell__body">
            <div class="cell__title">恢复默认背景</div>
            <div class="cell__desc">去掉主页封面图</div>
          </div>
        </button>
        <button v-if="ch.ext.qq.avatar" class="cell" @click="resetAvatar">
          <div class="cell__body">
            <div class="cell__title">恢复默认头像</div>
            <div class="cell__desc">换回按名字生成的头像</div>
          </div>
        </button>
        <div class="cell" style="cursor: default">
          <div class="cell__body">
            <div class="cell__title">这个角色用的模型</div>
            <div class="cell__desc">留空就用全局主对话</div>
          </div>
          <select class="select route-select" :value="ch.ext.routing.text_main || ''" @change="onRoute">
            <option value="">默认</option>
            <option v-for="p in settings.profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <div class="group-title mem-title">
        记忆
        <span class="mem-count">{{ memoryList.length }}</span>
        <button class="mem-refresh" :disabled="memoryBusy" @click="summarizeMemory">
          {{ memoryBusy ? '整理中…' : '立即整理' }}
        </button>
      </div>
      <div class="sheet-block">
        <div v-if="!memoryList.length" class="mem-empty">
          达到设置里的频率会在后台自动整理；也可以点「立即整理」。整理结果会按相关度注入到提示词里。
        </div>
        <div v-for="m in memoryList" :key="m.id" class="mem-item">
          <span v-if="m.source === 'group'" class="mem-source">群聊</span>
          <span
            class="mem-type"
            :style="{ color: typeMeta(m.type).color, background: typeMeta(m.type).color + '1a' }"
          >{{ typeMeta(m.type).label }}</span>
          <span class="mem-text">{{ m.content }}</span>
          <span class="mem-importance" :title="`重要度 ${m.importance}/10`">{{ m.importance }}</span>
          <button class="mem-del" aria-label="删除记忆" @click="removeMemory(m.id)">×</button>
        </div>
      </div>

      <div class="group-title">双端提示词（调度层实际注入的内容）</div>
      <div class="sheet-block prompt-block">
        <div class="tabs">
          <button class="tab" :class="{ on: tab === 'qq' }" @click="tab = 'qq'">QQ 短消息</button>
          <button class="tab" :class="{ on: tab === 'tavern' }" @click="tab = 'tavern'">酒馆叙事</button>
        </div>
        <pre class="prompt">{{ promptText }}</pre>
      </div>

      <div class="group-title">危险操作</div>
      <div class="sheet-block">
        <button class="cell" @click="confirmDelete = true">
          <div class="cell__body">
            <div class="cell__title" style="color: var(--danger)">删除角色</div>
            <div class="cell__desc">同时删除 TA 的聊天记录，不可恢复</div>
          </div>
          <TrashOutline class="chev" />
        </button>
      </div>

      <div class="foot">
        来源：{{ ch.ext.origin === 'import' ? '导入的角色卡' : ch.ext.origin === 'distill' ? '聊天记录蒸馏' : '自定义创建' }}
        <br />创建于 {{ new Date(ch.createdAt).toLocaleDateString() }}
      </div>
    </div>

    <input ref="avatarInput" type="file" accept="image/*" hidden @change="pickAvatar" />
    <input ref="bgInput" type="file" accept="image/*" hidden @change="pickBackground" />

    <BottomSheet v-model="confirmDelete" title="删除这个角色？">
      <div class="hint">「{{ ch.card.name }}」的角色卡和全部聊天记录都会从本地删除，无法撤销。</div>
      <template #footer>
        <button class="btn btn--ghost" @click="confirmDelete = false">再想想</button>
        <button class="btn btn--danger" @click="doDelete">删除</button>
      </template>
    </BottomSheet>
  </div>

  <div v-else class="notfound">
    <p>角色不存在。</p>
    <button class="btn" @click="router.replace('/contacts')">回到联系人</button>
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
.hero {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 18px 16px 16px;
  background: linear-gradient(180deg, rgba(0, 153, 255, 0.1), transparent);
}
.hero__avatar {
  position: relative;
  flex: none;
  width: 72px;
  height: 72px;
}
.hero__cam {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.62);
  color: #fff;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--bg-sheet);
}
.hero__cam svg {
  width: 12px;
  height: 12px;
}
.hero__name {
  font-size: 20px;
  font-weight: 600;
}
.hero__meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}
.hero__sign {
  font-size: 12.5px;
  color: var(--text-2);
  margin-top: 6px;
}
.hero__tags {
  display: flex;
  gap: 5px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.tag {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-2);
}
.actions {
  display: flex;
  gap: 10px;
  padding: 2px 16px 4px;
}
.actions .btn {
  flex: 1;
}
.group-title {
  padding: 18px 22px 7px;
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 12px;
  margin: 0 10px;
  overflow: hidden;
}
.prose {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}
.prose:last-child {
  border-bottom: none;
}
.prose__label {
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.prose p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.68;
  white-space: pre-wrap;
}
.prose .quote {
  color: var(--text-2);
  border-left: 2px solid var(--line-2);
  padding-left: 10px;
}
.prompt-block {
  padding: 0 0 4px;
}
.tabs {
  display: flex;
  gap: 6px;
  padding: 10px 12px 8px;
}
.tab {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-2);
}
.tab.on {
  background: rgba(0, 153, 255, 0.12);
  color: var(--brand);
}
.prompt {
  margin: 0;
  padding: 0 14px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-2);
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}
.mem-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mem-count {
  font-size: 10px;
  background: var(--bg-hover);
  border-radius: 8px;
  padding: 0 6px;
  line-height: 15px;
}
.mem-refresh {
  margin-left: auto;
  font-size: 12px;
  color: var(--brand);
  padding: 4px 6px;
}
.mem-refresh:disabled {
  opacity: 0.5;
}
.mem-empty {
  padding: 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}
.mem-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}
.mem-item:last-child {
  border-bottom: none;
}
.mem-source {
  font-size: 9px;
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.1);
  border-radius: 4px;
  padding: 1px 4px;
  flex: none;
  margin-top: 2px;
}
.mem-type {
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 4px;
  flex: none;
  margin-top: 1px;
}
.mem-text {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text);
}
.mem-importance {
  font-size: 9.5px;
  color: var(--text-3);
  flex: none;
  margin-top: 2px;
}
.mem-del {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: var(--text-3);
  font-size: 15px;
  line-height: 1;
  flex: none;
}
.mem-del:active {
  background: var(--bg-hover);
}
.route-select {
  width: 120px;
  padding: 7px 9px;
  font-size: 12.5px;
  flex: none;
}
.foot {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.8;
  padding: 22px;
}
.notfound {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-2);
}
</style>
