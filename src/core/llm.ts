import { createParser } from 'eventsource-parser'
import type { ApiProfile } from './types'
import { completionsEndpoint, normalizeBaseUrl } from './util'

export type ChatContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: ChatContent
}

export interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface ChatOptions {
  profile: ApiProfile
  messages: ChatMsg[]
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  /** 供应商在流末尾回传的真实用量（部分兼容接口不返回） */
  onUsage?: (usage: Usage) => void
}

function headersOf(profile: ApiProfile): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (profile.apiKey) h.Authorization = `Bearer ${profile.apiKey}`
  return h
}

async function httpError(res: Response): Promise<Error> {
  let detail = ''
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      detail = j?.error?.message || j?.message || j?.error || text
    } catch {
      detail = text
    }
  } catch {
    /* 读不到 body 就算了 */
  }
  const hints: Record<number, string> = {
    401: 'API Key 可能不正确',
    403: '这个 Key 没有调用该模型的权限',
    404: 'Base URL 或模型名可能不对',
    429: '触发限流或余额不足',
  }
  const hint = hints[res.status] ? `（${hints[res.status]}）` : ''
  return new Error(`HTTP ${res.status}${hint}${detail ? '：' + String(detail).slice(0, 280) : ''}`)
}

/**
 * OpenAI 兼容的流式对话。只负责「把 token 吐出来」，
 * 不做任何角色/提示词层面的判断 —— 那是调度层的事。
 */
export async function* streamChat(opts: ChatOptions): AsyncGenerator<string, void, unknown> {
  const { profile, messages, signal } = opts

  const send = (withUsage: boolean) =>
    fetch(completionsEndpoint(profile.baseUrl), {
      method: 'POST',
      headers: headersOf(profile),
      signal,
      body: JSON.stringify({
        model: profile.model,
        messages,
        stream: true,
        ...(withUsage ? { stream_options: { include_usage: true } } : {}),
        temperature: opts.temperature ?? profile.temperature ?? 0.9,
        ...(opts.maxTokens ?? profile.maxTokens
          ? { max_tokens: opts.maxTokens ?? profile.maxTokens }
          : {}),
      }),
    })

  let res = await send(true)
  // 个别 OpenAI 兼容接口不认 stream_options，只在明确报错时降级重试一次
  if (!res.ok && res.status >= 400 && res.status < 500) {
    const detail = await res.clone().text().catch(() => '')
    if (/stream_options/i.test(detail)) res = await send(false)
  }
  if (!res.ok) throw await httpError(res)
  if (!res.body) throw new Error('接口没有返回可读的流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const queue: string[] = []
  let finished = false
  let parseError: Error | null = null

  const parser = createParser({
    onEvent(ev) {
      if (ev.data === '[DONE]') {
        finished = true
        return
      }
      try {
        const json = JSON.parse(ev.data)
        if (json?.usage) opts.onUsage?.(json.usage)
        const choice = json?.choices?.[0]
        const delta = choice?.delta?.content ?? choice?.message?.content ?? ''
        if (delta) queue.push(delta)
        if (choice?.finish_reason) finished = true
      } catch {
        /* 心跳 / 非 JSON 事件直接忽略 */
      }
    },
    onError(err) {
      parseError = err instanceof Error ? err : new Error(String(err))
    },
  })

  try {
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
      while (queue.length) yield queue.shift()!
    }
    const rest = decoder.decode()
    if (rest) parser.feed(rest)
    while (queue.length) yield queue.shift()!
    if (parseError) throw parseError
  } finally {
    reader.cancel().catch(() => undefined)
  }
}

function modelsEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl).replace(/\/chat\/completions$/, '')
  return `${base}/models`
}

/** 拉取这个接口下可用的模型列表 */
export async function listModels(input: { baseUrl: string; apiKey: string }): Promise<string[]> {
  const res = await fetch(modelsEndpoint(input.baseUrl), {
    headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {},
  })
  if (!res.ok) throw await httpError(res)
  const json = await res.json()
  const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : []
  return rows
    .map((r: any) => (typeof r === 'string' ? r : r?.id || r?.name || r?.model))
    .filter((x: unknown): x is string => typeof x === 'string' && !!x)
    .sort()
}

/** 用视觉模型给一张图写描述，供不支持图片的文本模型使用 */
export async function describeImage(profile: ApiProfile, dataUrl: string): Promise<string> {
  const res = await fetch(completionsEndpoint(profile.baseUrl), {
    method: 'POST',
    headers: headersOf(profile),
    body: JSON.stringify({
      model: profile.model,
      stream: false,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '用一两句话客观描述这张图片：主体、场景、可见的文字。不要评价，不要客套。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  })
  if (!res.ok) throw await httpError(res)
  const json = await res.json()
  return String(json?.choices?.[0]?.message?.content ?? '').trim()
}

/** 非流式补全：记忆总结、蒸馏这类离线任务用 */
export async function completeChat(opts: ChatOptions & { json?: boolean }): Promise<string> {
  const { profile, messages, signal } = opts
  const res = await fetch(completionsEndpoint(profile.baseUrl), {
    method: 'POST',
    headers: headersOf(profile),
    signal,
    body: JSON.stringify({
      model: profile.model,
      messages,
      stream: false,
      temperature: opts.temperature ?? profile.temperature ?? 0.8,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      ...(opts.maxTokens ?? profile.maxTokens ? { max_tokens: opts.maxTokens ?? profile.maxTokens } : {}),
    }),
  })
  if (!res.ok) throw await httpError(res)
  const json = await res.json()
  return json?.choices?.[0]?.message?.content ?? ''
}

/** 设置页里的「测试连接」：一次最小的非流式请求 */
export async function testProfile(profile: ApiProfile): Promise<string> {
  const text = await completeChat({
    profile,
    messages: [
      { role: 'system', content: '你是连通性测试助手。' },
      { role: 'user', content: '只回复两个字：可用' },
    ],
    maxTokens: 16,
  })
  return text.trim() || '（空回复）'
}
