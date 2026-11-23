<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOutline,
  ChatbubblesOutline,
  ChevronBack,
  ChevronForward,
  CloudUploadOutline,
  CreateOutline,
  SparklesOutline,
} from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import Avatar from '@/ui/common/Avatar.vue'
import { parseCardFile, buildCustomCard, type ParsedCard } from '@/core/card'
import { imageToDataUrl } from '@/core/util'
import { useContactsStore } from '@/store/contacts'
import { showToast } from '@/ui/common/toast'

const route = useRoute()
const router = useRouter()
const contacts = useContactsStore()

const fileInput = ref<HTMLInputElement>()
const avatarInput = ref<HTMLInputElement>()
const avatarPreview = ref('')
const parsing = ref(false)
const parsed = ref<ParsedCard | null>(null)
const preview = ref(false)
const createOpen = ref(false)

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
  const action = String(route.query.action || '')
  if (action === 'create') createOpen.value = true
  if (action === 'import') window.setTimeout(() => fileInput.value?.click(), 260)
  if (action === 'distill') showToast('聊天记录培养 · 下一步就做')
})

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
    </div>

    <input ref="fileInput" type="file" accept=".json,.png,application/json,image/png" hidden @change="onFile" />
    <input ref="avatarInput" type="file" accept="image/*" hidden @change="pickCreateAvatar" />

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
        <div class="hint">添加后会在「消息」里生成一条 QQ 单聊，开场白自动成为第一条消息。</div>
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
        <span class="field__label">QQ 昵称（可选）</span>
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
