import type { ApiProfile } from './types'
import { completionsEndpoint } from './util'
import { httpError } from './llm'

export interface Turn {
  speaker: string
  text: string
  ts?: number
}

export interface ParseResult {
  turns: Turn[]
  recognized: number
  unrecognized: string[]
  senders: { name: string; count: number }[]
}

const DATE_RE = /^-{2,}\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*-{2,}$/
const MSG_RE = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*([^:：]{1,40})[：:]\s?([\s\S]*)$/
const MSG_RE_FULL = /^\[(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*([^:：]{1,40})[：:]\s?([\s\S]*)$/

/**
 * 解析「电脑 QQ → 消息管理器 → 导出 txt」常见的格式：
 *   ---- 2023-11-18 ----
 *   [17:03:21] 昵称：内容
 * 多行消息会接到上一条；其它行记为未识别。
 */
export function parseQQText(raw: string): ParseResult {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const turns: Turn[] = []
  const unrecognized: string[] = []
  let date: { y: number; m: number; d: number } | null = null
  let last: Turn | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const dm = trimmed.match(DATE_RE)
    if (dm) {
      date = { y: Number(dm[1]), m: Number(dm[2]), d: Number(dm[3]) }
      last = null
      continue
    }

    const full = trimmed.match(MSG_RE_FULL)
    if (full) {
      const ts = new Date(
        Number(full[1]),
        Number(full[2]) - 1,
        Number(full[3]),
        Number(full[4]),
        Number(full[5]),
        Number(full[6] ?? 0),
      ).getTime()
      last = { speaker: full[7]!.trim(), text: full[8]!.trim(), ts }
      turns.push(last)
      continue
    }

    const m = trimmed.match(MSG_RE)
    if (m) {
      const ts = date
        ? new Date(date.y, date.m - 1, date.d, Number(m[1]), Number(m[2]), Number(m[3] ?? 0)).getTime()
        : undefined
      last = { speaker: m[4]!.trim(), text: m[5]!.trim(), ts }
      turns.push(last)
      continue
    }

    // 多行消息的续行
    if (last) {
      last.text += (last.text ? '\n' : '') + trimmed
      continue
    }

    if (unrecognized.length < 20) unrecognized.push(trimmed.slice(0, 80))
  }

  const counts = new Map<string, number>()
  for (const t of turns) counts.set(t.speaker, (counts.get(t.speaker) ?? 0) + 1)
  const senders = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return { turns, recognized: turns.length, unrecognized, senders }
}

export interface DistillStats {
  total: number
  targetCount: number
  otherCount: number
  medianLen: number
  avgLen: number
  shortRatio: number
  questionRatio: number
  punctuation: Record<string, number>
  particles: Record<string, number>
  emojiRatio: number
  activeHours: Record<number, number>
  topPhrases: string[]
  sampleLines: string[]
}

const PARTICLES = ['嗯', '啊', '哦', '诶', '哈', '草', '嘛', '呗', '呀', '吧', '呢', '唉', '哎']
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

export function computeStats(turns: Turn[], target: string): DistillStats {
  const mine = turns.filter((t) => t.speaker === target && t.text.trim())
  const lengths = mine.map((t) => t.text.replace(/\s/g, '').length)
  const punctuation: Record<string, number> = { '。': 0, '！': 0, '？': 0, '…': 0, '~': 0, '，': 0 }
  const particles: Record<string, number> = {}
  const hours: Record<number, number> = {}
  let questions = 0
  let emoji = 0
  const allText = mine.map((t) => t.text).join('\n')

  for (const t of mine) {
    for (const ch of t.text) {
      if (ch in punctuation) punctuation[ch]! += 1
      if (EMOJI_RE.test(ch)) emoji++
    }
    if (/[？?]/.test(t.text)) questions++
    for (const p of PARTICLES) {
      const n = (t.text.match(new RegExp(p, 'g')) ?? []).length
      if (n) particles[p] = (particles[p] ?? 0) + n
    }
    if (t.ts) {
      const h = new Date(t.ts).getHours()
      hours[h] = (hours[h] ?? 0) + 1
    }
  }

  // 高频口头短语：2~4 字 n-gram，至少出现 2 次
  const grams = new Map<string, number>()
  const clean = allText.replace(/[\s\p{P}\p{S}]/gu, '')
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= clean.length; i++) {
      const g = clean.slice(i, i + n)
      grams.set(g, (grams.get(g) ?? 0) + 1)
    }
  }
  const sorted = [...grams.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
  const topPhrases: string[] = []
  for (const [g] of sorted) {
    if (topPhrases.some((p) => p.includes(g))) continue
    topPhrases.push(g)
    if (topPhrases.length >= 12) break
  }

  const samples = mine
    .map((t) => t.text.trim())
    .filter((t) => t.length >= 2 && t.length <= 80)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(-80)

  return {
    total: turns.length,
    targetCount: mine.length,
    otherCount: turns.length - mine.length,
    medianLen: median(lengths),
    avgLen: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
    shortRatio: lengths.length ? Math.round((lengths.filter((l) => l <= 15).length / lengths.length) * 100) : 0,
    questionRatio: mine.length ? Math.round((questions / mine.length) * 100) : 0,
    punctuation,
    particles,
    emojiRatio: mine.length ? Math.round((emoji / mine.length) * 100) : 0,
    activeHours: hours,
    topPhrases,
    sampleLines: samples,
  }
}

