<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AddOutline, ChevronBack, ChevronForward, KeyOutline, TrashOutline } from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useSettingsStore } from '@/store/settings'
import { SLOTS, type ApiProfile, type SlotId } from '@/core/types'
import { testProfile } from '@/core/llm'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const settings = useSettingsStore()

const showEditor = ref(false)
const testing = ref(false)
const deleting = ref(false)

const form = reactive({
  id: '',
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.9,
  priceIn: '',
  priceOut: '',
})

const isEdit = computed(() => !!form.id)

const presets = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', name: 'DeepSeek' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', name: 'OpenAI' },
  { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', name: '硅基流动' },
  { label: ' Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1', name: 'Ollama 本地' },
]

function openNew() {
  Object.assign(form, {
    id: '',
    name: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.9,
    priceIn: '',
    priceOut: '',
  })
  deleting.value = false
  showEditor.value = true
}

function openEdit(p: ApiProfile) {
  Object.assign(form, {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey,
    model: p.model,
    temperature: p.temperature ?? 0.9,
    priceIn: p.priceIn != null ? String(p.priceIn) : '',
    priceOut: p.priceOut != null ? String(p.priceOut) : '',
  })
  deleting.value = false
  showEditor.value = true
}

function applyPreset(p: (typeof presets)[number]) {
  form.name = p.name
  form.baseUrl = p.baseUrl
  form.model = p.model
}

function valid(): boolean {
  if (!form.baseUrl.trim()) {
    showToast('先填 Base URL')
    return false
  }
  if (!form.model.trim()) {
    showToast('先填模型名')
    return false
  }
  return true
}

async function save() {
  if (!valid()) return
  const num = (v: string) => {
    const n = parseFloat(v)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }
  const payload = {
    name: form.name.trim() || form.model.trim(),
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim(),
    model: form.model.trim(),
    temperature: form.temperature,
    priceIn: num(form.priceIn),
    priceOut: num(form.priceOut),
  }
  if (isEdit.value) await settings.updateProfile(form.id, payload)
  else await settings.addProfile(payload)
  showEditor.value = false
  showToast('已保存')
}

async function test() {
  if (!valid() || testing.value) return
  testing.value = true
  try {
    const res = await testProfile({
      id: 'test',
      name: form.name,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      model: form.model,
      createdAt: 0,
    })
    showToast(`连接成功：${res.slice(0, 24)}`, 2400)
  } catch (e) {
    showToast(`连接失败：${e instanceof Error ? e.message : String(e)}`, 3600)
  } finally {
    testing.value = false
  }
}

async function remove() {
  if (!deleting.value) {
    deleting.value = true
    return
  }
  await settings.removeProfile(form.id)
  showEditor.value = false
  showToast('已删除方案')
}

function onBind(slot: SlotId, e: Event) {
  const v = (e.target as HTMLSelectElement).value
  void settings.bind(slot, v || null)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/me')
}

