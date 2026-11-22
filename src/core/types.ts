/**
 * QPersona 核心数据模型
 *
 * 设计原则：
 * 1. 角色卡以 SillyTavern V2 字段为基线（可直接与酒馆生态互通）；
 * 2. 项目自有字段统一放进 extensions.qpersona，不污染 ST 兼容字段；
 * 3. 会话（Conversation）带 context_profile，同一角色在 QQ 端 / 酒馆端各有独立会话，
 *    但共享同一份角色卡与记忆存储 —— 这正是「双端互动」的落点。
 */

/** 能力槽位：调度层只认槽位，不认具体供应商 */
export type SlotId =
  | 'text_main'
  | 'memory_summary'
  | 'vision'
  | 'embedding'
  | 'tts'
  | 'stt'
  | 'image_gen'

export interface SlotMeta {
  id: SlotId
  label: string
  desc: string
  optional?: boolean
}

export const SLOTS: SlotMeta[] = [
  { id: 'text_main', label: '主对话', desc: 'QQ 聊天与酒馆叙事的默认文本模型' },
  { id: 'memory_summary', label: '记忆总结', desc: '留空则复用主对话模型', optional: true },
  { id: 'vision', label: '图片识别', desc: '识别聊天中发送的图片', optional: true },
  { id: 'embedding', label: '嵌入模型', desc: '语义召回记忆（后续版本启用）', optional: true },
  { id: 'tts', label: '语音合成', desc: '把文字回复读成语音', optional: true },
  { id: 'stt', label: '语音识别', desc: '把语音消息转成文本', optional: true },
  { id: 'image_gen', label: '绘画', desc: '角色发图 / 表情包生成', optional: true },
]

/** 一个 OpenAI 兼容的接口方案 */
export interface ApiProfile {
  id: string
  /** 方案显示名，如「DeepSeek 官方」 */
  name: string
  /** Base URL，如 https://api.deepseek.com/v1 */
  baseUrl: string
  apiKey: string
  /** 模型名，如 deepseek-chat */
  model: string
  temperature?: number
  maxTokens?: number
  /** 自定义单价：元 / 百万 tokens，留空则按模型名内置估算 */
  priceIn?: number
  priceOut?: number
  createdAt: number
}

/** SillyTavern V2 角色卡 data 字段 */
export interface CardData {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  creator_notes?: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  character_book?: unknown
  tags?: string[]
  creator?: string
  character_version?: string
  extensions?: Record<string, unknown>
}

/** QQ 外壳所需要的资料，与角色人格解耦但绑在同一个角色身上 */
export interface QQIdentity {
  qqNumber: string
  nickname?: string
  signature?: string
  /** dataURL 或 http(s) 链接 */
  avatar?: string
  /** 群聊软触发用的兴趣标签 */
  interests: string[]
  /** 被叫到名字时额外匹配的别名 */
  aliases: string[]
}

/** 双端提示词草稿（用户可编辑；留空则用内置模板） */
export interface ProfilePrompts {
  qq?: string
  tavern?: string
}

export interface PersonaExt {
  version: 1
  qq: QQIdentity
  prompts: ProfilePrompts
  /** 角色级 API 覆盖：不填则用全局槽位绑定 */
  routing: Partial<Record<SlotId, string>>
  toggles: {
    /** 该角色是否允许调用文本模型（主对话开关） */
    chat: boolean
    /** 该角色是否启用记忆总结 */
    memory: boolean
  }
  origin: 'import' | 'custom' | 'distill'
  /** 蒸馏得到的可量化语感统计，供角色页展示 */
  stats?: Record<string, unknown>
}

export interface Character {
  id: string
  card: CardData
  ext: PersonaExt
  createdAt: number
  updatedAt: number
}

export type ConversationKind = 'single' | 'group'
export type ContextProfileId = 'qq' | 'tavern'

export interface Conversation {
  id: string
  kind: ConversationKind
  /** 该会话使用哪一套提示词/上下文策略 */
  profile: ContextProfileId
  title: string
  avatar?: string
  /** 单聊对端角色 */
  characterId?: string
  /** 群聊成员 */
  memberIds?: string[]
  lastText: string
  lastTs: number
  unread: number
  pinned: boolean
  /** 消息免打扰：列表里不显示红点，只留一个小图标 */
  muted?: boolean
  createdAt: number
}

export type MsgRole = 'user' | 'assistant' | 'system'
export type MsgStatus = 'ok' | 'streaming' | 'error'

export interface Message {
  id: string
  conversationId: string
  role: MsgRole
  /** 单聊里为角色 ID；群聊里为发言角色 ID */
  characterId?: string
  text: string
  ts: number
  status: MsgStatus
  /** tip = 系统灰条 / 时间提示 */
  kind?: 'text' | 'tip'
  error?: string
  /** 这一次回复的 token 用量（assistant 消息才有） */
  usage?: { prompt: number; completion: number; total: number }
  /** 按单价估算的花费（元） */
  cost?: number
  /** 用量是不是估算出来的 */
  usageEstimated?: boolean
}

export interface AppUser {
  nickname: string
  qqNumber: string
  avatar?: string
  signature: string
}

export const DEFAULT_USER: AppUser = {
  nickname: '你',
  qqNumber: '10001',
  avatar: '',
  signature: '万物皆可角色扮演',
}
