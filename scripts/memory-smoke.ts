/**
 * 记忆系统冒烟测试：假模型返回 JSON，验证总结、去重、召回、游标。
 *   pnpm test:smoke 会一起跑
 */
import 'fake-indexeddb/auto'
import http from 'node:http'
import { createPinia, setActivePinia } from 'pinia'

;(globalThis as any).document = {
  documentElement: { dataset: {}, classList: { toggle() {} }, style: {} },
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const isGroup = body.includes('最近群聊')
    const memories = isGroup
      ? [
          { type: 'event', content: '你们在群里约好周末一起去看展', importance: 8, tags: ['展', '群'] },
        ]
      : [
          { type: 'preference', content: '对方喜欢雨天，觉得适合待在书店', importance: 8, tags: ['雨', '书店'] },
          { type: 'event', content: '对方今晚加班到很晚，还没吃饭', importance: 6, tags: ['加班'] },
          { type: 'preference', content: '对方喜欢雨天，觉得适合待在书店', importance: 5, tags: [] },
        ]
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ memories }) } }],
      }),
    )
  })
})
await new Promise<void>((r) => server.listen(18081, r))

const { useContactsStore } = await import('../src/store/contacts')
const { useSettingsStore } = await import('../src/store/settings')
const { useMemoryStore } = await import('../src/store/memory')
const { db } = await import('../src/core/db')
const { buildChatMessages } = await import('../src/core/prompt')
const type = await import('../src/core/types')

setActivePinia(createPinia())
const settings = useSettingsStore()
const contacts = useContactsStore()
const memory = useMemoryStore()

await settings.load()
await contacts.load()
await settings.addProfile({
  name: '记忆测试',
  baseUrl: 'http://127.0.0.1:18081/v1',
  apiKey: 'x',
  model: 'deepseek-chat',
})

const conv = contacts.conversations[0]!
const ch = contacts.characterById(conv.characterId)!
const created = await memory.summarize(conv.id)
console.log('1) summarized:', created, '| stored:', await db.memories.count(), '| cursor:', !!contacts.conversationById(conv.id)?.memoryLastTs)
console.log('2) dedupe kept distinct only:', created === 2)

const recalled = await memory.recall(ch.id, '明天好像要下雨，你带伞了吗')
console.log('3) recall:', JSON.stringify(recalled))
console.log('4) recall hits relevant memory:', recalled.includes('雨天'))

const stickerMsg: any = {
  id: 'm_st',
  conversationId: conv.id,
  role: 'user',
  text: '',
  ts: Date.now(),
  status: 'ok',
  kind: 'sticker',
  sticker: { id: 's1', name: '猫猫无语', annotation: '表示懒得接话', url: 'data:image/png;base64,x' },
}
const fileMsg: any = {
  id: 'm_f',
  conversationId: conv.id,
  role: 'user',
  text: '',
  ts: Date.now() + 1,
  status: 'ok',
  kind: 'file',
  file: { name: '门票.pdf', size: 2048, mime: 'application/pdf', url: 'data:application/pdf;base64,x' },
}
const quoteMsg: any = {
  ...stickerMsg,
  id: 'm_q',
  kind: 'text',
  sticker: undefined,
  text: '那明天见',
  quote: { id: 'm2', role: 'assistant', name: '林知夏', text: '台阶是凉的' },
}
const cardMsg: any = {
  ...stickerMsg,
  id: 'm_card',
  kind: 'card',
  sticker: undefined,
  card: { title: '周末的展', description: '三点在美术馆门口见', url: 'https://example.com/expo' },
}
const imageMsg: any = { ...stickerMsg, id: 'm_img', kind: 'image', sticker: undefined, image: { url: 'data:image/png;base64,x' } }
const videoMsg: any = { ...stickerMsg, id: 'm_vid', kind: 'video', sticker: undefined, video: { url: 'data:video/webm;base64,x', name: '片段.webm', size: 1000 } }
const voiceMsg: any = { ...stickerMsg, id: 'm_voice', kind: 'voice', sticker: undefined, voice: { url: 'data:audio/webm;base64,x', duration: 3.4, mime: 'audio/webm', size: 500 } }
const built = buildChatMessages({
  character: ch,
  profile: 'qq',
  history: [stickerMsg, fileMsg, quoteMsg, cardMsg, imageMsg, videoMsg, voiceMsg],
  userName: '我',
  memoryText: recalled,
})
const contents = built.slice(1).map((m) => m.content)
console.log('5) sticker->prompt:', JSON.stringify(contents[0]))
console.log('6) file->prompt:', JSON.stringify(contents[1]))
console.log('7) quote->prompt:', JSON.stringify(contents[2]))
console.log('8) memory injected:', built[0]!.content.includes('对方喜欢雨天'))
console.log('9) card->prompt:', JSON.stringify(contents[3]))
console.log('10) media->prompt:', JSON.stringify(contents.slice(4)))

