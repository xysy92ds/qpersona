<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChatbubblesOutline,
  ChevronBack,
  ChevronForward,
  CloudDownloadOutline,
  CloudUploadOutline,
  ImageOutline,
  ColorPaletteOutline,
  CreateOutline,
  GridOutline,
  MoonOutline,
  NotificationsOutline,
  ServerOutline,
  SparklesOutline,
  StatsChartOutline,
  TimeOutline,
  TrashOutline,
  VolumeHighOutline,
} from '@vicons/ionicons5'
import {
  useSettingsStore,
  type BubbleStyle,
  type FontScale,
  type ThemeMode,
} from '@/store/settings'
import { useContactsStore } from '@/store/contacts'
import { useChatStore } from '@/store/chat'
import { db } from '@/core/db'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { showToast } from '@/ui/common/toast'
import { imageToDataUrl } from '@/core/util'

const router = useRouter()
const settings = useSettingsStore()
const contacts = useContactsStore()
const chat = useChatStore()

const confirmClearChats = ref(false)
const confirmWipe = ref(false)
const confirmImport = ref(false)
const importInput = ref<HTMLInputElement>()
const storageText = ref('计算中…')
const chatBgInput = ref<HTMLInputElement>()
const themeInput = ref<HTMLInputElement>()
const exportOpen = ref(false)
const includeKeys = ref(false)

const themes: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '跟随系统' },
]
const fonts: { value: FontScale; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'normal', label: '标准' },
  { value: 'large', label: '大' },
]
const bubbles: { value: BubbleStyle; label: string; color: string }[] = [
  { value: 'classic', label: '经典蓝', color: '#0099ff' },
  { value: 'mint', label: '薄荷绿', color: '#23a67b' },
  { value: 'sunset', label: '落日橙', color: '#ff8a3d' },
  { value: 'sakura', label: '樱花粉', color: '#ff6f9c' },
  { value: 'ink', label: '墨色', color: '#2f3542' },
  { value: 'lavender', label: '雾紫', color: '#8b7cf6' },
  { value: 'cocoa', label: '可可', color: '#a97455' },
]


const counts = computed(
  () => `${contacts.characters.length} 个角色 · ${contacts.conversations.length} 个会话`,
)

onMounted(async () => {
  try {
    const est = await navigator.storage?.estimate?.()
    const used = est?.usage ?? 0
    storageText.value = used ? `${(used / 1024 / 1024).toFixed(2)} MB` : '本地存储'
  } catch {
    storageText.value = '本地存储'
  }
})

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function setMemoryCustom(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(n)) return
  if (settings.memoryPlan.mode === 'messages') settings.setMemoryPlan({ every: clamp(n, 5, 500) })
  else settings.setMemoryPlan({ minutes: clamp(n, 5, 1440) })
}

function setProbabilityCustom(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) settings.setProactive({ probability: clamp(n, 1, 100) })
}

function setMinutesCustom(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) settings.setProactive({ minutes: clamp(n, 1, 1440) })
}

