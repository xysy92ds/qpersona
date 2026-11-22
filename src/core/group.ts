import type { Character } from './types'

export interface GroupScore {
  character: Character
  score: number
  reasons: string[]
}

/** 找出消息里提到的名字：@昵称 / @名字 / 别名 / 直接叫名字 */
export function mentions(text: string, ch: Character): { at: boolean; plain: boolean } {
  const t = text.toLowerCase()
  const names = [ch.card.name, ch.ext.qq.nickname, ...(ch.ext.qq.aliases ?? [])]
    .filter(Boolean)
    .map((s) => s!.toLowerCase())
  let at = false
  let plain = false
  for (const n of names) {
    if (!n) continue
    if (t.includes(`@${n}`)) at = true
    else if (t.includes(n)) plain = true
  }
  return { at, plain }
}

/**
 * 群聊激活打分：纯规则、零模型调用。
 * 被 @ 必定入选；叫到名字、兴趣命中、刚说过话的冷却都算在这里。
 */
export function scoreCharacter(
  ch: Character,
  text: string,
  opts: { lastSpeakerId?: string; spokeCount?: number; jitter?: number } = {},
): GroupScore {
  const reasons: string[] = []
  let score = 0

  const m = mentions(text, ch)
  if (m.at) {
    score += 100
    reasons.push('@')
  } else if (m.plain) {
    score += 30
    reasons.push('叫名字')
  }

  const lower = text.toLowerCase()
  for (const tag of ch.ext.qq.interests ?? []) {
    if (tag && lower.includes(tag.toLowerCase())) {
      score += 12
      reasons.push(`兴趣:${tag}`)
    }
  }

  if (opts.lastSpeakerId === ch.id) {
    score -= 40
    reasons.push('刚说过')
  }

  // 说得越少，越容易被推上来，避免一个人霸屏；但光靠这个不该开口
  const spoke = opts.spokeCount ?? 0
  score += Math.max(0, 4 - spoke * 2)

  score += opts.jitter ?? 0
  return { character: ch, score, reasons }
}

/** 一条用户消息最多叫醒几个人 */
export function pickSpeakers(
  members: Character[],
  text: string,
  opts: { lastSpeakerId?: string; spokeCounts?: Record<string, number>; max?: number; threshold?: number } = {},
): GroupScore[] {
  const max = opts.max ?? 2
  const threshold = opts.threshold ?? 15
  const scored = members.map((ch) =>
    scoreCharacter(ch, text, {
      lastSpeakerId: opts.lastSpeakerId,
      spokeCount: opts.spokeCounts?.[ch.id] ?? 0,
      jitter: Math.floor(Math.random() * 4),
    }),
  )
  scored.sort((a, b) => b.score - a.score)
  const picked = scored.filter((s) => s.score >= threshold).slice(0, max)
  // 被 @ 的人无论排第几都优先，且不被阈值挡住
  const mentioned = scored.filter((s) => s.reasons.includes('@'))
  for (const s of mentioned.reverse()) {
    if (!picked.includes(s)) picked.unshift(s)
  }
  return picked.slice(0, max)
}
