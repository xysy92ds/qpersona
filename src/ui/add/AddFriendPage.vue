<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOutline,
  ChatbubblesOutline,
  ChevronBack,
  ChevronForward,
  CloudUploadOutline,
  CreateOutline,
  GlobeOutline,
  RefreshOutline,
  SearchOutline,
  SettingsOutline,
  ShareSocialOutline,
  SparklesOutline,
} from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import Avatar from '@/ui/common/Avatar.vue'
import { parseCardFile, buildCustomCard, type ParsedCard } from '@/core/card'
import { imageToDataUrl } from '@/core/util'
import { useContactsStore } from '@/store/contacts'
import { usePlazaStore } from '@/store/plaza'
import { useSettingsStore } from '@/store/settings'
import { plazaTags, type PlazaCard } from '@/core/plaza'
import { showToast } from '@/ui/common/toast'

const route = useRoute()
const router = useRouter()
const contacts = useContactsStore()
const plaza = usePlazaStore()
const settings = useSettingsStore()

const fileInput = ref<HTMLInputElement>()
const avatarInput = ref<HTMLInputElement>()
const avatarPreview = ref('')
const parsing = ref(false)
const parsed = ref<ParsedCard | null>(null)
const preview = ref(false)
const createOpen = ref(false)
const tab = ref<'add' | 'plaza'>('add')
const plazaPreview = ref<PlazaCard | null>(null)
const plazaBusy = ref(false)
const plazaSettings = ref(false)
const plazaShare = ref(false)
const plazaUrlDraft = ref(settings.plazaUrl)

const tags = computed(() => plazaTags(plaza.cards).slice(0, 12))
const plazaPreviewOpen = computed({
  get: () => !!plazaPreview.value,
  set: (v: boolean) => {
    if (!v) plazaPreview.value = null
  },
})

const form = reactive({
  name: '',
  nickname: '',
  description: '',
  personality: '',
  firstMes: '',
  tags: '',
})

function pickFile() {
  fileInput.value?.click()
}

async function pickCreateAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    avatarPreview.value = await imageToDataUrl(file, 360)
  } catch {
    showToast('这张图读不出来，换一张试试')
  }
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  parsing.value = true
  try {
    const result = await parseCardFile(file)
    if (result.avatar) result.ext.qq.avatar = result.avatar
    parsed.value = result
    preview.value = true
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), 4200)
  } finally {
    parsing.value = false
  }
}

async function confirmImport() {
  if (!parsed.value) return
  const ch = await contacts.addCharacter(parsed.value.card, parsed.value.ext)
  preview.value = false
  const conv = contacts.conversations.find((c) => c.characterId === ch.id && c.profile === 'qq')
  showToast(`「${ch.card.name}」已添加为好友`)
  if (conv) router.replace(`/chat/${conv.id}`)
  else router.replace('/')
}

async function createCharacter() {
  if (!form.name.trim()) {
    showToast('先给角色起个名字')
    return
  }
  const { card, ext } = buildCustomCard({
    name: form.name,
    description: form.description,
    personality: form.personality,
    firstMes: form.firstMes,
    tags: form.tags
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  })
  if (form.nickname.trim()) ext.qq.nickname = form.nickname.trim()
  if (avatarPreview.value) ext.qq.avatar = avatarPreview.value
  const ch = await contacts.addCharacter(card, ext)
  createOpen.value = false
  const conv = contacts.conversations.find((c) => c.characterId === ch.id && c.profile === 'qq')
  showToast(`「${ch.card.name}」已创建`)
  if (conv) router.replace(`/chat/${conv.id}`)
  else router.replace('/')
}

onMounted(() => {
  if (route.query.tab === 'plaza') openPlaza()
  const action = String(route.query.action || '')
  if (action === 'create') createOpen.value = true
  if (action === 'import') window.setTimeout(() => fileInput.value?.click(), 260)
  if (action === 'distill') showToast('聊天记录培养 · 下一步就做')
})

function openPlaza() {
  tab.value = 'plaza'
  void plaza.load()
}

async function importPlaza() {
  if (!plazaPreview.value || plazaBusy.value) return
  plazaBusy.value = true
  try {
    const item = plazaPreview.value
    const ch = await plaza.importCard(item)
    plazaPreview.value = null
    const conv = contacts.conversations.find((c) => c.characterId === ch.id && c.profile === 'qq')
    showToast(`「${ch.card.name}」已从广场添加`)
    if (conv) router.replace(`/chat/${conv.id}`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '导入失败', 3000)
  } finally {
    plazaBusy.value = false
  }
}

