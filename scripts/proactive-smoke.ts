/**
 * 主动消息时机判断：概率、安静时长、上次主动时间。
 */
import { shouldSendProactive } from '../src/core/proactive'

const base = {
  enabled: true,
  probability: 50,
  minMinutes: 60,
  lastTs: 0,
  now: 10 * 60 * 60 * 1000,
}

console.log('1) disabled:', shouldSendProactive({ ...base, enabled: false, random: 0 }) === false)
console.log('2) too recent:', shouldSendProactive({ ...base, lastTs: base.now - 10 * 60000, random: 0 }) === false)
console.log('3) probability 0:', shouldSendProactive({ ...base, probability: 0, random: 0 }) === false)
console.log('4) roll hit:', shouldSendProactive({ ...base, lastTs: base.now - 61 * 60000, random: 0.2 }) === true)
console.log('5) roll miss:', shouldSendProactive({ ...base, lastTs: base.now - 61 * 60000, random: 0.9 }) === false)
console.log(
  '6) recent proactive blocks:',
  shouldSendProactive({ ...base, lastTs: base.now - 61 * 60000, lastProactiveAt: base.now - 30 * 60000, random: 0 }) === false,
)
