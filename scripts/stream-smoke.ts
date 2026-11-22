/**
 * 端到端流式冒烟测试：本地起一个假 OpenAI 服务，验证 SSE 解析、提示词组装、拆气泡。
 *   esbuild scripts/stream-smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/stream.mjs
 *   node /tmp/stream.mjs
 */
import 'fake-indexeddb/auto'
import http from 'node:http'
import { createPinia, setActivePinia } from 'pinia'

;(globalThis as any).document = { documentElement: { dataset: {}, classList: { toggle() {} }, style: {} } }

let captured: any = null
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    captured = JSON.parse(body)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    send({ choices: [{ delta: { content: '你好' } }] })
    setTimeout(() => send({ choices: [{ delta: { content: '，今天' } }] }), 25)
    setTimeout(() => send({ choices: [{ delta: { content: '\n天气不错' } }] }), 55)
    setTimeout(() => {
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
      send({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 24, total_tokens: 144 } })
      res.write('data: [DONE]\n\n')
      res.end()
    }, 85)
  })
})
await new Promise<void>((r) => server.listen(18080, r))

const { useContactsStore } = await import('../src/store/contacts')
const { useChatStore } = await import('../src/store/chat')
const { useSettingsStore } = await import('../src/store/settings')

setActivePinia(createPinia())
const settings = useSettingsStore()
const contacts = useContactsStore()
const chat = useChatStore()

await settings.load()
await contacts.load()
const profile = await settings.addProfile({
  name: '假模型',
  baseUrl: 'http://127.0.0.1:18080/v1',
  apiKey: 'test',
  model: 'deepseek-chat',
  temperature: 0.8,
})
console.log('1) profile bound to text_main:', settings.bindings.text_main === profile.id)

const conv = contacts.conversations[0]!
await chat.load(conv.id)
const before = chat.messagesOf(conv.id).length
console.log('2) sending…')
await chat.send(conv.id, '今天天气怎么样')
const list = chat.messagesOf(conv.id)
const replies = list.slice(before + 1)
console.log('3) replies:', replies.length, '|', replies.map((m) => JSON.stringify(m.text)).join(' + '))
console.log('4) status:', replies.map((m) => m.status).join(','))
console.log('5) system prompt has QQ 规则:', String(captured?.messages?.[0]?.content).includes('怎么发消息'))
console.log('6) history roles:', (captured?.messages ?? []).slice(1).map((m: any) => m.role).join(','))
console.log('7) stream flag:', captured?.stream, '| model:', captured?.model)
console.log('8) conv preview:', contacts.conversationById(conv.id)?.lastText)
const lastReply = replies[replies.length - 1]
console.log('9) usage:', JSON.stringify(lastReply?.usage), '| cost:', lastReply?.cost, '| estimated:', lastReply?.usageEstimated)
console.log('10) stream_options:', JSON.stringify(captured?.stream_options))

server.close()
