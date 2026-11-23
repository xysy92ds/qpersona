let ctx: AudioContext | null = null

/** 收消息的提示音：轻、短、不吵。浏览器限制自动播放，所以只在用户操作后调用 */
export function ping() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(920, t)
    osc.frequency.exponentialRampToValueAtTime(1380, t + 0.07)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.22)
  } catch {
    /* 静音环境或浏览器不支持，忽略 */
  }
}

import type { ApiProfile } from './types'
import { httpError } from './llm'
import { normalizeBaseUrl } from './util'

function audioEndpoint(baseUrl: string, path: 'transcriptions' | 'speech'): string {
  const base = normalizeBaseUrl(baseUrl).replace(/\/chat\/completions$/, '')
  return `${base}/audio/${path}`
}

function authHeaders(profile: ApiProfile, json: boolean): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (profile.apiKey) h.Authorization = `Bearer ${profile.apiKey}`
  return h
}

/** 语音转文字：OpenAI 兼容的 /audio/transcriptions */
export async function transcribeAudio(profile: ApiProfile, blob: Blob): Promise<string> {
  const form = new FormData()
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('wav') ? 'wav' : 'webm'
  form.append('file', blob, `speech.${ext}`)
  form.append('model', profile.model || 'whisper-1')
  form.append('language', 'zh')
  const res = await fetch(audioEndpoint(profile.baseUrl, 'transcriptions'), {
    method: 'POST',
    headers: authHeaders(profile, false),
    body: form,
  })
  if (!res.ok) throw await httpError(res)
  const json = await res.json()
  return String(json?.text ?? '').trim()
}

/** 文字转语音：OpenAI 兼容的 /audio/speech，返回音频 Blob */
export async function synthesizeSpeech(profile: ApiProfile, text: string): Promise<Blob> {
  const res = await fetch(audioEndpoint(profile.baseUrl, 'speech'), {
    method: 'POST',
    headers: authHeaders(profile, true),
    body: JSON.stringify({
      model: profile.model || 'tts-1',
      input: text,
      voice: profile.voice || 'alloy',
      response_format: 'mp3',
    }),
  })
  if (!res.ok) throw await httpError(res)
  return await res.blob()
}
