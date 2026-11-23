export interface ProactiveCheck {
  enabled: boolean
  probability: number
  minMinutes: number
  lastTs: number
  lastProactiveAt?: number
  now: number
  quietEnabled?: boolean
  quietStart?: number
  quietEnd?: number
  /** 测试时注入，默认 Math.random() */
  random?: number
}

/** 免打扰时段支持跨午夜，例如 23 -> 8 */
export function inQuietHours(now: number, start = 23, end = 8): boolean {
  const h = new Date(now).getHours()
  if (start === end) return false
  return start < end ? h >= start && h < end : h >= start || h < end
}

/** 主动消息的时机判断：够久没说话 + 概率命中 */
export function shouldSendProactive(opts: ProactiveCheck): boolean {
  if (!opts.enabled) return false
  if (opts.probability <= 0) return false
  if (opts.quietEnabled && inQuietHours(opts.now, opts.quietStart, opts.quietEnd)) return false
  const gap = opts.minMinutes * 60000
  if (opts.now - opts.lastTs < gap) return false
  if (opts.lastProactiveAt && opts.now - opts.lastProactiveAt < gap) return false
  const roll = opts.random ?? Math.random()
  return roll * 100 < opts.probability
}