async function exportTheme() {
  const payload = {
    app: 'qpersona-theme',
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: settings.theme,
    appearance: settings.appearance,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `qpersona-theme-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
  showToast('主题包已导出')
}

async function importTheme(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (data?.app !== 'qpersona-theme' || !data?.appearance) {
      throw new Error('不是 笺页 的主题包')
    }
    const a = data.appearance
    if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'auto') await settings.setTheme(data.theme)
    if (a.fontScale === 'small' || a.fontScale === 'normal' || a.fontScale === 'large') await settings.setFontScale(a.fontScale)
    if (typeof a.bubble === 'string') await settings.setBubble(a.bubble)
    if (a.textStyle === 'default' || a.textStyle === 'serif') await settings.setTextStyle(a.textStyle)
    if (typeof a.chatBackground === 'string') await settings.setChatBackground(a.chatBackground)
    showToast('主题包已应用')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '主题包读取失败', 3000)
  }
}

async function pickChatBg(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const data = await imageToDataUrl(file, 1400)
    await settings.setChatBackground(data)
    showToast('聊天背景已更新')
  } catch {
    showToast('这张图读不出来，换一张试试')
  }
}

async function exportData() {
  exportOpen.value = false
  const [characters, conversations, messages, memories, stickers] = await Promise.all([
    db.characters.toArray(),
    db.conversations.toArray(),
    db.messages.toArray(),
    db.memories.toArray(),
    db.stickers.toArray(),
  ])
  const payload = {
    app: 'qpersona',
    version: '0.21.6',
    exportedAt: new Date().toISOString(),
    characters,
    conversations,
    messages,
    memories,
    stickers,
    settings: {
      ...settings.snapshot(),
      profiles: settings.profiles.map((p) => ({
        ...p,
        apiKey: includeKeys.value ? p.apiKey : '',
      })),
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `qpersona-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  showToast(includeKeys.value ? '已导出完整备份（包含 API Key，别发给别人）' : '已导出备份（不含 API Key，其余设置和背景都在）', 3200)
}

function pickImport() {
  if (!confirmImport.value) {
    confirmImport.value = true
    showToast('再点一次选择文件，导入会覆盖当前数据', 2600)
    return
  }
  confirmImport.value = false
  importInput.value?.click()
}

async function importData(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (data?.app !== 'qpersona') throw new Error('不是 笺页 的备份文件')
    await db.transaction(
      'rw',
      [db.characters, db.conversations, db.messages, db.memories, db.stickers, db.kv],
      async () => {
        await db.messages.clear()
        await db.conversations.clear()
        await db.characters.clear()
        await db.memories.clear()
        await db.stickers.clear()
        if (Array.isArray(data.characters)) await db.characters.bulkPut(data.characters)
        if (Array.isArray(data.conversations)) await db.conversations.bulkPut(data.conversations)
        if (Array.isArray(data.messages)) await db.messages.bulkPut(data.messages)
        if (Array.isArray(data.memories)) await db.memories.bulkPut(data.memories)
        if (Array.isArray(data.stickers)) await db.stickers.bulkPut(data.stickers)
        if (data.settings) await db.kv.put({ key: 'settings', value: data.settings })
      },
    )
    showToast('导入完成，正在刷新…')
    setTimeout(() => location.reload(), 600)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '导入失败，文件格式不对', 3200)
  }
}

async function clearChats() {
  if (!confirmClearChats.value) {
    confirmClearChats.value = true
    return
  }
  await db.messages.clear()
  await db.conversations.toCollection().modify({ lastText: '聊天记录已清空', lastTs: Date.now(), unread: 0 })
  chat.$reset()
  await contacts.load()
  confirmClearChats.value = false
  showToast('聊天记录已清空，角色卡保留')
}

