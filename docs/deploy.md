# 部署：让别人也能用

## 先说结论

Q伴 是**纯前端 + IndexedDB** 的应用：没有后端、没有数据库、没有账号系统。
所以「别人也能用」只需要把 `dist/` 挂到任意静态网站，**不需要服务器，也不需要学生优惠**。

每个人的数据存在自己的浏览器里，API Key 也由每个人自己在「AI 设置」里填。
你部署的只是一个空壳，不会把聊天记录或 Key 带给别人。

## 方案对比

| 方式 | 成本 | 适合 |
| --- | --- | --- |
| Cloudflare Pages | 免费 | 公开访问，最省事 |
| GitHub Pages | 免费 | 已有 GitHub 仓库 |
| Netlify / Vercel | 免费额度 | 拖拽或 Git 部署 |
| 局域网 | 免费 | 同一 Wi-Fi 下自己/家人用 |
| Cloudflare Tunnel | 免费 | 不想部署，但电脑要一直开着 |

静态站点不需要信用卡，也不需要 Microsoft/Google 学生认证。

## Cloudflare Pages（推荐）

1. 把项目推到 GitHub；
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git；
3. 构建命令 `pnpm build`，输出目录 `dist`；
4. 部署完得到一个 `*.pages.dev` 域名，手机直接打开。

免费版限制：每月 500 次构建、单文件 25 MiB、2 万个文件，个人用足够
（[官方限制](https://developers.cloudflare.com/pages/platform/limits/)）。

## GitHub Pages

1. `pnpm build`；
2. 把 `dist/` 推到 `gh-pages` 分支（或配 GitHub Actions）；
3. 仓库 Settings → Pages 选该分支。

项目已把 Vite `base` 设为 `./`，放在仓库子路径下也能加载资源。
如果页面空白，先看浏览器控制台是不是资源 404，再检查 Pages 的发布目录。

## 局域网（不公开）

```bash
pnpm build
pnpm preview --host 0.0.0.0
```

手机连同一个 Wi-Fi，访问终端里显示的 `http://192.168.x.x:4173`。
电脑关掉就没了，适合自己用。

## 数据怎么共享

静态部署不会共享数据。想把自己的角色/聊天给别人：

- 设置 → 导出数据，得到一个 JSON；对方导入即可（会覆盖对方当前数据）；
- 或者只发角色卡（SillyTavern V2 JSON），让对方「导入角色卡」。

每个人的 API Key 各自填。**不要把带 Key 的配置发给别人，也不要把 Key 写进前端代码。**

## 如果以后要「共用一份数据」

那才需要后端：账号、数据库、同步、鉴权。可选 Supabase / Cloudflare D1 等，
但这是另一个量级的工程，当前版本不建议为了几个人上。

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
- 如果要让朋友用你的 Key，必须加一层有鉴权和限流的代理，否则会被刷爆。
