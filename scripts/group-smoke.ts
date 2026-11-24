/**
 * 群聊激活与收件人解析测试：纯函数，零模型。
 *   pnpm test:smoke
 */
import { parseGroupTargets, pickSpeakers } from '../src/core/group'
import { buildGroupMessages } from '../src/core/prompt'
import type { Character, Message } from '../src/core/types'

const mk = (id: string, name: string, nickname: string, interests: string[], aliases: string[] = []): Character => ({
  id,
  card: {
    name,
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    alternate_greetings: [],
    tags: [],
    extensions: {},
  },
  ext: {
    version: 1,
    qq: { qqNumber: '1', nickname, signature: '', interests, aliases },
    prompts: {},
    routing: {},
    toggles: { chat: true, memory: true },
    origin: 'custom',
  },
  createdAt: 0,
  updatedAt: 0,
})

const lin = mk('c1', '林知夏', '知夏', ['书', '猫', '下雨'], ['夏夏'])
const zhou = mk('c2', '周屿', '阿屿', ['咖啡', '游戏'], ['屿哥'])

const at = pickSpeakers([lin, zhou], '@知夏 在吗', { max: 2 })
console.log('1) @ picks exactly 知夏:', at.length === 1 && at[0]!.character.id === 'c1')

const quiet = pickSpeakers([lin, zhou], '嗯嗯', { max: 2 })
console.log('2) generic text wakes nobody:', quiet.length === 0)

const coffee = pickSpeakers([lin, zhou], '有人要喝咖啡吗', { max: 2 })
console.log('3) interest wakes 周屿:', coffee.length === 1 && coffee[0]!.character.id === 'c2')

const plain = pickSpeakers([lin, zhou], '夏夏今天在书店吗', { max: 2 })
console.log('4) alias wakes 知夏:', plain.some((s) => s.character.id === 'c1'))

const both = pickSpeakers([lin, zhou], '知夏和阿屿都在吗，喝咖啡聊书', { max: 2 })
console.log('5) max speakers <= 2:', both.length <= 2, '| picked:', both.map((s) => s.character.card.name).join(','))

const cooled = pickSpeakers([lin, zhou], '@知夏 在吗', { lastSpeakerId: 'c1', max: 2 })
console.log('6) @ beats cooldown:', cooled[0]?.character.id === 'c1')

const t1 = parseGroupTargets('知夏在吗', [lin, zhou])
console.log('7) plain name target:', t1.addressees.includes('c1') && !t1.addressees.includes('c2'))

const t2 = parseGroupTargets('@阿屿 你来一下', [lin, zhou])
console.log('8) @ target:', t2.addressees.includes('c2') && !t2.addressees.includes('c1'))

const t3 = parseGroupTargets('你们都在吗', [lin, zhou])
console.log('9) broadcast:', t3.addressees.length === 0 && !t3.explicit)


const history: Message[] = [
  { id: 'm1', conversationId: 'g', role: 'user', text: '知夏在吗', ts: 1, status: 'ok', kind: 'text' },
  { id: 'm2', conversationId: 'g', role: 'assistant', characterId: 'c1', text: '在', ts: 2, status: 'ok', kind: 'text', addressees: [] },
]
const built = buildGroupMessages({
  character: lin,
  members: [lin, zhou],
  names: { c1: '知夏', c2: '阿屿' },
  history,
  userName: '你',
  groupName: '测试群',
  addressedLast: false,
})
const system = String(built[0]!.content)
const user = String(built[1]!.content)
console.log('10) prompt has arrows:', user.includes('你 → 知夏'), '| has round context:', user.includes('本轮群聊'))
console.log('11) skip instruction:', system.includes('[跳过]'), '| addressee note:', system.includes('→ 收件人'))