export interface PersonaDraft {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  tags: string[]
  style_rules: string
}

function pickJSON(raw: string): any {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function normalizeDraft(data: any, fallbackName: string): PersonaDraft {
  return {
    name: String(data?.name || fallbackName).slice(0, 30),
    description: String(data?.description || '').slice(0, 800),
    personality: String(data?.personality || '').slice(0, 800),
    scenario: String(data?.scenario || '').slice(0, 400),
    first_mes: String(data?.first_mes || '').slice(0, 300),
    mes_example: String(data?.mes_example || '').slice(0, 1500),
    tags: Array.isArray(data?.tags) ? data.tags.slice(0, 6).map(String) : [],
    style_rules: String(data?.style_rules || '').slice(0, 800),
  }
}

async function chatJSON(profile: ApiProfile, system: string, user: string): Promise<any> {
  const res = await fetch(completionsEndpoint(profile.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: profile.model,
      stream: false,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1800,
    }),
  })
  if (!res.ok) throw await httpError(res)
  const json = await res.json()
  return pickJSON(String(json?.choices?.[0]?.message?.content ?? ''))
}

function statsBrief(stats: DistillStats): string {
  return JSON.stringify(
    {
      消息数: stats.targetCount,
      中位句长: stats.medianLen,
      平均句长: stats.avgLen,
      '15字以内占比': `${stats.shortRatio}%`,
      问句占比: `${stats.questionRatio}%`,
      标点: stats.punctuation,
      语气词: stats.particles,
      高频短语: stats.topPhrases,
      活跃时段: stats.activeHours,
    },
    null,
    2,
  )
}

function samplesText(stats: DistillStats): string {
  return stats.sampleLines.map((l) => `- ${l}`).join('\n')
}

/** 第一版草稿：统计 + 原话 few-shot */
export async function generateDraft(
  profile: ApiProfile,
  stats: DistillStats,
  targetName: string,
  userName: string,
): Promise<PersonaDraft> {
  const user = `你要根据聊天记录给「${targetName}」写一张 SillyTavern V2 角色卡，让对方以后能像 TA 一样和「${userName}」聊天。

【统计结果】
${statsBrief(stats)}

【${targetName} 的原话样本】
${samplesText(stats)}

要求：
- 不要写「温柔、善良、有趣」这种没有行为含义的形容词；写具体表现。
- description：身份、生活状态、和对方的关系，150~300 字。
- personality：说话习惯、情绪反应、在意什么、会怎么敷衍/认真；150~300 字。
- style_rules：给模型的硬规则，例如句长、标点、口头禅、emoji 习惯；100 字以内。
- first_mes：一句符合 TA 语气、能接上关系的话。
- mes_example：3 组 <START> 对话，必须用 {{user}} 和 {{char}}，口语、短句，不要照抄样本原句。
- 输出 JSON：{"name":"","description":"","personality":"","scenario":"","first_mes":"","mes_example":"","tags":[],"style_rules":""}`
  const data = await chatJSON(
    profile,
    '你是角色卡作者。只输出 JSON，不要解释。不要神化角色，也不要写成客服。',
    user,
  )
  return normalizeDraft(data, targetName)
}

