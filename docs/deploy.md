# 部署：让别人也能用

> 状态：v0.23.0。前端可纯静态部署；账号 / 云端同步 / 真人好友 / 真人群聊 / 云端广场是**可选**的云端层。

## 先说结论

笺页 的前端是**纯静态 + IndexedDB**：本地角色、聊天、酒馆、记忆、备份都不需要后端，
把 `dist/` 挂到任意静态网站就能用，「不需要服务器，也不需要学生优惠」。

云端功能是第二层：账号、云端同步、真人好友、真人群聊、云端广场需要 Cloudflare Worker + D1；
网页通过 Pages 高级模式的 `/api/*` 代理访问 Worker，仍然不用自己买服务器。
**只部署静态站点 = 大家各自用本地数据**，登录、真人好友、真人群聊、云端广场会提示未配置/未登录。

每个人的数据存在自己的浏览器里，API Key 也由每个人自己在「AI 设置」里填。
你部署的只是一个空壳，不会把聊天记录或 Key 带给别人（云端同步的数据属于各自账号）。

## 两层架构

| 层 | 内容 | 依赖 |
| --- | --- | --- |
| 前端 `dist/` | 角色卡、聊天、酒馆、记忆、备份、语音通话、桌面宽屏；登录后调云端 API | 任意静态托管 |
| 云端 `/api/*` | 账号、增量同步、真人好友中转（7 天）、真人群聊（群组/群消息）、云端广场 | Cloudflare Worker + D1 |
| 代理 | `public/_worker.js`（Pages 高级模式）把 `/api/*` 转发到 Worker | Cloudflare Pages |

- 云端不存模型 API Key；真人消息只中转 7 天，不进同步备份；群聊消息只存文字、不存 Key，详见 [cloud.md](cloud.md)。
- 前端默认云端地址是 `https://jianyie.pages.dev`，在「我的 → 账号与同步 → 服务器地址」里可改。

## 方案对比

| 方式 | 成本 | 适合 |
| --- | --- | --- |
| Cloudflare Pages | 免费 | 公开访问 + 需要云端功能（推荐，自带 `/api` 代理） |
| GitHub Pages | 免费 | 已有 GitHub 仓库；只有静态前端，云端功能需另配地址 |
| Netlify / Vercel | 免费额度 | 拖拽或 Git 部署 |
| 局域网 | 免费 | 同一 Wi-Fi 下自己/家人用 |
| Cloudflare Tunnel | 免费 | 不想部署，但电脑要一直开着 |

静态站点不需要信用卡，也不需要 Microsoft/Google 学生认证。

## 只部署前端（无云端）

1. `pnpm build`；
2. 把 `dist/` 推到静态空间（GitHub Pages / Netlify / 任意静态托管）；
3. 打开页面，本地功能直接可用；登录/真人好友/云端广场不可用。

项目已把 Vite `base` 设为 `./`，放在仓库子路径下也能加载资源。
如果页面空白，先看浏览器控制台是不是资源 404，再检查发布目录。
GitHub Actions 的 [pages.yml](../.github/workflows/pages.yml) 会自动把 `dist/` 发到 GitHub Pages。

## Cloudflare Pages（推荐，含云端）

1. 把项目推到 GitHub；
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git；
3. 构建命令 `pnpm build`，输出目录 `dist`（`public/_worker.js` 会一起进 `dist/`，生成 `/api` 代理）；
4. 部署完得到一个 `*.pages.dev` 域名，手机直接打开；
5. 云端 API 另见下一节部署 Worker。

免费版限制：每月 500 次构建、单文件 25 MiB、2 万个文件，个人用足够
（[官方限制](https://developers.cloudflare.com/pages/platform/limits/)）。

## 部署云端 API（Worker + D1）

只有需要账号、云端同步、真人好友、真人群聊、云端广场时才要做：

```bash
pnpm add -D wrangler
npx wrangler d1 create jianyie
npx wrangler d1 execute jianyie --remote --file=server/schema.sql
npx wrangler deploy
```

- 需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`；
- `wrangler.toml` 里已有 D1 绑定与每日 03:00 Cron（清理 7 天中转消息、30 天不活跃账号的同步数据、过期会话）；
- 部署 Worker 后**不用改前端地址**：`public/_worker.js` 已把 Pages 上的 `/api/*` 转过去；
- 可选环境变量 `ADMIN_KEY`：目前用于管理员删除广场卡 / 手动触发清理，**没有**管理员审核界面。

## 局域网（不公开）

```bash
pnpm build
pnpm preview --host 0.0.0.0
```

手机连同一个 Wi-Fi，访问终端里显示的 `http://192.168.x.x:4173`。
电脑关掉就没了，适合自己用；局域网里用云端功能需要能访问到 `pages.dev` 地址。

## 数据怎么共享

- **本地**：设置 → 导出数据（JSON），对方导入即可（会覆盖对方当前数据）；
  或只发角色卡（SillyTavern V2 JSON），让对方「导入角色卡」；
- **云端**：登录同一账号，按 `updatedAt` 增量同步角色 / 会话 / 消息 / 记忆 / 表情 / 资料 / 模型方案（不含 Key）；
- **真人**：双方各自登录并按用户名加好友，文字消息经中转保留 7 天，不进同步备份；
- **真人群聊**：建群时拉真人好友 + AI 角色，群组与群消息存 D1，各端轮询同步（手机原生后台通知只覆盖好友私聊）；
- **广场**：登录后上传角色卡会自动通过；静态广场仍需维护者合并 JSON（见 [plaza.md](plaza.md)）。

每个人的 API Key 各自填。**不要把带 Key 的配置发给别人，也不要把 Key 写进前端代码。**

## 学生优惠要不要领

- **不需要**：静态托管免费，Cloudflare Pages / GitHub Pages 都不用卡。
- **Azure for Students**：官方学生计划有 $100 额度，需要学生身份验证；
   eligibility 和年龄限制以申请页为准（[azure.microsoft.com/free/students](https://azure.microsoft.com/en-us/free/students)）。
- **GitHub Student Developer Pack**：高中生也可以尝试申请，里面有 Azure 等权益，
   部分体验标注 13–17 岁可用（[education.github.com/pack](https://education.github.com/pack)）。
- **Google Cloud**：新用户试用额度通常要信用卡；学校的教育额度一般由学校统一发放，
   个人高中身份不一定能领。

建议：**先用免费静态托管把地址跑起来**，确认真的需要后端/服务器再考虑学生额度。
免费额度会过期，绑卡后记得设预算提醒。

## 安全提醒

- 公开部署后，任何人打开都能用自己的 Key 聊天，但看不到你的数据；
- 不要在前端硬编码自己的 API Key；
- 云端目前没有端到端加密、登录限流、验证码和邮箱找回，公开上线前请自行加一层代理/限流；
- 如果要让朋友用你的 Key，必须加一层有鉴权和限流的代理，否则会被刷爆。