async function savePlazaUrl() {
  await settings.setPlazaUrl(plazaUrlDraft.value)
  plazaSettings.value = false
  await plaza.load(true)
}

async function resetPlazaUrl() {
  plazaUrlDraft.value = ''
  await settings.setPlazaUrl('')
  await plaza.load(true)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/contacts')
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">添加朋友</div>
      <div style="width: 36px" />
    </header>

    <div class="scroll">
      <div class="tabs">
        <button class="tabs__btn" :class="{ on: tab === 'add' }" @click="tab = 'add'">添加</button>
        <button class="tabs__btn" :class="{ on: tab === 'plaza' }" @click="openPlaza">广场</button>
      </div>

      <template v-if="tab === 'add'">
      <div class="banner">
        <div class="banner__title">这里没有真实好友</div>
        <div class="banner__text">三种方式造一个角色：导入酒馆卡、从零捏一个，或者用聊天记录培养。</div>
      </div>

      <div class="sheet-block options">
        <button class="option" :disabled="parsing" @click="pickFile">
          <div class="option__icon" style="background: linear-gradient(135deg,#4facfe,#3b82f6)">
            <CloudUploadOutline />
          </div>
          <div class="option__body">
            <div class="option__title">导入酒馆角色卡</div>
            <div class="option__desc">支持 SillyTavern V2 / V3，JSON 或 PNG 内嵌卡</div>
          </div>
          <span v-if="parsing" class="option__state">解析中…</span>
          <ChevronForward v-else class="chev" />
        </button>

        <button class="option" @click="createOpen = true">
          <div class="option__icon" style="background: linear-gradient(135deg,#f6a609,#f56e0f)">
            <CreateOutline />
          </div>
          <div class="option__body">
            <div class="option__title">新建角色</div>
            <div class="option__desc">直接写名字、性格和开场白，一步到位</div>
          </div>
          <ChevronForward class="chev" />
        </button>

        <button class="option" @click="router.push('/distill')">
          <div class="option__icon" style="background: linear-gradient(135deg,#a78bfa,#7c3aed)">
            <SparklesOutline />
          </div>
          <div class="option__body">
            <div class="option__title">用聊天记录培养</div>
            <div class="option__desc">上传 txt 或截图，统计语感，两轮反馈后生成角色卡</div>
          </div>
          <ChevronForward class="chev" />
        </button>
      </div>

      <div class="hint">
        <BookOutline style="width: 13px; height: 13px; vertical-align: -2px" />
        导入的卡片只保存在本地。角色卡字段遵循 SillyTavern V2 规范，项目自有字段放在 extensions.qpersona 里。
      </div>
      </template>

      <template v-else>
        <div class="plaza-search">
          <SearchOutline />
          <input v-model="plaza.query" placeholder="搜角色、标签、作者" />
          <button aria-label="刷新" @click="plaza.load(true)"><RefreshOutline /></button>
        </div>

        <div class="plaza-bar">
          <span>{{ plaza.visible.length }} 张卡</span>
          <div>
            <button @click="plazaSettings = true"><SettingsOutline /> 地址</button>
            <button @click="plazaShare = true"><ShareSocialOutline /> 上传</button>
          </div>
        </div>

        <div class="tag-row">
          <button class="tag-chip" :class="{ on: !plaza.tag }" @click="plaza.tag = ''">全部</button>
          <button
            v-for="t in tags"
            :key="t.tag"
            class="tag-chip"
            :class="{ on: plaza.tag === t.tag }"
            @click="plaza.tag = plaza.tag === t.tag ? '' : t.tag"
          >{{ t.tag }} · {{ t.count }}</button>
        </div>

        <div class="seg-wrap">
          <div class="seg">
            <button class="seg__btn" :class="{ on: plaza.sort === 'hot' }" @click="plaza.sort = 'hot'">热门</button>
            <button class="seg__btn" :class="{ on: plaza.sort === 'new' }" @click="plaza.sort = 'new'">最新</button>
          </div>
        </div>

        <div v-if="plaza.loading" class="hint" style="text-align: center">加载广场中…</div>
        <div v-else-if="plaza.error" class="plaza-error">
          <div>{{ plaza.error }}</div>
          <button class="mini" @click="plaza.load(true)">重试</button>
        </div>
        <div v-else-if="!plaza.visible.length" class="hint" style="text-align: center">
          没有匹配的卡片，换个关键词或标签试试。
        </div>
        <div v-else class="plaza-list">
          <button v-for="item in plaza.visible" :key="item.id" class="plaza-card" @click="plazaPreview = item">
            <Avatar :name="item.card.name" :src="item.avatar || item.qq.avatar" :size="52" />
            <div class="plaza-card__body">
              <div class="plaza-card__top">
                <span class="plaza-card__name">{{ item.card.name }}</span>
                <span class="plaza-card__author">{{ item.author }}</span>
              </div>
              <div class="plaza-card__desc">{{ item.card.description || item.card.personality || '（没有简介）' }}</div>
              <div class="plaza-card__tags">
                <span v-for="t in (item.card.tags ?? []).slice(0, 4)" :key="t">{{ t }}</span>
              </div>
              <div class="plaza-card__meta">{{ item.downloads }} 次添加</div>
            </div>
          </button>
        </div>

        <div class="hint">
          <GlobeOutline style="width: 13px; height: 13px; vertical-align: -2px" />
          广场读的是一份静态 JSON；别人上传需要维护者合并或自己的地址，详见 docs/plaza.md。
        </div>
      </template>
    </div>

    <input ref="fileInput" type="file" accept=".json,.png,application/json,image/png" hidden @change="onFile" />
    <input ref="avatarInput" type="file" accept="image/*" hidden @change="pickCreateAvatar" />

    <!-- 广场卡片预览 -->
    <BottomSheet v-model="plazaPreviewOpen" title="广场角色">
      <template v-if="plazaPreview">
        <div class="preview">
          <Avatar :name="plazaPreview.card.name" :src="plazaPreview.avatar || plazaPreview.qq.avatar" :size="64" />
          <div class="preview__body">
            <div class="preview__name">{{ plazaPreview.card.name }}</div>
            <div class="preview__meta">作者：{{ plazaPreview.author }} · {{ plazaPreview.downloads }} 次添加</div>
            <div v-if="(plazaPreview.card.tags ?? []).length" class="preview__tags">
              <span v-for="t in plazaPreview.card.tags ?? []" :key="t" class="tag">{{ t }}</span>
            </div>
          </div>
        </div>
        <div v-if="plazaPreview.card.description" class="preview__block">
          <div class="preview__label">设定</div>
          <p>{{ plazaPreview.card.description }}</p>
        </div>
        <div v-if="plazaPreview.card.first_mes" class="preview__block">
          <div class="preview__label">开场白</div>
          <p class="quote">{{ plazaPreview.card.first_mes }}</p>
        </div>
        <div class="hint">第三方角色卡，设定和提示词由作者提供；添加前自己看一眼。</div>
      </template>
      <template #footer>
        <button class="btn btn--ghost" @click="plazaPreview = null">取消</button>
        <button class="btn" :disabled="plazaBusy" @click="importPlaza">{{ plazaBusy ? '添加中…' : '添加为好友' }}</button>
      </template>
    </BottomSheet>

    <!-- 广场地址 -->
    <BottomSheet v-model="plazaSettings" title="广场地址">
      <div class="hint" style="margin-bottom: 10px">
        留空使用内置示例广场。也可以填自己的 GitHub Raw / 静态站点上的 cards.json。
      </div>
      <label class="field">
        <span class="field__label">cards.json 地址</span>
        <input v-model="plazaUrlDraft" class="input" placeholder="https://example.com/plaza/cards.json" />
      </label>
      <div class="hint">当前来源：{{ plaza.source || '内置' }}</div>
      <template #footer>
        <button class="btn btn--ghost" @click="resetPlazaUrl">恢复内置</button>
        <button class="btn" @click="savePlazaUrl">保存并刷新</button>
      </template>
    </BottomSheet>

    <!-- 上传说明 -->
    <BottomSheet v-model="plazaShare" title="怎么把自己的卡放上广场">
      <div class="help-list">
        <p><b>没有服务器也能分享：</b>在角色页导出 V2 JSON，发给广场维护者，或者提一个 PR / Issue，合并后就能被搜到。</p>
        <p><b>想自己开一个广场：</b>把 cards.json 放到 GitHub Pages、Cloudflare Pages 或任意静态空间，在上面的「广场地址」里填链接。</p>
        <p><b>想要实时上传：</b>需要后端（Supabase / Cloudflare D1 + Worker 等）。静态托管做不到「任何人打开就能提交」。</p>
        <p class="dim">公开前删掉聊天记录、API Key 和私人信息；角色卡里也可能带作者的提示词，添加前自己判断。</p>
      </div>
      <template #footer>
        <button class="btn btn--block" @click="plazaShare = false">知道了</button>
      </template>
    </BottomSheet>

    <!-- 导入预览 -->
    <BottomSheet v-model="preview" title="确认角色">
      <template v-if="parsed">
        <div class="preview">
          <Avatar :name="parsed.card.name" :src="parsed.avatar" :size="64" />
          <div class="preview__body">
            <div class="preview__name">{{ parsed.card.name || '未命名角色' }}</div>
            <div class="preview__meta">{{ parsed.format === 'png' ? 'PNG 内嵌卡' : 'JSON 角色卡' }}</div>
            <div v-if="parsed.card.tags?.length" class="preview__tags">
              <span v-for="t in parsed.card.tags.slice(0, 5)" :key="t" class="tag">{{ t }}</span>
            </div>
          </div>
        </div>
        <div v-if="parsed.card.description" class="preview__block">
          <div class="preview__label">设定</div>
          <p>{{ parsed.card.description }}</p>
        </div>
        <div v-if="parsed.card.first_mes" class="preview__block">
          <div class="preview__label">开场白</div>
          <p class="quote">{{ parsed.card.first_mes }}</p>
        </div>
        <div v-if="parsed.warnings.length" class="warn">
          <div v-for="w in parsed.warnings" :key="w">· {{ w }}</div>
        </div>
        <div class="hint">添加后会在「消息」里生成一条 单聊，开场白自动成为第一条消息。</div>
      </template>
      <template #footer>
        <button class="btn btn--ghost" @click="preview = false">取消</button>
        <button class="btn" @click="confirmImport">添加为好友</button>
      </template>
    </BottomSheet>

    <!-- 新建角色 -->
    <BottomSheet v-model="createOpen" title="新建角色">
      <div class="create-avatar">
        <button class="create-avatar__btn" @click="avatarInput?.click()">
          <Avatar :name="form.name || '新朋友'" :src="avatarPreview" :size="64" />
          <span class="create-avatar__hint">换头像</span>
        </button>
        <div class="create-avatar__desc">
          <div class="create-avatar__title">头像</div>
          <div>不上传就按名字生成一个渐变色头像</div>
          <button v-if="avatarPreview" class="mini" @click="avatarPreview = ''">恢复默认</button>
        </div>
      </div>
      <label class="field">
        <span class="field__label">名字 <i>*</i></span>
        <input v-model="form.name" class="input" maxlength="24" placeholder="例如：林知夏" />
      </label>
      <label class="field">
        <span class="field__label">昵称（可选）</span>
        <input v-model="form.nickname" class="input" maxlength="16" placeholder="聊天列表里显示的名字" />
      </label>
      <label class="field">
        <span class="field__label">简介 / 身份</span>
        <textarea v-model="form.description" class="textarea" maxlength="600" placeholder="TA 是谁，做什么，住在哪……" />
      </label>
      <label class="field">
        <span class="field__label">性格与说话方式</span>
        <textarea v-model="form.personality" class="textarea" maxlength="600" placeholder="说话快还是慢？有什么口头禅？" />
      </label>
      <label class="field">
        <span class="field__label">开场白</span>
        <input v-model="form.firstMes" class="input" maxlength="200" placeholder="TA 主动发来的第一句话" />
      </label>
      <label class="field">
        <span class="field__label">兴趣标签（逗号分隔）</span>
        <input v-model="form.tags" class="input" placeholder="书, 猫, 下雨" />
      </label>
      <template #footer>
        <button class="btn btn--ghost" @click="createOpen = false">取消</button>
        <button class="btn" @click="createCharacter"><ChatbubblesOutline /> 创建</button>
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
  padding-bottom: 24px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin: 10px 12px 0;
  padding: 3px;
  background: var(--bg-hover);
  border-radius: 10px;
}
.tabs__btn {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-2);
}
.tabs__btn.on {
  background: var(--bg-sheet);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.plaza-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px;
  padding: 0 12px;
  height: 40px;
  background: var(--bg-sheet);
  border-radius: 10px;
  border: 1px solid var(--line);
}
.plaza-search svg {
  width: 16px;
  height: 16px;
  color: var(--text-3);
  flex: none;
}
.plaza-search input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  background: transparent;
  color: var(--text);
  outline: none;
}
.seg-wrap {
  padding: 0 12px 8px;
}
.seg {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-hover);
  border-radius: 9px;
}
.seg__btn {
  flex: 1;
  padding: 6px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-2);
}
.seg__btn.on {
  background: var(--bg-sheet);
  color: var(--text);
  font-weight: 600;
}
.plaza-search button {
  color: var(--text-3);
  display: grid;
  place-items: center;
}
.plaza-search button svg {
  width: 17px;
  height: 17px;
}
.plaza-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 6px;
  font-size: 11.5px;
  color: var(--text-3);
}
.plaza-bar div {
  display: flex;
  gap: 8px;
}
.plaza-bar button {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  color: var(--brand);
}
.plaza-bar button svg {
  width: 13px;
  height: 13px;
}
.tag-row {
  display: flex;
  gap: 7px;
  padding: 2px 12px 8px;
  overflow-x: auto;
  flex-wrap: nowrap;
}
.tag-chip {
  flex: none;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--bg-hover);
  font-size: 11px;
  color: var(--text-2);
}
.tag-chip.on {
  background: rgba(0, 153, 255, 0.12);
  color: var(--brand);
}
.plaza-list {
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plaza-card {
  display: flex;
  gap: 11px;
  text-align: left;
  padding: 12px;
  background: var(--bg-sheet);
  border-radius: 13px;
  border: 1px solid var(--line);
}
.plaza-card:active {
  background: var(--bg-hover);
}
.plaza-card__body {
  flex: 1;
  min-width: 0;
}
.plaza-card__top {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.plaza-card__name {
  font-size: 14px;
  font-weight: 600;
}
.plaza-card__author {
  font-size: 10.5px;
  color: var(--text-3);
}
.plaza-card__desc {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plaza-card__tags {
  display: flex;
  gap: 4px;
  margin-top: 5px;
  flex-wrap: wrap;
}
.plaza-card__tags span {
  font-size: 9.5px;
  color: var(--brand);
  background: rgba(0, 153, 255, 0.09);
  padding: 1px 5px;
  border-radius: 4px;
}
.plaza-card__meta {
  margin-top: 5px;
  font-size: 10px;
  color: var(--text-3);
}
.plaza-error {
  margin: 12px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 77, 79, 0.08);
  color: var(--danger);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.help-list p {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}
.help-list .dim {
  color: var(--text-3);
  font-size: 11.5px;
}
.banner {
  margin: 12px 12px 14px;
  padding: 18px 16px;
  border-radius: 16px;
  color: #fff;
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(255, 255, 255, 0.28), transparent 55%),
    linear-gradient(135deg, #2fb6ff, #0b6fe0);
  box-shadow: 0 10px 24px rgba(11, 111, 224, 0.25);
}
.banner__title {
  font-size: 17px;
  font-weight: 600;
}
.banner__text {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 6px;
  line-height: 1.6;
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 14px;
  margin: 0 10px;
  overflow: hidden;
}
.option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 14px;
  border-bottom: 1px solid var(--line);
}
.option:last-child {
  border-bottom: none;
}
.option:disabled {
  opacity: 0.6;
}
.option:active {
  background: var(--bg-hover);
}
.option__icon {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  color: #fff;
  display: grid;
  place-items: center;
  flex: none;
}
.option__icon svg {
  width: 24px;
  height: 24px;
}
.option__body {
  flex: 1;
  min-width: 0;
}
.option__title {
  font-size: 15px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}
.option__desc {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 3px;
  line-height: 1.45;
}
.option__state {
  font-size: 12px;
  color: var(--brand);
}
.soon {
  font-size: 9.5px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(124, 58, 237, 0.12);
  color: #7c3aed;
}
.create-avatar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px 6px;
}
.create-avatar__btn {
  position: relative;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
}
.create-avatar__hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 20px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 9.5px;
  line-height: 20px;
  text-align: center;
}
.create-avatar__desc {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}
.create-avatar__title {
  font-size: 14px;
  color: var(--text);
  font-weight: 500;
  margin-bottom: 2px;
}
.mini {
  margin-top: 6px;
  font-size: 11px;
  color: var(--brand);
}
.preview {
  display: flex;
  gap: 14px;
  padding: 6px 16px 12px;
  align-items: center;
}
.preview__name {
  font-size: 18px;
  font-weight: 600;
}
.preview__meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}
.preview__tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 7px;
}
.tag {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-2);
}
.preview__block {
  padding: 4px 16px 10px;
}
.preview__label {
  font-size: 11.5px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.preview__block p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text);
  max-height: 132px;
  overflow-y: auto;
}
.preview__block .quote {
  color: var(--text-2);
  border-left: 2px solid var(--line-2);
  padding-left: 10px;
}
.warn {
  margin: 2px 16px 8px;
  padding: 9px 11px;
  border-radius: 9px;
  background: rgba(255, 159, 10, 0.1);
  color: #b45309;
  font-size: 12px;
  line-height: 1.6;
}
i {
  color: var(--danger);
  font-style: normal;
}
</style>
