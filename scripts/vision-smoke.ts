/**
 * 模型列表 / 视觉描述 / 多模态请求格式的冒烟测试。
 */
import http from 'node:http'
import { buildChatMessages } from '../src/core/prompt'
import { describeImage, listModels } from '../src/core/llm'
import type { Character, Message } from '../src/core/types'

let lastBody: any = null
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    if (req.url?.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }))
      return
    }
    lastBody = JSON.parse(body)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: '一只橘猫趴在窗台上，窗外在下雨' } }] }))
  })
})
await new Promise<void>((r) => server.listen(18082, r))

const models = await listModels({ baseUrl: 'http://127.0.0.1:18082/v1', apiKey: 'x' })
console.log('1) listModels:', JSON.stringify(models), '| ok:', models.join(',') === 'model-a,model-b')

const caption = await describeImage(
  { id: 'v1', name: 'vision', baseUrl: 'http://127.0.0.1:18082/v1', apiKey: 'x', model: 'vl', createdAt: 0 },
  'data:image/png;base64,AAAA',
)
console.log('2) describeImage:', JSON.stringify(caption))
console.log('3) request uses image_url:', JSON.stringify(lastBody?.messages?.[0]?.content)?.includes('image_url'))

const ch: Character = {
  id: 'c1',
  card: { name: '林知夏', description: '书店店员', personality: '慢', scenario: '', first_mes: '', mes_example: '', alternate_greetings: [], tags: [], extensions: {} },
  ext: { version: 1, qq: { qqNumber: '1', nickname: '知夏', signature: '', interests: [], aliases: [] }, prompts: {}, routing: {}, toggles: { chat: true, memory: true }, origin: 'custom' },
  createdAt: 0,
  updatedAt: 0,
}
const img: Message = { id: 'm1', conversationId: 'c1', role: 'user', text: '', ts: 1, status: 'ok', kind: 'image', image: { url: 'data:image/png;base64,BBBB', caption: '一只橘猫' } }

const multimodal = buildChatMessages({ character: ch, profile: 'qq', history: [img], userName: '我', vision: true })
const parts = multimodal[1]!.content
console.log('4) vision=true -> content parts:', Array.isArray(parts) && parts.some((p: any) => p.type === 'image_url'))

const textOnly = buildChatMessages({ character: ch, profile: 'qq', history: [img], userName: '我' })
console.log('5) vision=false -> caption text:', JSON.stringify(textOnly[1]!.content))

const noCaption = buildChatMessages({ character: ch, profile: 'qq', history: [{ ...img, image: { url: 'x' } }], userName: '我' })
console.log('6) no caption -> [图片]:', JSON.stringify(noCaption[1]!.content))

server.close()