const boundSlots = computed(() => {
  const map: Record<string, string[]> = {}
  for (const s of SLOTS) {
    const id = settings.bindings[s.id]
    if (id) (map[id] ??= []).push(s.label)
  }
  return map
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">AI 设置</div>
      <button class="iconbtn" aria-label="添加" @click="openNew"><AddOutline /></button>
    </header>

    <div class="scroll">
      <div class="intro">
        <div class="intro__title">按能力槽位配置，而不是按角色</div>
        <div class="intro__text">
          调度层只认槽位。主对话、记忆总结、语音各用一个槽位，可以指向不同的接口。
          聊天界面里选了「默认」的槽位，都回落到主对话模型。
        </div>
      </div>

      <div class="group-title">
        模型方案
        <span class="count">{{ settings.profiles.length }}</span>
      </div>
      <div class="profiles">
        <button v-for="p in settings.profiles" :key="p.id" class="profile-card" @click="openEdit(p)">
          <div class="profile-card__head">
            <span class="profile-card__name">{{ p.name }}</span>
            <span v-for="s in boundSlots[p.id]" :key="s" class="chip">{{ s }}</span>
          </div>
          <div class="profile-card__model">{{ p.model }}</div>
          <div class="profile-card__url">{{ p.baseUrl }}</div>
          <div class="profile-card__key">
            <KeyOutline />
            {{ p.apiKey ? '已填写 Key' : '未填写 Key（本地模型可留空）' }}
          </div>
        </button>
        <button class="add-card" @click="openNew">
          <AddOutline />
          添加模型方案
        </button>
      </div>

      <div class="group-title">能力槽位</div>
      <div class="sheet-block">
        <div v-for="s in SLOTS" :key="s.id" class="slot-row">
          <div class="slot-row__body">
            <div class="cell__title">{{ s.label }}</div>
            <div class="cell__desc">{{ s.desc }}</div>
          </div>
          <select class="select slot-row__select" :value="settings.bindings[s.id] || ''" @change="onBind(s.id, $event)">
            <option value="">默认</option>
            <option v-for="p in settings.profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <div class="hint">
        API Key 只保存在这台设备的 IndexedDB 里，除了发给你填的接口地址，不会同步到任何地方。
        每个角色还可以在「角色资料」里覆盖这里的绑定。
      </div>
    </div>

    <BottomSheet v-model="showEditor" :title="isEdit ? '编辑模型方案' : '添加模型方案'">
      <div class="presets">
        <button v-for="p in presets" :key="p.label" class="preset" @click="applyPreset(p)">{{ p.label }}</button>
      </div>
      <label class="field">
        <span class="field__label">方案名称</span>
        <input v-model="form.name" class="input" placeholder="例如：DeepSeek 官方" maxlength="20" />
      </label>
      <label class="field">
        <span class="field__label">Base URL（OpenAI 兼容）</span>
        <input v-model="form.baseUrl" class="input" placeholder="https://api.deepseek.com/v1" inputmode="url" />
      </label>
      <label class="field">
        <span class="field__label">API Key</span>
        <input v-model="form.apiKey" class="input" type="password" placeholder="sk-..." autocomplete="off" />
      </label>
      <label class="field">
        <span class="field__label">模型名</span>
        <input v-model="form.model" class="input" placeholder="deepseek-chat" />
      </label>
      <div class="price-row">
        <label class="field">
          <span class="field__label">输入单价</span>
          <input v-model="form.priceIn" class="input" inputmode="decimal" placeholder="元 / 百万 tokens" />
        </label>
        <label class="field">
          <span class="field__label">输出单价</span>
          <input v-model="form.priceOut" class="input" inputmode="decimal" placeholder="留空自动估算" />
        </label>
      </div>
      <div class="hint">
        单价用来估算每条回复的花费，只在本机计算。留空时按模型名内置价目估算（例如 deepseek-chat 约 ¥2 / ¥8）。
      </div>
      <label class="field">
        <span class="field__label">温度 {{ form.temperature.toFixed(1) }}</span>
        <input v-model.number="form.temperature" class="range" type="range" min="0" max="2" step="0.1" />
      </label>
      <div class="hint">测试连接会真实调用一次接口，可能产生极少量费用。</div>
      <template #footer>
        <button v-if="isEdit" class="btn btn--danger" @click="remove">
          <TrashOutline />
          {{ deleting ? '确认删除' : '删除' }}
        </button>
        <button class="btn btn--ghost" :disabled="testing" @click="test">{{ testing ? '测试中…' : '测试' }}</button>
        <button class="btn" @click="save">保存</button>
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
  padding-bottom: 20px;
}
.intro {
  margin: 10px 12px 2px;
  padding: 14px 14px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(0, 153, 255, 0.12), rgba(123, 91, 255, 0.1));
  border: 1px solid rgba(0, 153, 255, 0.14);
}
.intro__title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 5px;
}
.intro__text {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.65;
}
.group-title {
  padding: 18px 22px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.count {
  font-size: 10px;
  background: var(--bg-hover);
  border-radius: 8px;
  padding: 0 6px;
  line-height: 15px;
}
.profiles {
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.profile-card {
  text-align: left;
  background: var(--bg-sheet);
  border-radius: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
}
.profile-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.profile-card__name {
  font-size: 15px;
  font-weight: 600;
  margin-right: 2px;
}
.chip {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(0, 153, 255, 0.1);
  color: var(--brand);
}
.profile-card__model {
  font-size: 12.5px;
  color: var(--text-2);
  margin-top: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.profile-card__url {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-card__key {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-3);
  margin-top: 6px;
}
.profile-card__key svg {
  width: 13px;
  height: 13px;
}
.add-card {
  border: 1.5px dashed var(--line-2);
  border-radius: 12px;
  padding: 14px;
  color: var(--text-2);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
}
.add-card svg {
  width: 18px;
  height: 18px;
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 12px;
  margin: 0 10px;
  overflow: hidden;
}
.slot-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
}
.slot-row:last-child {
  border-bottom: none;
}
.slot-row__body {
  flex: 1;
  min-width: 0;
}
.slot-row__select {
  width: 128px;
  padding: 8px 10px;
  font-size: 13px;
  flex: none;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 16px 2px;
}
.preset {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--bg-hover);
  font-size: 12.5px;
  color: var(--text-2);
}
.preset:active {
  background: rgba(0, 153, 255, 0.14);
  color: var(--brand);
}
.price-row {
  display: flex;
  gap: 2px;
}
.price-row .field {
  flex: 1;
  min-width: 0;
}
.range {
  width: 100%;
  accent-color: var(--brand);
  height: 22px;
}
</style>
