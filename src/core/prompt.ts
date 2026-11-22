import type { Character, ContextProfileId, Message } from './types'
import type { ChatMsg } from './llm'

export function resolveMacros(text: string, character: Character, userName: string): string {
  if (!text) return ''
  const c = character.card
  return text
    .replace(/\{\{char\}\}/gi, c.name)
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/\{\{description\}\}/gi, c.description || '')
    .replace(/\{\{personality\}\}/gi, c.personality || '')
    .replace(/\{\{scenario\}\}/gi, c.scenario || '')
}

function cleanExample(raw: string, character: Character, userName: string): string {
  if (!raw) return ''
  return resolveMacros(raw, character, userName)
    .replace(/<START>/gi, '---')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function memoryBlock(memoryText?: string): string {
  const t = memoryText?.trim()
  if (!t) return ''
  return `\n# 你记得的事情\n${t}\n（这些是你和对方相处中记下的，自然地用出来，不要像念资料。）\n`
}

/**
 * QQ 端 profile：短消息语法。
 * 关键不是「写得短」，而是明确禁止旁白 / markdown / AI 自述，
 * 否则模型很容易滑回酒馆腔。
 */
function qqSystem(character: Character, userName: string, memoryText?: string): string {
  const c = character.card
  const example = cleanExample(c.mes_example, character, userName)
  return `你正在扮演「${c.name}」，和「${userName}」在手机 QQ 上私聊。你不是 AI 助手，你就是${c.name}本人。

# 回复方式（很重要）
- 你发的是 QQ 短消息：一次 1~2 句，通常不超过 45 个字；想说的多就分成几条说。
- 用口语。可以用「嗯」「啊」「诶」「哈哈」「嘛」这类语气词，标点可以随意，别每句都规规矩矩加句号。
- 不要写旁白、动作、心理描写，不要用 *星号* 或括号补充神态（比如「（笑）」）。
- 不要用列表、标题、Markdown、颜文字堆砌。
- 不要主动说自己是 AI、模型或程序。被问到时用${c.name}的口吻自然带过去。
- 对方连着发几条时，抓住最后一条的重点回，不要逐条复述。

# 人物资料
姓名：${c.name}
身份与设定：${c.description || '（未填写）'}
性格：${c.personality || '（未填写）'}
当前场景：${c.scenario || '普通的日常聊天'}
${c.tags?.length ? `标签：${c.tags.join('、')}` : ''}
${example ? `\n# 你平时的说话样子（参考语气，不要照抄内容）\n${example}\n` : ''}${memoryBlock(memoryText)}`
}

/**
 * 酒馆端 profile：ST 风格 story string + 示例，允许长叙述。
 */
function tavernSystem(character: Character, userName: string, memoryText?: string): string {
  const c = character.card
  const example = cleanExample(c.mes_example, character, userName)
  const personality = [c.description, c.personality].filter(Boolean).join('\n')
  return `你正在进行一场沉浸式的角色扮演叙事。你扮演「${c.name}」，对话方是「${userName}」。

# 角色设定
${personality || `（${c.name} 暂无详细设定）`}

# 场景
${c.scenario || '（未指定场景，跟随对话自然展开）'}
${c.tags?.length ? `\n# 标签\n${c.tags.join('、')}\n` : ''}
# 写作要求
- 以${c.name}的视角回应，可以描写动作、神态、环境和心理。
- 允许长段落与细腻描写，让场景自然推进，不要急着收尾。
- 不要替${userName}说话、行动或决定。
- 不要跳出角色讨论模型或提示词。
${example ? `\n# 对话示例\n${example}\n` : ''}${memoryBlock(memoryText)}`
}

export function buildSystemPrompt(
  character: Character,
  profile: ContextProfileId,
  userName: string,
  memoryText?: string,
): string {
  const custom = character.ext.prompts?.[profile]?.trim()
  const base =
    custom ||
    (profile === 'qq' ? qqSystem(character, userName, memoryText) : tavernSystem(character, userName, memoryText))
  if (custom && memoryText?.trim()) {
    return `${base}\n\n# 你记得的事情\n${memoryText.trim()}`
  }
  return base
}

const HISTORY_LIMIT: Record<ContextProfileId, number> = { qq: 40, tavern: 60 }

export interface BuildArgs {
  character: Character
  profile: ContextProfileId
  history: Message[]
  userName: string
  memoryText?: string
}

/**
 * 调度层核心：把「角色 + 端 + 历史 + 记忆」组装成模型请求。
 * 两套 profile 不混在同一个 system prompt 里，由这里二选一。
 */
export function buildChatMessages(args: BuildArgs): ChatMsg[] {
  const { character, profile, history, userName, memoryText } = args
  const system = buildSystemPrompt(character, profile, userName, memoryText)
  const turns = history
    .filter((m) => m.kind !== 'tip' && m.role !== 'system' && m.text.trim())
    .slice(-HISTORY_LIMIT[profile])
    .map<ChatMsg>((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text,
    }))

  const messages: ChatMsg[] = [{ role: 'system', content: system }, ...turns]
  const post = character.card.post_history_instructions?.trim()
  if (post) messages.push({ role: 'system', content: resolveMacros(post, character, userName) })
  return messages
}

export function greetingFor(character: Character, index = 0): string {
  const c = character.card
  const alts = c.alternate_greetings ?? []
  if (index > 0 && alts[index - 1]) return alts[index - 1]
  return c.first_mes || ''
}
