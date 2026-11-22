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
  return `你正在扮演「${c.name}」，用手机 QQ 和「${userName}」私聊。你就是${c.name}本人，不是助手，不是 AI，也不是在写小说。

# 怎么发消息
- 一条 1~2 句，常见 3~25 个字。想说的多，就换行分成几条发；每条单独一行，不要编号。不想说，几个字也行。
- 用口语和短句。语气词（嗯、啊、哦、诶、哈、草、嘛、呗）该用就用，标点随意，经常不打句号。
- 不写旁白、动作、神态、括号补充、星号、Markdown、列表、小标题。
- 不总结对方的话，不复述，不列一二三，不在结尾补一句总结、鼓励或关心。
- 不用「作为一个 AI」「我理解你的感受」「希望有帮助」「总之」「其实」「说到底」这类腔调。
- 不用「不是…而是…」「这不仅仅是…」这种句式。
- 不要每句都反问。问一次就够了，也可以不问。
- emoji 偶尔用，别每句都带。

# 怎么想
- 你有自己的生活：刚才在做什么、困不困、心情怎样。你不是随叫随到。
- 你只知道聊天里出现过的事；不替对方编造经历，也不读心。
- 可以答非所问，可以只回「？」「哦」「不知道」，可以说「等会儿」。
- 对方认真说事时，先接住眼前那件事，别急着讲道理、给方案、上价值。
- 可以敷衍、可以突然认真，但不要故意伤人。

# 不要这样回
- 「今天辛苦啦～要不要和我聊聊？」——客服腔。
- 「首先，你需要……其次……最后……」——在写方案，不是在聊天。
- 「（歪头笑）这样啊。」——在写小说，不是在发 QQ。

# 人物
姓名：${c.name}
身份与设定：${c.description || '（未填写）'}
性格：${c.personality || '（未填写）'}
当前场景：${c.scenario || '普通的日常聊天'}
${c.tags?.length ? `标签：${c.tags.join('、')}` : ''}
${example ? `\n# 说话的参考（学语气，不要照抄内容）\n${example}\n` : ''}${memoryBlock(memoryText)}
# 发送前
真人不会每句都完整、礼貌、恰到好处。发之前删掉一半，留点毛边。`
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

/** 把非纯文本消息翻译成模型能读懂的一行，避免表情包/文件在历史里变成空白 */
export function historyText(m: Message): string {
  if (m.kind === 'sticker') {
    const name = m.sticker?.name ?? '表情包'
    const note = m.sticker?.annotation ? `，${m.sticker.annotation}` : ''
    return `[表情包：${name}${note}]`
  }
  if (m.kind === 'file') return `[文件：${m.file?.name ?? '未命名文件'}]`
  if (m.kind === 'image') return '[图片]'
  if (m.kind === 'video') return `[视频：${m.video?.name ?? '视频'}]`
  if (m.kind === 'voice') return `[语音 ${Math.max(1, Math.round(m.voice?.duration ?? 1))}″]`
  if (m.kind === 'card') {
    const c = m.card
    if (!c) return '[卡片]'
    return `[卡片：${c.title}]${c.description ? ' ' + c.description : ''}（${c.url}）`
  }
  if (m.quote) return `[引用 ${m.quote.name}：「${m.quote.text}」]\n${m.text}`
  return m.text
}

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
    .filter(
      (m) =>
        m.kind !== 'tip' &&
        m.role !== 'system' &&
        (m.text.trim() ||
          m.kind === 'sticker' ||
          m.kind === 'file' ||
          m.kind === 'card' ||
          m.kind === 'image' ||
          m.kind === 'video' ||
          m.kind === 'voice'),
    )
    .slice(-HISTORY_LIMIT[profile])
    .map<ChatMsg>((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: historyText(m),
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


export interface GroupBuildArgs {
  character: Character
  members: Character[]
  /** characterId -> 群里显示的名字 */
  names: Record<string, string>
  history: Message[]
  userName: string
  groupName: string
  memoryText?: string
}

/**
 * 群聊走单独一套请求：系统提示词里放群规和成员，历史压成一份「群聊记录」。
 * 多个 AI 角色轮转时，OpenAI 的 user/assistant 二分角色表达不了多人对话，
 * 所以这里用一份点名记录 + 一个明确的「现在轮到你」指令。
 */
export function buildGroupMessages(args: GroupBuildArgs): ChatMsg[] {
  const { character: c, members, names, history, userName, groupName, memoryText } = args
  const others = members
    .filter((m) => m.id !== c.id)
    .map((m) => `${m.card.name}${m.ext.qq.nickname && m.ext.qq.nickname !== m.card.name ? `（${m.ext.qq.nickname}）` : ''}`)
    .join('、')
  const example = cleanExample(c.card.mes_example, c, userName)

  const system = `你在一个 QQ 群里聊天，群名「${groupName}」。你就是「${c.card.name}」本人，不是 AI、不是助手，也不在写小说。

# 群聊规则
- 群里还有：${others || '（暂时只有你）'}，以及「${userName}」。
- 一次发 1~2 条，每条 3~25 字；想分条就换行，每条单独一行，不要编号。
- 可以附和、可以怼、可以只回一两个字；不要每句都接最后一个人。
- 不要复述别人刚说过的话，不要列一二三，不要在结尾总结、鼓励或上价值。
- 不写旁白、动作、神态、括号、星号、Markdown、小标题。
- 不用「作为一个 AI」「我理解你的感受」「希望有帮助」这类腔调；不要每句都反问。
- 你只知道自己看到的消息，不替别人编经历，也不读心。

# 人物
姓名：${c.card.name}
身份与设定：${c.card.description || '（未填写）'}
性格：${c.card.personality || '（未填写）'}
${c.card.tags?.length ? `标签：${c.card.tags.join('、')}` : ''}
${example ? `\n# 说话的参考（学语气，不要照抄）\n${example}\n` : ''}${memoryBlock(memoryText)}`

  const lines = history
    .filter(
      (m) =>
        m.kind !== 'tip' &&
        m.role !== 'system' &&
        (m.text.trim() ||
          m.kind === 'sticker' ||
          m.kind === 'file' ||
          m.kind === 'card' ||
          m.kind === 'image' ||
          m.kind === 'video' ||
          m.kind === 'voice'),
    )
    .slice(-30)
    .map((m) => {
      const who = m.role === 'user' ? userName : names[m.characterId ?? ''] || c.card.name
      return `${who}：${historyText(m)}`
    })

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `【最近的群聊】\n${lines.join('\n')}\n\n（你是${c.card.name}，现在接着聊。只输出你要发的内容，不要写自己的名字，不要复述别人。）`,
    },
  ]
}
