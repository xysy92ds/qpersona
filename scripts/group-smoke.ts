/**
 * 群聊激活规则测试：纯函数，零模型。
 *   pnpm test:smoke
 */
import { pickSpeakers } from '../src/core/group'
import type { Character } from '../src/core/types'

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
