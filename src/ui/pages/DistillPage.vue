<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronBack, CloudUploadOutline } from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { useSettingsStore } from '@/store/settings'
import {
  parseChatText,
  computeStats,
  generateDraft,
  reviseDraft,
  draftToCard,
  generateDraftFromNotes,
  type ParseResult,
  type DistillStats,
  type PersonaDraft,
  type Turn,
} from '@/core/distill'
import { emptyExt } from '@/core/card'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const contacts = useContactsStore()
const settings = useSettingsStore()

const step = ref(1)
const raw = ref('')
const parsed = ref<ParseResult | null>(null)
const target = ref('')
const stats = ref<DistillStats | null>(null)
const draft = ref<PersonaDraft | null>(null)
const feedback = ref('')
const round = ref(1)
const busy = ref(false)
const status = ref('')
const error = ref('')
const help = ref(false)
const notesOpen = ref(false)
const notes = ref({ name: '', style: '', examples: '' })

const textInput = ref<HTMLInputElement>()

const userNick = computed(() => settings.user.nickname)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/add')
}

function readFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    showToast('文件太大，建议只导出最近几千条')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    raw.value = String(reader.result ?? '')
    showToast('文件已读入，点「解析」继续')
  }
  reader.readAsText(file, 'utf-8')
}

function parse() {
  if (!raw.value.trim()) {
    showToast('先粘贴聊天记录或选择 txt 文件')
    return
  }
  const result = parseChatText(raw.value)
  if (!result.turns.length) {
    error.value = '没有识别到任何消息。确认导出格式是「---- 日期 ---- / [时间] 昵称：内容」。'
    return
  }
  parsed.value = result
  error.value = ''
  const candidates = result.senders.filter((s) => s.name !== userNick.value)
  target.value = (candidates[0] ?? result.senders[0])?.name ?? ''
  step.value = 2
}

async function generateFromNotes() {
  if (!notes.value.name.trim()) {
    showToast('先写个名字')
    return
  }
  const profile = settings.profileFor('text_main')
  if (!profile) {
    error.value = '还没有配置文本模型，去「AI 设置」加一个再试。'
    return
  }
  busy.value = true
  error.value = ''
  status.value = '正在写角色卡…'
  try {
    stats.value = null
    draft.value = await generateDraftFromNotes(profile, {
      name: notes.value.name.trim(),
      style: notes.value.style.trim(),
      examples: notes.value.examples.trim(),
      userName: userNick.value,
    })
    notesOpen.value = false
    step.value = 3
    round.value = 1
    feedback.value = ''
  } catch (e) {
    error.value = `生成失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = false
    status.value = ''
  }
}

async function generate() {
  if (!parsed.value || !target.value) return
  const profile = settings.profileFor('text_main')
  if (!profile) {
    error.value = '还没有配置文本模型，去「AI 设置」加一个再试。'
    return
  }
  busy.value = true
  error.value = ''
  status.value = '正在统计语感…'
  try {
    const s = computeStats(parsed.value.turns, target.value)
    if (!s.targetCount) throw new Error('这个昵称下没有消息，换一个发送者试试')
    stats.value = s
    status.value = '正在写角色卡…'
    draft.value = await generateDraft(profile, s, target.value, userNick.value)
    step.value = 3
    round.value = 1
    feedback.value = ''
  } catch (e) {
    error.value = `生成失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = false
    status.value = ''
  }
}