// —— 群聊记忆 → 私聊：用同一份 characterId，source=group ——
const group = await contacts.createGroup([ch.id], '测试群')
const base = Date.now()
for (let i = 0; i < 8; i++) {
  await db.messages.put({
    id: `gm${i}`,
    conversationId: group.id,
    role: i % 2 ? 'assistant' : 'user',
    characterId: i % 2 ? ch.id : undefined,
    text: i % 2 ? '那周末三点在门口见' : '周六一起去看展吗',
    ts: base + i * 1000,
    status: 'ok',
    kind: 'text',
  } as any)
}
const groupCreated = await memory.summarize(group.id, { characterId: ch.id, source: 'group' })
const allMem = await db.memories.where('characterId').equals(ch.id).toArray()
console.log('9) group summary:', groupCreated, '| tagged source=group:', allMem.some((m) => m.source === 'group'))
const privateRecall = await memory.recall(ch.id, '周末去看展')
console.log('10) private chat recalls group memory:', privateRecall.includes('看展') && privateRecall.includes('[群聊]'))
const groupOnly = await memory.recall(ch.id, '雨天看展', { includePrivate: false })
console.log('11) group-only recall drops private:', !groupOnly.includes('雨天') && groupOnly.includes('看展'))


// —— 手动记忆：添加、去重合并、置顶、编辑、合并重复 ——
const manual = await memory.add(ch.id, {
  type: 'fact',
  content: '对方养了一只橘猫',
  importance: 5,
  tags: ['猫'],
})
const dup = await memory.add(ch.id, {
  type: 'fact',
  content: '对方养了一只橘猫',
  importance: 9,
  tags: ['年糕'],
})
const afterAdd = await db.memories.where('characterId').equals(ch.id).toArray()
const manualRow = afterAdd.find((m) => m.id === manual?.id)
console.log('12) manual add dedupes:', afterAdd.filter((m) => m.content === '对方养了一只橘猫').length === 1,
  '| importance raised:', manualRow?.importance === 9,
  '| tags merged:', (manualRow?.tags ?? []).includes('年糕'),
  '| same id:', dup?.id === manual?.id)

await memory.update(manual!.id, { content: '对方养了一只叫年糕的橘猫', pinned: true, importance: 9 })
const pinnedRow = (await db.memories.where('characterId').equals(ch.id).toArray()).find((m) => m.id === manual!.id)
console.log('13) edit + pin:', pinnedRow?.content.includes('年糕') === true, '| pinned:', pinnedRow?.pinned === true)

const beforeMerge = await db.memories.count()
await db.memories.put({
  ...pinnedRow!,
  id: 'mem_dup_manual',
  content: '对方养了一只叫年糕的橘猫！',
  pinned: false,
  importance: 4,
})
const removed = await memory.mergeDuplicates(ch.id)
console.log('14) merge duplicates:', removed >= 1, '| count:', beforeMerge, '->', await db.memories.count())

const catRecall = await memory.recall(ch.id, '年糕最近怎么样')
console.log('15) pinned/manual recall:', catRecall.includes('年糕'))

server.close()
