export function uid(prefix = ''): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const s = uuid.slice(0, 16)
  return prefix ? `${prefix}_${s}` : s
}

const pad = (n: number) => (n < 10 ? '0' + n : '' + n)

export function clockOf(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 会话列表的时间：今天只显示时刻，昨天显示「昨天」，更早显示日期 */
export function listTime(ts: number): string {
  if (!ts) return ''
  const now = Date.now()
  const diff = startOfDay(now) - startOfDay(ts)
  if (diff < 0) return clockOf(ts)
  if (diff === 0) return clockOf(ts)
  if (diff === 86400000) return '昨天'
  const d = new Date(ts)
  if (diff < 7 * 86400000) return '星期' + '日一二三四五六'[d.getDay()]
  if (d.getFullYear() === new Date(now).getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

/** 聊天内的时间分隔：只在高频对话时省略 */
export function chatTime(ts: number): string {
  const now = Date.now()
  const diff = startOfDay(now) - startOfDay(ts)
  if (diff === 0) return clockOf(ts)
  if (diff === 86400000) return `昨天 ${clockOf(ts)}`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${clockOf(ts)}`
}

export function hashHue(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}

export function charGlyph(name: string): string {
  const t = name.trim()
  return t ? Array.from(t)[0]! : '?'
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 用 canvas 把图片压到不超过 max 边长，返回 dataURL，避免把大图塞进 IndexedDB */
export async function imageToDataUrl(file: Blob, max = 400): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  return canvas.toDataURL(type, 0.86)
}

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/** 兼容用户填 https://api.deepseek.com 或 .../v1 两种情况 */
export function completionsEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl)
  if (/\/chat\/completions$/.test(base)) return base
  return `${base}/chat/completions`
}
