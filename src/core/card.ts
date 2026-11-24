import { CharacterCard } from 'parsecard'
import type { CardData, Character, PersonaExt } from './types'
import { uid, imageToDataUrl } from './util'

export interface ParsedCard {
  card: CardData
  ext: PersonaExt
  /** PNG 卡自带立绘，可以直接拿来当头像 */
  avatar?: string
  warnings: string[]
  format: 'json' | 'png'
  rawName?: string
}

function randomChatNumber(): string {
  return String(Math.floor(1e8 + Math.random() * 8.9e8))
}

export function emptyExt(name: string, origin: PersonaExt['origin'] = 'custom'): PersonaExt {
  return {
    version: 1,
    qq: {
      qqNumber: randomChatNumber(),
      nickname: name,
      signature: '',
      interests: [],
      aliases: [],
    },
    prompts: {},
    routing: {},
    toggles: { chat: true, memory: true },
    origin,
  }
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** 把 parsecard 的面向对象卡转成项目内的 V2 数据（保留扩展字段，便于 round-trip） */
export function toCardData(card: CharacterCard): CardData {
  const json = card.toJSON() as Record<string, any>
  const d = (json.data ?? json) as Record<string, any>
  const data: CardData = {
    name: str(d.name),
    description: str(d.description),
    personality: str(d.personality),
    scenario: str(d.scenario),
    first_mes: str(d.first_mes),
    mes_example: str(d.mes_example),
    creator_notes: str(d.creator_notes),
    system_prompt: str(d.system_prompt),
    post_history_instructions: str(d.post_history_instructions),
    alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.filter(Boolean) : [],
    character_book: d.character_book ?? undefined,
    tags: Array.isArray(d.tags) ? d.tags.filter((t: unknown) => typeof t === 'string') : [],
    creator: str(d.creator),
    character_version: str(d.character_version),
    extensions: (d.extensions && typeof d.extensions === 'object' ? d.extensions : {}) as Record<string, unknown>,
  }
  return data
}

function warningsOf(card: CardData): string[] {
  const w: string[] = []
  if (!card.name.trim()) w.push('这张卡没有名字，已暂用「未命名角色」。')
  if (!card.description.trim() && !card.personality.trim()) {
    w.push('描述和性格都为空，角色可能不太立体，建议补几句。')
  }
  if (!card.first_mes.trim()) w.push('没有开场白，进入聊天后需要你先开口。')
  return w
}

function extFromCard(card: CardData, origin: PersonaExt['origin']): PersonaExt {
  const ext = emptyExt(card.name || '未命名角色', origin)
  const embedded = (card.extensions?.qpersona ?? null) as Partial<PersonaExt> | null
  if (embedded && typeof embedded === 'object') {
    ext.qq = { ...ext.qq, ...(embedded.qq ?? {}) }
    ext.prompts = { ...ext.prompts, ...(embedded.prompts ?? {}) }
    ext.routing = { ...ext.routing, ...(embedded.routing ?? {}) }
  }
  if (!ext.qq.aliases?.length) ext.qq.aliases = []
  if (!ext.qq.interests?.length) ext.qq.interests = (card.tags ?? []).slice(0, 6)
  ext.qq.nickname = ext.qq.nickname || card.name
  return ext
}

export async function parseCardFile(file: File): Promise<ParsedCard> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.png')) {
    const buf = new Uint8Array(await file.arrayBuffer())
    const parsed = CharacterCard.fromPNG(buf)
    if (!parsed) {
      throw new Error('这个 PNG 里没有找到角色卡数据（只支持 SillyTavern 内嵌卡）。可以换 JSON 试试。')
    }
    const card = toCardData(parsed)
    let avatar: string | undefined
    try {
      avatar = await imageToDataUrl(file, 320)
    } catch {
      avatar = undefined
    }
    return {
      card,
      ext: extFromCard(card, 'import'),
      avatar,
      warnings: warningsOf(card),
      format: 'png',
      rawName: file.name,
    }
  }

  if (lower.endsWith('.json')) {
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      throw new Error('这个 JSON 解析失败了，请确认导出的是角色卡文件，不是聊天记录。')
    }
    if (!raw || typeof raw !== 'object') throw new Error('文件内容不像一张角色卡。')
    const parsed = CharacterCard.fromJSON(raw)
    const card = toCardData(parsed)
    if (!card.name.trim() && !card.description.trim() && !card.first_mes.trim()) {
      throw new Error('文件里没有识别到角色卡字段（name / description / first_mes 都是空的）。')
    }
    return {
      card,
      ext: extFromCard(card, 'import'),
      warnings: warningsOf(card),
      format: 'json',
      rawName: file.name,
    }
  }

  throw new Error('只支持 .json 或 .png 角色卡。')
}

/** 自定义新建：用 V2 字段组装一张最简卡 */
export function buildCustomCard(input: {
  name: string
  description?: string
  personality?: string
  scenario?: string
  firstMes?: string
  mesExample?: string
  tags?: string[]
}): { card: CardData; ext: PersonaExt } {
  const name = input.name.trim()
  const card: CardData = {
    name,
    description: input.description?.trim() ?? '',
    personality: input.personality?.trim() ?? '',
    scenario: input.scenario?.trim() ?? '',
    first_mes: input.firstMes?.trim() ?? '',
    mes_example: input.mesExample?.trim() ?? '',
    tags: input.tags ?? [],
    alternate_greetings: [],
    extensions: {},
  }
  const ext = emptyExt(name, 'custom')
  ext.qq.interests = (input.tags ?? []).slice(0, 6)
  return { card, ext }
}

export function makeCharacter(card: CardData, ext: PersonaExt): Character {
  const now = Date.now()
  return { id: uid('c'), card, ext, createdAt: now, updatedAt: now }
}

/** 导出为 SillyTavern 兼容 JSON（项目扩展放在 extensions.qpersona，可往返） */
export function exportCharacter(ch: Character): Record<string, unknown> {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: { ...ch.card, extensions: { ...ch.card.extensions, qpersona: ch.ext } },
  }
}
