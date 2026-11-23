/**
 * 语音通话的 STT/TTS 适配器测试（OpenAI 兼容端点）。
 */
import http from 'node:http'
import { transcribeAudio, synthesizeSpeech } from '../src/core/audio'
import type { ApiProfile } from '../src/core/types'

let allHeaders: any = null
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(Buffer.from(c)))
  req.on('end', () => {
    allHeaders = req.headers
    if (req.url === '/v1/audio/transcriptions') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ text: '今天好累' }))
      return
    }
    if (req.url === '/v1/audio/speech') {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
      res.end(Buffer.from('fake-mp3-bytes'))
      return
    }
    res.writeHead(404)
    res.end()
  })
})
await new Promise<void>((r) => server.listen(18083, r))

const profile: ApiProfile = {
  id: 'a1',
  name: 'audio',
  baseUrl: 'http://127.0.0.1:18083/v1',
  apiKey: 'sk-x',
  model: 'whisper-1',
  createdAt: 0,
}

const text = await transcribeAudio(profile, new Blob(['fake-audio'], { type: 'audio/webm' }))
console.log('1) transcribe:', JSON.stringify(text), '| auth:', allHeaders?.authorization === 'Bearer sk-x')

const speech = await synthesizeSpeech({ ...profile, model: 'tts-1', voice: 'nova' }, '我在呢')
const bytes = Buffer.from(await speech.arrayBuffer()).toString()
console.log('2) synthesize:', bytes, '| type:', speech.type)

server.close()
