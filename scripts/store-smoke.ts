/**
 * 存储 / 调度层冒烟测试（Node + fake-indexeddb，不依赖浏览器）：
 *   esbuild scripts/store-smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/store.mjs
 *   node /tmp/store.mjs
 */
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'

const el = { dataset: {} as Record<string, string>, classList: { toggle() {} } }
// settings.applyTheme 只需要一个 documentElement
;(globalThis as any).document = { documentElement: el }

const { useContactsStore } = await import('../src/store/contacts')
const { useChatStore } = await import('../src/store/chat')
const { useSettingsStore } = await import('../src/store/settings')
const { db } = await import('../src/core/db')

setActivePinia(createPinia())
const settings = useSettingsStore()
const contacts = useContactsStore()
const chat = useChatStore()

await settings.load()
await contacts.load()
console.log('1) seed characters:', contacts.characters.length, '| conversations:', contacts.conversations.length)
const conv = contacts.conversations[0]!
const ch = contacts.characterById(conv.characterId)!
console.log('2) character:', ch.card.name, '| profile:', conv.profile, '| qq:', ch.ext.qq.qqNumber)

await chat.load(conv.id)
console.log('3) greeting messages:', chat.messagesOf(conv.id).length, '|', chat.messagesOf(conv.id)[0]?.text)

await chat.send(conv.id, '在吗')
const list = chat.messagesOf(conv.id)
const last = list[list.length - 1]!
console.log('4) after send:', list.length, '| last role:', last.role, '| status:', last.status)
console.log('   hint:', last.text.slice(0, 28).replace(/\n/g, ' '))

const tavern = await contacts.ensureConversation(ch.id, 'tavern')
await chat.load(tavern.id)
console.log('5) tavern conv:', tavern.id.slice(0, 9), '| messages:', chat.messagesOf(tavern.id).length, '| profile:', tavern.profile)

const again = await contacts.ensureConversation(ch.id, 'qq')
console.log('6) qq conv reused:', again.id === conv.id)

await contacts.markRead(conv.id)
await contacts.togglePin(conv.id)
console.log('7) pinned:', contacts.conversationById(conv.id)?.pinned)

const stored = await db.conversations.count()
const msgs = await db.messages.count()
console.log('8) indexeddb conversations:', stored, '| messages:', msgs)

await contacts.removeCharacter(ch.id)
console.log('9) after delete:', contacts.characters.length, contacts.conversations.length, await db.messages.count())
