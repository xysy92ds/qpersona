/**
 * 聊天记录解析 / 统计 / 草稿 / 截图提取 冒烟测试。
 */
import http from 'node:http'
import { parseChatText, computeStats, generateDraft, reviseDraft, draftToCard, extractTurnsFromScreenshot } from '../src/core/distill'
import type { ApiProfile } from '../src/core/types'

const sample = `---- 2023-11-18 ----
[17:03:21] 林知夏：在吗
[17:04:02] 我：在
[17:04:10] 林知夏：今天好累啊
累得不想说话……
[17:05:00] 我：怎么了
[17:05:30] 林知夏：没什么，就是店里人多
[17:06:00] 林知夏：哈哈哈哈哈你别问了
一些无法识别的系统提示
`
const parsed = parseChatText(sample)
console.log('1) parse:', parsed.recognized, 'messages | senders:', parsed.senders.map((s) => `${s.name}:${s.count}`).join(','))
console.log('2) multiline kept:', parsed.turns[2]?.text.includes('累得不想说话'))
console.log('3) unrecognized:', JSON.stringify(parsed.unrecognized))

const stats = computeStats(parsed.turns, '林知夏')
console.log('4) stats:', JSON.stringify({ medianLen: stats.medianLen, short: stats.shortRatio, particles: stats.particles, top: stats.topPhrases.slice(0, 3) }))
console.log('5) samples:', stats.sampleLines.length)

let lastBody: any = null
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    lastBody = JSON.parse(body)
    const isVision = Array.isArray(lastBody.messages?.[0]?.content)
    const content = isVision
      ? JSON.stringify({ lines: [{ speaker: '对方', text: '这张图里的第一句话' }] })
      : JSON.stringify({
          name: '林知夏',
          description: '书店店员',
          personality: '慢半拍',
          scenario: '书店打烊',
          first_mes: '还没走？',
          mes_example: '<START>\n{{user}}: 在吗\n{{char}}: 嗯',
          tags: ['书店'],
          style_rules: '短句，常用嗯',
        })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content } }] }))
  })
})
await new Promise<void>((r) => server.listen(18084, r))
const profile: ApiProfile = { id: 'p', name: 'x', baseUrl: 'http://127.0.0.1:18084/v1', apiKey: 'k', model: 'deepseek-chat', createdAt: 0 }

const draft = await generateDraft(profile, stats, '林知夏', '我')
console.log('6) draft:', draft.name, draft.style_rules, '| prompt has samples:', JSON.stringify(lastBody.messages?.[1]?.content).includes('今天好累啊'))
const revised = await reviseDraft(profile, draft, '再冷一点', stats)
console.log('7) revise keeps name:', revised.name === draft.name)
const built = draftToCard(revised)
console.log('8) character personality includes style:', built.personality.includes('语言习惯'))
const turns = await extractTurnsFromScreenshot(profile, 'data:image/png;base64,AAAA')
console.log('9) screenshot turns:', JSON.stringify(turns), '| image_url sent:', JSON.stringify(lastBody.messages?.[0]?.content)?.includes('image_url'))

server.close()