/** 按用户建议修改 */
export async function reviseDraft(
  profile: ApiProfile,
  draft: PersonaDraft,
  feedback: string,
  stats?: DistillStats | null,
): Promise<PersonaDraft> {
  const user = `这是当前角色卡：
${JSON.stringify(draft, null, 2)}

用户看完后的修改建议：
${feedback}

请按建议修改，保持与设定一致，不要凭空加设定。输出同样的 JSON 结构。
${stats ? `参考统计：\n${statsBrief(stats)}` : ''}`
  const data = await chatJSON(
    profile,
    '你是角色卡作者。只输出 JSON，不要解释。',
    user,
  )
  return normalizeDraft({ ...draft, ...data }, draft.name)
}

/** 用视觉模型从聊天截图里提取「对方」的消息 */
export async function extractTurnsFromScreenshot(
  profile: ApiProfile,
  dataUrl: string,
): Promise<Turn[]> {
  const res = await fetch(completionsEndpoint(profile.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: profile.model,
      stream: false,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '这是一张 QQ 聊天截图。请逐条提取左侧（对方）发出的消息，保持原文，不要编造。输出 JSON：{"lines":[{"speaker":"对方","text":"..."}]}。只输出 JSON。',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 1200,
    }),
  })
  if (!res.ok) throw await httpError(res)
  const json = await res.json()
  const data = pickJSON(String(json?.choices?.[0]?.message?.content ?? ''))
  const lines = Array.isArray(data?.lines) ? data.lines : []
  return lines
    .map((l: any) => ({ speaker: 'TA', text: String(l?.text ?? '').trim() }))
    .filter((t: Turn) => t.text)
}

export function draftToCard(draft: PersonaDraft) {
  return {
    name: draft.name,
    description: draft.description,
    personality: [draft.personality, draft.style_rules ? `语言习惯：${draft.style_rules}` : '']
      .filter(Boolean)
      .join('\n'),
    scenario: draft.scenario,
    first_mes: draft.first_mes,
    mes_example: draft.mes_example,
    tags: draft.tags,
    alternate_greetings: [],
    extensions: {},
  }
}


/** 没有聊天记录时的兜底：凭印象写几句，让模型补成草稿 */
export async function generateDraftFromNotes(
  profile: ApiProfile,
  notes: { name: string; style: string; examples?: string; userName: string },
): Promise<PersonaDraft> {
  const user = `用户拿不到聊天记录，只能凭印象描述「${notes.name}」。请据此写一张 V2 角色卡。

名字：${notes.name}
说话方式 / 性格印象：${notes.style || '（用户没写）'}
记得的原话或例子：${notes.examples || '（没有）'}
对方（用户）：${notes.userName}

要求：
- 不要写成万能助手；保留具体、甚至有点毛边的习惯。
- 信息少就写得克制一点，不要编造大量背景。
- mes_example 用 3 组 <START> 对话，{{user}} / {{char}}，短句口语。
- 输出 JSON：{"name":"","description":"","personality":"","scenario":"","first_mes":"","mes_example":"","tags":[],"style_rules":""}`
  const data = await chatJSON(
    profile,
    '你是角色卡作者。只输出 JSON，不要解释。信息不足时宁可留白，也不要编造。',
    user,
  )
  return normalizeDraft(data, notes.name)
}
