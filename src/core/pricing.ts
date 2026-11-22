import type { ApiProfile, Message } from './types'

/**
 * 价格是「估算」，单位：元 / 百万 tokens。
 * 各家价格经常调整，所以这里只做兜底：优先用用户在方案里填的单价。
 */
const TABLE: { match: RegExp; in: number; out: number }[] = [
  { match: /deepseek[-_ ]?reasoner|deepseek-r1/i, in: 4, out: 16 },
  { match: /deepseek/i, in: 2, out: 8 },
  { match: /gpt-4o-mini/i, in: 1.1, out: 4.4 },
  { match: /gpt-4\.1-mini/i, in: 3, out: 12 },
  { match: /gpt-4o|gpt-4\.1/i, in: 18, out: 72 },
  { match: /qwen|通义/i, in: 2, out: 6 },
  { match: /glm-4/i, in: 1, out: 1 },
  { match: /moonshot|kimi/i, in: 4, out: 16 },
  { match: /claude.*opus/i, in: 110, out: 550 },
  { match: /claude/i, in: 22, out: 110 },
]

export interface Price {
  in: number
  out: number
}

export function resolvePrice(profile: ApiProfile): Price | null {
  if (profile.priceIn != null || profile.priceOut != null) {
    return { in: profile.priceIn ?? 0, out: profile.priceOut ?? 0 }
  }
  const hit = TABLE.find((t) => t.match.test(profile.model))
  return hit ? { in: hit.in, out: hit.out } : null
}

/** 粗略估 token：中文约 1 字 1 token，英文约 4 字符 1 token */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch)) cjk++
    else other++
  }
  return Math.max(1, Math.round(cjk + other / 4))
}

export function costOf(
  usage: { prompt: number; completion: number },
  price: Price | null,
): number | undefined {
  if (!price) return undefined
  const cost = (usage.prompt / 1_000_000) * price.in + (usage.completion / 1_000_000) * price.out
  return Math.round(cost * 1_000_000) / 1_000_000
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`
}

export function formatCost(cost: number): string {
  if (cost <= 0) return '¥0'
  if (cost < 0.0001) return '<¥0.0001'
  return `¥${cost.toFixed(4)}`
}

/** 气泡下面那行小字 */
export function usageLabel(m: Message): string {
  if (!m.usage) return ''
  const approx = m.usageEstimated ? '≈ ' : ''
  const parts = [`${approx}${formatTokens(m.usage.total)} tokens`]
  if (m.cost != null) parts.push(formatCost(m.cost))
  return parts.join(' · ')
}
