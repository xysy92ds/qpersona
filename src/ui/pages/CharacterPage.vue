<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatbubblesOutline, ChevronBack, MoonOutline, SparklesOutline, TrashOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { useSettingsStore } from '@/store/settings'
import { buildSystemPrompt } from '@/core/prompt'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ id: string }>()
const router = useRouter()
const contacts = useContactsStore()
const settings = useSettingsStore()

const ch = computed(() => contacts.characterById(props.id))
const tab = ref<'qq' | 'tavern'>('qq')
const confirmDelete = ref(false)

const promptText = computed(() =>
  ch.value ? buildSystemPrompt(ch.value, tab.value, settings.user.nickname) : '',
)

async function openChat(profile: 'qq' | 'tavern') {
  if (!ch.value) return
  const conv = await contacts.ensureConversation(ch.value.id, profile)
  router.push(`/chat/${conv.id}`)
}

async function toggle(key: 'chat' | 'memory') {
  if (!ch.value) return
  const ext = { ...ch.value.ext, toggles: { ...ch.value.ext.toggles, [key]: !ch.value.ext.toggles[key] } }
  await contacts.updateCharacter(ch.value.id, { ext })
  showToast(key === 'chat' ? (ext.toggles.chat ? '已开启主对话' : '已关闭主对话，不会再调用模型') : ext.toggles.memory ? '已开启记忆总结' : '已关闭记忆总结')
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
      <div class="hero">
        <Avatar :name="ch.card.name" :src="ch.ext.qq.avatar" :size="72" />
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
            <div class="cell__desc">每 10 轮后台总结一次，不影响聊天</div>
          </div>
          <span class="switch" :class="{ on: ch.ext.toggles.memory }" />
        </button>
        <button class="cell" @click="settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark')">
          <div class="cell__body">
            <div class="cell__title">深色模式快捷开关</div>
            <div class="cell__desc">和设置里的开关是同一个</div>
          </div>
          <MoonOutline class="chev" />
        </button>
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
  background: var(--bg);
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
