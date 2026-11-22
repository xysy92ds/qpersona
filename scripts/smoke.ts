/**
 * 核心逻辑冒烟测试（不依赖浏览器）：
 *   esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs
 *   node /tmp/smoke.mjs
 * 覆盖：自定义建卡、双端提示词、PNG 内嵌卡解析、请求组装、导出。
 */
import { CharacterCard } from 'parsecard'
import { buildCustomCard, makeCharacter, parseCardFile, exportCharacter } from '../src/core/card'
import { buildChatMessages, buildSystemPrompt } from '../src/core/prompt'
import type { Message } from '../src/core/types'

const built = buildCustomCard({
  name: '测试角色',
  description: '一个用于冒烟测试的角色',
  personality: '说话很冷',
  firstMes: '嗯。',
  tags: ['测试'],
})
const ch = makeCharacter(built.card, built.ext)
console.log('1) card:', ch.card.name, '| ext origin:', ch.ext.origin, '| qq:', ch.ext.qq.qqNumber.length)

const qq = buildSystemPrompt(ch, 'qq', '我')
const tavern = buildSystemPrompt(ch, 'tavern', '我')
console.log('2) qq prompt:', qq.length, 'chars, 短消息规则:', qq.includes('怎么发消息'), '| tavern:', tavern.length, 'chars, 叙事:', tavern.includes('沉浸式'))

const v2 = CharacterCard.fromJSON({
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: { name: '雪见', description: '雪山上的旅人', personality: '安静', scenario: '雪夜', first_mes: '你来啦。', mes_example: '<START>\n{{user}}: 冷吗\n{{char}}: 还好。', tags: ['雪'] },
})
const png = v2.toPNG()
const file = new File([png], 'snow.png', { type: 'image/png' })
const parsed = await parseCardFile(file)
console.log('3) png parse:', parsed.card.name, parsed.format, '| greeting:', parsed.card.first_mes, '| warnings:', parsed.warnings.length)

const history: Message[] = [
  { id: 'm1', conversationId: 'c1', role: 'user', text: '在吗', ts: 1, status: 'ok' },
  { id: 'm2', conversationId: 'c1', role: 'assistant', text: '嗯。', ts: 2, status: 'ok' },
]
const messages = buildChatMessages({ character: ch, profile: 'qq', history, userName: '我' })
console.log('4) request messages:', messages.length, '| roles:', messages.map((m) => m.role).join(','))

const exported = exportCharacter(ch) as any
console.log('5) export spec:', exported.spec, '| has qpersona:', !!exported.data.extensions.qpersona)