async function wipeAll() {
  if (!confirmWipe.value) {
    confirmWipe.value = true
    return
  }
  await db.delete()
  showToast('正在重置…')
  setTimeout(() => location.reload(), 500)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/me')
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">设置</div>
      <div style="width: 38px" />
    </header>

    <div class="scroll">
      <div class="group-title">账号</div>
      <div class="sheet-block">
        <button class="cell" @click="router.push('/profile')">
          <div class="cell-icon" style="background: #3b82f6"><CreateOutline /></div>
          <div class="cell__body">
            <div class="cell__title">编辑资料</div>
            <div class="cell__desc">{{ settings.user.nickname }} · 笺号 {{ settings.user.qqNumber }}</div>
          </div>
          <ChevronForward class="chev" />
        </button>
      </div>

      <div class="group-title">外观</div>
      <div class="sheet-block">
        <div class="cell" style="cursor: default">
          <div class="cell-icon" style="background: #5856d6"><MoonOutline /></div>
          <div class="cell__body"><div class="cell__title">主题</div></div>
        </div>
        <div class="seg-wrap">
          <div class="seg">
            <button
              v-for="t in themes"
              :key="t.value"
              class="seg__btn"
              :class="{ on: settings.theme === t.value }"
              @click="settings.setTheme(t.value)"
            >{{ t.label }}</button>
          </div>
        </div>
        <div class="cell" style="cursor: default">
          <div class="cell-icon" style="background: #0ea5e9"><GridOutline /></div>
          <div class="cell__body"><div class="cell__title">字体大小</div><div class="cell__desc">影响聊天气泡里的字</div></div>
        </div>
        <div class="seg-wrap">
          <div class="seg">
            <button
              v-for="f in fonts"
              :key="f.value"
              class="seg__btn"
              :class="{ on: settings.appearance.fontScale === f.value }"
              @click="settings.setFontScale(f.value)"
            >{{ f.label }}</button>
          </div>
        </div>
        <div class="cell" style="cursor: default">
          <div class="cell-icon" style="background: #64748b"><GridOutline /></div>
          <div class="cell__body"><div class="cell__title">文字风格</div><div class="cell__desc">聊天气泡里的字体</div></div>
        </div>
        <div class="seg-wrap">
          <div class="seg">
            <button class="seg__btn" :class="{ on: settings.appearance.textStyle === 'default' }" @click="settings.setTextStyle('default')">默认</button>
            <button class="seg__btn" :class="{ on: settings.appearance.textStyle === 'serif' }" @click="settings.setTextStyle('serif')">宋体</button>
          </div>
        </div>

        <div class="cell" style="cursor: default">
          <div class="cell-icon" style="background: #ff2d55"><ColorPaletteOutline /></div>
          <div class="cell__body"><div class="cell__title">我的气泡</div><div class="cell__desc">只改自己发出的消息</div></div>
        </div>
        <div class="bubbles">
          <button
            v-for="b in bubbles"
            :key="b.value"
            class="bubble-chip"
            :class="{ on: settings.appearance.bubble === b.value }"
            @click="settings.setBubble(b.value)"
          >
            <span class="bubble-chip__dot" :style="{ background: b.color }" />
            {{ b.label }}
          </button>
        </div>
        <div class="cell">
          <div class="cell-icon" style="background: #0ea5e9"><ImageOutline /></div>
          <div class="cell__body">
            <div class="cell__title">聊天背景</div>
            <div class="cell__desc">{{ settings.appearance.chatBackground ? '已设置自定义背景' : '默认的浅灰聊天底' }}</div>
          </div>
          <button class="mini-btn" @click="chatBgInput?.click()">上传</button>
          <button v-if="settings.appearance.chatBackground" class="mini-btn mini-btn--dim" @click="settings.setChatBackground('')">恢复</button>
        </div>
        <div class="theme-pack">
          <button class="mini-btn" @click="exportTheme">导出主题</button>
          <button class="mini-btn" @click="themeInput?.click()">导入主题</button>
        </div>
        <div class="hint" style="padding-top: 0">笺页 主题包（JSON），不是外部聊天软件的主题包。</div>
      </div>

      <div class="group-title">消息</div>
      <div class="sheet-block">
        <button class="cell" @click="settings.setFlag('notify', !settings.flags.notify)">
          <div class="cell-icon" style="background: #ff9f0a"><NotificationsOutline /></div>
          <div class="cell__body"><div class="cell__title">消息提醒</div></div>
          <span class="switch" :class="{ on: settings.flags.notify }" />
        </button>
        <button class="cell" @click="settings.setFlag('sound', !settings.flags.sound)">
          <div class="cell-icon" style="background: #22c55e"><VolumeHighOutline /></div>
          <div class="cell__body">
            <div class="cell__title">提示音</div>
            <div class="cell__desc">收消息时轻轻响一下</div>
          </div>
          <span class="switch" :class="{ on: settings.flags.sound }" />
        </button>
        <button class="cell" @click="settings.setChatPref('autoSplit', !settings.chat.autoSplit)">
          <div class="cell-icon" style="background: #0ea5e9"><ChatbubblesOutline /></div>
          <div class="cell__body">
            <div class="cell__title">自动拆气泡</div>
            <div class="cell__desc">多行回复拆成几条短消息，更像真人</div>
          </div>
          <span class="switch" :class="{ on: settings.chat.autoSplit }" />
        </button>
        <button class="cell" @click="settings.setChatPref('showTime', !settings.chat.showTime)">
          <div class="cell-icon" style="background: #8b5cf6"><TimeOutline /></div>
          <div class="cell__body">
            <div class="cell__title">显示时间</div>
            <div class="cell__desc">聊天里插入时间分隔</div>
          </div>
          <span class="switch" :class="{ on: settings.chat.showTime }" />
        </button>
      </div>

      <div class="group-title">AI 与自动化</div>
      <div class="sheet-block">
        <button class="cell" @click="router.push('/settings/ai')">
          <div class="cell-icon" style="background: linear-gradient(135deg,#5b8cff,#7b5bff)"><SparklesOutline /></div>
          <div class="cell__body">
            <div class="cell__title">AI 设置</div>
            <div class="cell__desc">模型方案 · 能力槽位 · 连接测试</div>
          </div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="router.push('/stickers')">
          <div class="cell-icon" style="background: #0891b2"><ImageOutline /></div>
          <div class="cell__body">
            <div class="cell__title">表情包管理</div>
            <div class="cell__desc">上传自己的表情，给 AI 写一句注解</div>
          </div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="settings.setChatPref('showUsage', !settings.chat.showUsage)">
          <div class="cell-icon" style="background: #14b8a6"><StatsChartOutline /></div>
          <div class="cell__body">
            <div class="cell__title">显示 token 消耗</div>
            <div class="cell__desc">每条回复下面显示用量和估算费用</div>
          </div>
          <span class="switch" :class="{ on: settings.chat.showUsage }" />
        </button>
        <button class="cell" @click="settings.setFlag('memory', !settings.flags.memory)">
          <div class="cell__body">
            <div class="cell__title">记忆总结</div>
            <div class="cell__desc">按下面设定的频率在后台整理</div>
          </div>
          <span class="switch" :class="{ on: settings.flags.memory }" />
        </button>
        <div class="cell" style="cursor: default">
          <div class="cell__body">
            <div class="cell__title">记忆总结频率</div>
            <div class="cell__desc">
              {{ settings.memoryPlan.mode === 'messages'
                ? `每 ${settings.memoryPlan.every} 条消息整理一次`
                : `每 ${settings.memoryPlan.minutes} 分钟最多整理一次` }}
            </div>
          </div>
        </div>
        <div class="seg-wrap">
          <div class="seg">
            <button class="seg__btn" :class="{ on: settings.memoryPlan.mode === 'messages' }" @click="settings.setMemoryPlan({ mode: 'messages' })">按消息</button>
            <button class="seg__btn" :class="{ on: settings.memoryPlan.mode === 'time' }" @click="settings.setMemoryPlan({ mode: 'time' })">按时间</button>
          </div>
        </div>
        <div v-if="settings.memoryPlan.mode === 'messages'" class="seg-wrap">
          <div class="seg">
            <button v-for="n in [20, 40, 80, 120]" :key="n" class="seg__btn" :class="{ on: settings.memoryPlan.every === n }" @click="settings.setMemoryPlan({ every: n })">{{ n }} 条</button>
          </div>
        </div>
        <div v-else class="seg-wrap">
          <div class="seg">
            <button v-for="n in [30, 60, 120, 240]" :key="n" class="seg__btn" :class="{ on: settings.memoryPlan.minutes === n }" @click="settings.setMemoryPlan({ minutes: n })">{{ n }} 分钟</button>
          </div>
        </div>
        <div class="custom-row">
          <span>自定义</span>
          <input
            class="num-input"
            type="number"
            :min="settings.memoryPlan.mode === 'messages' ? 5 : 5"
            :max="settings.memoryPlan.mode === 'messages' ? 500 : 1440"
            :value="settings.memoryPlan.mode === 'messages' ? settings.memoryPlan.every : settings.memoryPlan.minutes"
            @change="setMemoryCustom"
          />
          <span>{{ settings.memoryPlan.mode === 'messages' ? '条' : '分钟' }}</span>
        </div>
        <button class="cell" @click="settings.setProactive({ enabled: !settings.proactive.enabled })">
          <div class="cell__body">
            <div class="cell__title">AI 主动消息</div>
            <div class="cell__desc">安静一段时间后，按概率主动找你说话</div>
          </div>
          <span class="switch" :class="{ on: settings.proactive.enabled }" />
        </button>
        <template v-if="settings.proactive.enabled">
          <div class="cell" style="cursor: default">
            <div class="cell__body">
              <div class="cell__title">触发概率</div>
              <div class="cell__desc">到点后有多大概率真的发</div>
            </div>
            <span class="cell__value">{{ settings.proactive.probability }}%</span>
          </div>
          <div class="seg-wrap">
            <input
              class="slider"
              type="range"
              min="10"
              max="100"
              step="5"
              :value="settings.proactive.probability"
              @input="settings.setProactive({ probability: Number(($event.target as HTMLInputElement).value) })"
            />
          </div>
          <div class="custom-row">
            <span>自定义</span>
            <input class="num-input" type="number" min="1" max="100" :value="settings.proactive.probability" @change="setProbabilityCustom" />
            <span>%</span>
          </div>
          <div class="cell" style="cursor: default">
            <div class="cell__body"><div class="cell__title">安静多久后</div></div>
          </div>
          <div class="seg-wrap">
            <div class="seg">
              <button v-for="n in [15, 30, 60, 120]" :key="n" class="seg__btn" :class="{ on: settings.proactive.minutes === n }" @click="settings.setProactive({ minutes: n })">{{ n }} 分</button>
            </div>
          </div>
          <div class="custom-row">
            <span>自定义</span>
            <input class="num-input" type="number" min="1" max="1440" :value="settings.proactive.minutes" @change="setMinutesCustom" />
            <span>分钟</span>
          </div>
          <button class="cell" @click="settings.setProactive({ quietEnabled: !settings.proactive.quietEnabled })">
            <div class="cell__body">
              <div class="cell__title">免打扰时段</div>
              <div class="cell__desc">这段时间绝不主动发消息</div>
            </div>
            <span class="switch" :class="{ on: settings.proactive.quietEnabled }" />
          </button>
          <div v-if="settings.proactive.quietEnabled" class="quiet-row">
            <select
              class="select quiet-select"
              :value="settings.proactive.quietStart"
              @change="settings.setProactive({ quietStart: Number(($event.target as HTMLSelectElement).value) })"
            >
              <option v-for="h in 24" :key="h" :value="h - 1">{{ h - 1 }}:00</option>
            </select>
            <span>到</span>
            <select
              class="select quiet-select"
              :value="settings.proactive.quietEnd"
              @change="settings.setProactive({ quietEnd: Number(($event.target as HTMLSelectElement).value) })"
            >
              <option v-for="h in 24" :key="h" :value="h - 1">{{ h - 1 }}:00</option>
            </select>
          </div>
        </template>
        <button class="cell" @click="settings.setFlag('groupInterest', !settings.flags.groupInterest)">
          <div class="cell__body">
            <div class="cell__title">群聊兴趣调度</div>
            <div class="cell__desc">按兴趣值决定谁被叫醒</div>
          </div>
          <span class="switch" :class="{ on: settings.flags.groupInterest }" />
        </button>
        <button class="cell" @click="settings.setFlag('tts', !settings.flags.tts)">
          <div class="cell__body">
            <div class="cell__title">语音播报</div>
            <div class="cell__desc">用浏览器 TTS 把回复读出来</div>
          </div>
          <span class="switch" :class="{ on: settings.flags.tts }" />
        </button>
      </div>

      <div class="group-title">数据</div>
      <div class="sheet-block">
        <div class="cell" style="cursor: default">
          <div class="cell-icon" style="background: #64748b"><ServerOutline /></div>
          <div class="cell__body"><div class="cell__title">存储占用</div><div class="cell__desc">{{ counts }}</div></div>
          <span class="cell__value">{{ storageText }}</span>
        </div>
        <button class="cell" @click="pickImport">
          <div class="cell-icon" style="background: #6366f1"><CloudUploadOutline /></div>
          <div class="cell__body">
            <div class="cell__title" :style="confirmImport ? 'color: var(--danger)' : ''">
              {{ confirmImport ? '再点一次，选择备份文件' : '导入数据' }}
            </div>
            <div class="cell__desc">从导出的 JSON 恢复，会覆盖当前数据、设置和背景</div>
          </div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="exportOpen = true">
          <div class="cell-icon" style="background: #10b981"><CloudDownloadOutline /></div>
          <div class="cell__body">
            <div class="cell__title">导出数据</div>
            <div class="cell__desc">角色、聊天、记忆、表情包、设置、背景和头像</div>
          </div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="clearChats">
          <div class="cell-icon" style="background: #f59e0b"><TrashOutline /></div>
          <div class="cell__body">
            <div class="cell__title" :style="confirmClearChats ? 'color: var(--danger)' : ''">
              {{ confirmClearChats ? '再点一次，确认清空' : '清空所有聊天记录' }}
            </div>
            <div class="cell__desc">保留角色卡，只删消息</div>
          </div>
        </button>
        <button class="cell" @click="wipeAll">
          <div class="cell__icon" />
          <div class="cell__body">
            <div class="cell__title" :style="confirmWipe ? 'color: var(--danger)' : ''">
              {{ confirmWipe ? '再点一次，清空一切' : '清除全部数据' }}
            </div>
            <div class="cell__desc">角色、会话、设置、API Key 全部删除</div>
          </div>
        </button>
      </div>

      <div class="group-title">关于</div>
      <div class="sheet-block">
        <div class="cell" style="cursor: default">
          <div class="cell__body"><div class="cell__title">笺页 / JianYIE</div><div class="cell__desc">开源非商业 · 学习与演示用途</div></div>
          <span class="cell__value">0.21.6</span>
        </div>
      </div>

      <div class="foot">
        界面与图标均为原创；<br />
        当前版本不连接真实聊天服务，好友均为本地角色。
      </div>
    </div>

    <BottomSheet v-model="exportOpen" title="导出备份">
      <div class="hint" style="margin-bottom: 10px">
        包含角色卡、聊天记录、记忆、表情包、外观设置、聊天背景、个人资料、角色头像和主页背景。
        API Key 默认不导出，导入后重新填一次即可。
      </div>
      <button class="cell" @click="includeKeys = !includeKeys">
        <div class="cell__body">
          <div class="cell__title">包含 API Key</div>
          <div class="cell__desc">仅用于自己换机备份；带 Key 的文件等于账号钥匙</div>
        </div>
        <span class="switch" :class="{ on: includeKeys }" />
      </button>
      <template #footer>
        <button class="btn btn--ghost" @click="exportOpen = false">取消</button>
        <button class="btn" @click="exportData">导出</button>
      </template>
    </BottomSheet>

    <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importData" />
    <input ref="chatBgInput" type="file" accept="image/*" hidden @change="pickChatBg" />
    <input ref="themeInput" type="file" accept="application/json,.json" hidden @change="importTheme" />
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
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 14px;
  margin: 0 12px;
  overflow: hidden;
  border: 1px solid var(--line);
}
.cell-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #fff;
  flex: none;
}
.cell-icon svg {
  width: 18px;
  height: 18px;
}
.cell__icon {
  width: 30px;
  flex: none;
}
.group-title {
  padding: 18px 20px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.seg-wrap {
  padding: 0 14px 12px;
}
.seg {
  display: flex;
  gap: 4px;
  background: var(--bg-hover);
  border-radius: 10px;
  padding: 3px;
}
.seg__btn {
  flex: 1;
  height: 32px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-2);
  transition: all 0.15s;
}
.seg__btn.on {
  background: var(--bg-sheet);
  color: var(--text);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1);
}
.bubbles {
  display: flex;
  gap: 8px;
  padding: 0 14px 14px;
}
.bubble-chip {
  flex: 1;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--line-2);
  font-size: 12.5px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.bubble-chip.on {
  border-color: var(--brand);
  color: var(--brand);
  background: rgba(0, 153, 255, 0.06);
}
.theme-pack {
  display: flex;
  gap: 8px;
  padding: 0 16px 4px;
}
.theme-pack .mini-btn {
  margin-left: 0;
}
.mini-btn {
  font-size: 11.5px;
  padding: 5px 10px;
  border-radius: 8px;
  background: rgba(0, 153, 255, 0.1);
  color: var(--brand);
  flex: none;
  margin-left: 6px;
}
.mini-btn--dim {
  background: var(--bg-hover);
  color: var(--text-2);
}
.custom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 14px;
  font-size: 12px;
  color: var(--text-3);
}
.num-input {
  width: 88px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--bg-hover);
  color: var(--text);
  font-size: 13px;
  text-align: center;
}
.quiet-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 14px;
  font-size: 12px;
  color: var(--text-3);
}
.quiet-select {
  width: 96px;
  padding: 8px 10px;
  font-size: 13px;
}
.slider {
  width: 100%;
  accent-color: var(--brand);
}
.bubble-chip__dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
}
.foot {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.8;
  padding: 26px 24px;
}
</style>
