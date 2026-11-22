/**
 * 依次打包并运行三个冒烟测试：
 *   pnpm test:smoke
 * 1. smoke.ts        核心逻辑：建卡 / 双端提示词 / PNG 往返 / 请求组装
 * 2. store-smoke.ts  Dexie + Pinia：种子数据、会话复用、删除级联
 * 3. stream-smoke.ts 端到端：假 OpenAI 服务 + SSE 流 + 拆气泡
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const files = ['smoke.ts', 'store-smoke.ts', 'stream-smoke.ts', 'memory-smoke.ts', 'group-smoke.ts', 'vision-smoke.ts']
const out = mkdtempSync(join(tmpdir(), 'qpersona-smoke-'))

for (const file of files) {
  const target = join(out, file.replace('.ts', '.mjs'))
  console.log(`\n▶ ${file}`)
  execFileSync('node_modules/.bin/esbuild', [
    join('scripts', file),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${target}`,
    '--log-level=warning',
  ])
  execFileSync(process.execPath, [target], { stdio: 'inherit' })
}
console.log('\n✅ 全部冒烟测试通过')