async function revise() {
  if (!draft.value || !stats.value) return
  if (!feedback.value.trim()) {
    showToast('先写两句哪里不像')
    return
  }
  const profile = settings.profileFor('text_main')
  if (!profile) return
  busy.value = true
  error.value = ''
  status.value = '正在按你的建议修改…'
  try {
    draft.value = await reviseDraft(profile, draft.value, feedback.value, stats.value)
    feedback.value = ''
    if (round.value === 1) {
      round.value = 2
      step.value = 4
      showToast('改好了，再提一轮建议，或者直接定稿')
    } else {
      step.value = 5
      showToast('第二版也改好了，可以保存了')
    }
  } catch (e) {
    error.value = `修改失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = false
    status.value = ''
  }
}

function finalize() {
  step.value = 5
}

async function save() {
  if (!draft.value) return
  const card = draftToCard(draft.value)
  if (!card.name.trim()) card.name = target.value || '新角色'
  const ext = emptyExt(card.name, 'distill')
  ext.qq.nickname = card.name
  ext.qq.interests = draft.value.tags
  ext.stats = (stats.value ?? undefined) as unknown as Record<string, unknown> | undefined
  const ch = await contacts.addCharacter(card, ext)
  const conv = contacts.conversations.find((c) => c.characterId === ch.id && c.profile === 'qq')
  showToast(`「${card.name}」已经加为好友`)
  if (conv) router.replace(`/chat/${conv.id}`)
  else router.replace('/')
}

const particleText = computed(() => {
  if (!stats.value) return ''
  return Object.entries(stats.value.particles)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}×${v}`)
    .join('  ')
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">用聊天记录培养</div>
      <div style="width: 38px" />
    </header>

    <div class="scroll">
      <div class="steps">
        <span v-for="n in 5" :key="n" class="steps__dot" :class="{ on: step >= n }" />
      </div>

      <!-- 1. 输入 -->
      <template v-if="step === 1">
        <div class="intro">
          <div class="intro__title">先有记录，才有人设</div>
          <div class="intro__text">
            支持从电脑版聊天软件导出的 txt，也可以直接粘贴。解析后会先统计句长、标点、口头禅，
            再让模型写卡——先数，再写。
          </div>
        </div>

        <div class="actions">
          <button class="btn btn--block" @click="textInput?.click()">
            <CloudUploadOutline /> 选择 txt 文件
          </button>
          <button class="btn btn--ghost btn--block" @click="notesOpen = true">没有记录？凭印象写几句</button>
          <button class="link" @click="help = true">拿不到聊天记录？看这里</button>
        </div>

        <label class="field">
          <span class="field__label">或者直接粘贴</span>
          <textarea
            v-model="raw"
            class="textarea paste"
            placeholder="---- 2023-11-18 ----&#10;[17:03:21] 昵称：在吗&#10;[17:04:02] 我：在"
          />
        </label>

        <div v-if="error" class="error">{{ error }}</div>
        <div class="foot">
          <button class="btn btn--block" :disabled="!raw.trim() || busy" @click="parse">解析记录</button>
        </div>
      </template>

      <!-- 2. 统计 -->
      <template v-else-if="step === 2 && parsed">
        <div class="result">
          识别到 <b>{{ parsed.recognized }}</b> 条消息，{{ parsed.senders.length }} 个发送者。
          <span v-if="parsed.unrecognized.length" class="warn">
            另有 {{ parsed.unrecognized.length }} 行没认出来，已忽略。
          </span>
          <span v-if="(parsed.senders.find(s => s.name === target)?.count ?? 0) < 30" class="warn">
            样本偏少，生成会更依赖你的两轮建议。
          </span>
        </div>

        <div class="group-title">哪个是角色本人？</div>
        <div class="chips">
          <button
            v-for="s in parsed.senders"
            :key="s.name"
            class="chip"
            :class="{ on: target === s.name }"
            @click="target = s.name"
          >{{ s.name }} · {{ s.count }}</button>
        </div>

        <div class="group-title">原话样本</div>
        <div class="samples">
          <p v-for="(l, i) in parsed.turns.filter(t => t.speaker === target).slice(-12)" :key="i">{{ l.text }}</p>
          <div v-if="!parsed.turns.some(t => t.speaker === target)" class="hint">这个发送者没有消息。</div>
        </div>

        <div v-if="parsed.unrecognized.length" class="group-title">未识别的行</div>
        <pre v-if="parsed.unrecognized.length" class="unrecognized">{{ parsed.unrecognized.join('\n') }}</pre>

        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="status" class="status">{{ status }}</div>
        <div class="foot row">
          <button class="btn btn--ghost" :disabled="busy" @click="step = 1">上一步</button>
          <button class="btn" :disabled="busy || !target" @click="generate">
            {{ busy ? '处理中…' : '生成角色卡' }}
          </button>
        </div>
      </template>

      <!-- 3/4. 草稿与反馈 -->
      <template v-else-if="(step === 3 || step === 4) && draft">
        <div class="draft-head">
          <div>
            <div class="draft-name">{{ draft.name }}</div>
            <div class="draft-tags">
              <span v-for="t in draft.tags" :key="t">{{ t }}</span>
            </div>
          </div>
          <span class="round">第 {{ step === 3 ? 1 : 2 }} 轮</span>
        </div>

        <div class="draft-card">
          <div class="prop"><label>简介</label><p>{{ draft.description }}</p></div>
          <div class="prop"><label>性格</label><p>{{ draft.personality }}</p></div>
          <div class="prop" v-if="draft.style_rules"><label>语言习惯</label><p>{{ draft.style_rules }}</p></div>
          <div class="prop"><label>场景</label><p>{{ draft.scenario || '（未写）' }}</p></div>
          <div class="prop"><label>开场白</label><p>{{ draft.first_mes || '（未写）' }}</p></div>
          <div class="prop"><label>对话示例</label><pre>{{ draft.mes_example || '（未写）' }}</pre></div>
        </div>

        <label class="field">
          <span class="field__label">{{ step === 3 ? '第一轮：哪里不像？' : '第二轮：还想改什么？' }}</span>
          <textarea
            v-model="feedback"
            class="textarea"
            :placeholder="step === 3 ? '例如：她不会一次说这么多；应该更冷一点，少用感叹号' : '例如：开头那句太客气了，换成她平时会说的一句'"
          />
        </label>

        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="status" class="status">{{ status }}</div>
        <div class="foot row">
          <button class="btn btn--ghost" :disabled="busy" @click="finalize">就这样，定稿</button>
          <button class="btn" :disabled="busy" @click="revise">
            {{ busy ? '修改中…' : step === 3 ? '按建议改一版' : '再改一版' }}
          </button>
        </div>
      </template>

      <!-- 5. 定稿 -->
      <template v-else-if="step === 5 && draft">
        <div class="final">
          <div class="final__name">{{ draft.name }}</div>
          <p>{{ draft.description }}</p>
          <p class="dim">{{ draft.personality }}</p>
          <p v-if="draft.style_rules" class="dim">语言习惯：{{ draft.style_rules }}</p>
          <div v-if="draft.first_mes" class="quote">「{{ draft.first_mes }}」</div>
        </div>
        <div class="hint" style="text-align: center">
          保存后会生成一张 V2 角色卡，并自动建一条 单聊。记忆从零开始。
        </div>
        <div class="foot row">
          <button class="btn btn--ghost" @click="step = 3">再改改</button>
          <button class="btn" @click="save">保存为好友</button>
        </div>
      </template>
    </div>

    <input ref="textInput" type="file" accept=".txt,text/plain" hidden @change="readFile" />

    <BottomSheet v-model="notesOpen" title="凭印象写几句">
      <label class="field">
        <span class="field__label">名字</span>
        <input v-model="notes.name" class="input" maxlength="20" placeholder="TA 叫什么" />
      </label>
      <label class="field">
        <span class="field__label">说话方式 / 性格</span>
        <textarea v-model="notes.style" class="textarea" maxlength="400" placeholder="例如：回消息很慢，喜欢用「嗯」「哦」，熟了之后话很多；被夸会装没听见" />
      </label>
      <label class="field">
        <span class="field__label">记得的原话（可选）</span>
        <textarea v-model="notes.examples" class="textarea" maxlength="600" placeholder="每行一句，例如：&#10;还没走啊？我刚锁门&#10;那你早点回去" />
      </label>
      <template #footer>
        <button class="btn btn--ghost" @click="notesOpen = false">取消</button>
        <button class="btn" :disabled="busy" @click="generateFromNotes">生成草稿</button>
      </template>
    </BottomSheet>

    <BottomSheet v-model="help" title="拿不到聊天记录？">
      <div class="help">
        <h4>电脑版聊天软件</h4>
        <p>打开电脑版聊天软件的消息管理器 → 选中好友 → 导出聊天记录 → 选 txt。
          导出的是明文，里面形如「---- 2023-11-18 ----」和「[17:03:21] 昵称：内容」。</p>
        <h4>手机端聊天软件</h4>
        <p>手机端没有直接的 txt 导出，备份只能恢复不能读。最实际的办法是长按复制少量消息粘贴进来，
          或者用「凭印象写几句」。</p>
        <h4>都没有</h4>
        <p>用「没有记录？凭印象写几句」：填说话方式、记得的口头禅和一句原话，
          模型会先写一版草稿，再靠两轮反馈靠近。不要为了这个去装来历不明的导出工具。</p>
      </div>
      <template #footer>
        <button class="btn btn--block" @click="help = false">知道了</button>
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
.steps {
  display: flex;
  gap: 6px;
  padding: 12px 18px 4px;
}
.steps__dot {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--line-2);
}
.steps__dot.on {
  background: var(--brand);
}
.intro {
  margin: 12px 14px 8px;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(0, 153, 255, 0.1), rgba(123, 91, 255, 0.08));
  border: 1px solid rgba(0, 153, 255, 0.12);
}
.intro__title {
  font-size: 16px;
  font-weight: 600;
}
.intro__text {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
  margin-top: 6px;
}
.actions {
  padding: 8px 14px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.actions .btn {
  justify-content: center;
}
.link {
  font-size: 12px;
  color: var(--brand);
  text-align: center;
  padding: 4px;
}
.paste {
  min-height: 150px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.result {
  margin: 12px 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  font-size: 13px;
}
.warn {
  color: #b45309;
  font-size: 11.5px;
  display: block;
  margin-top: 4px;
}
.group-title {
  padding: 16px 20px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 14px;
}
.chip {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--bg-hover);
  font-size: 12px;
  color: var(--text-2);
}
.chip.on {
  background: rgba(0, 153, 255, 0.12);
  color: var(--brand);
}
.samples {
  margin: 0 14px;
  padding: 12px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  border-radius: 12px;
  max-height: 190px;
  overflow-y: auto;
}
.samples p {
  margin: 0 0 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
}
.samples p::before {
  content: '· ';
  color: var(--text-3);
}
.unrecognized {
  margin: 0 14px;
  padding: 10px;
  background: var(--bg-sheet);
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-3);
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
}
.draft-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin: 14px;
}
.draft-name {
  font-size: 20px;
  font-weight: 600;
}
.draft-tags {
  display: flex;
  gap: 5px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.draft-tags span {
  font-size: 10px;
  color: var(--brand);
  background: rgba(0, 153, 255, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}
.round {
  font-size: 10.5px;
  color: var(--text-3);
  border: 0.5px solid var(--line-2);
  border-radius: 6px;
  padding: 2px 6px;
}
.draft-card {
  margin: 0 14px 8px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 4px 14px;
}
.prop {
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
}
.prop:last-child {
  border-bottom: none;
}
.prop label {
  font-size: 10.5px;
  color: var(--text-3);
  display: block;
  margin-bottom: 3px;
}
.prop p,
.prop pre {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  font-family: inherit;
  color: var(--text);
}
.final {
  margin: 16px 14px;
  padding: 18px;
  border-radius: 16px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.final__name {
  font-size: 21px;
  font-weight: 600;
  margin-bottom: 10px;
}
.final p {
  font-size: 12.5px;
  line-height: 1.7;
  margin: 0 0 8px;
  color: var(--text-2);
}
.final .dim {
  color: var(--text-3);
}
.final .quote {
  margin-top: 10px;
  padding-left: 10px;
  border-left: 2px solid var(--line-2);
  color: var(--text-2);
  font-size: 12.5px;
}
.foot {
  padding: 12px 14px;
}
.foot.row {
  display: flex;
  gap: 10px;
}
.foot.row .btn {
  flex: 1;
}
.error {
  margin: 8px 14px;
  padding: 9px 11px;
  border-radius: 9px;
  background: rgba(255, 77, 79, 0.09);
  color: var(--danger);
  font-size: 12px;
  line-height: 1.5;
}
.status {
  text-align: center;
  font-size: 12px;
  color: var(--brand);
  padding: 8px;
}
.help h4 {
  margin: 14px 16px 4px;
  font-size: 13px;
}
.help p {
  margin: 0 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}
</style>
