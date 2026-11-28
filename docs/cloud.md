# 云端：账号与本地优先同步

## 现在有什么

- API：`https://jianyie.pages.dev/api`（Pages 高级模式代理到 Worker）

Worker 直连：`https://jianyie-api.jianyie.workers.dev`（仅内部/备用）
- D1 数据库 `jianyie`（APAC）
- 账号：用户名 + 密码（用户名唯一、密码 PBKDF2 哈希），游客默认不上传
- 同步：角色、会话、消息、记忆、表情包、个人资料/外观、模型方案（不含 Key），按 `updatedAt` 做增量拉取/推送
- 真人群聊：真人与 AI 角色共享群，服务端只存成员、AI 展示元数据和群消息，**不存任何模型 Key**
- 清理：Cron 每天 03:00 检查，连续 30 天不活跃的账号只清云端同步数据，账号保留；群聊数据暂不清理（见下）
- 广场表 `plaza_cards` 独立保存，不随 30 天清理删除

API Key 不参与同步；新设备登录后需要自己重新填模型 Key。

头像/主页背景在同步前会压到 256/720px，避免超过 D1 行大小；仍超限的条目会在同步结果里显示「过大未上传」。

App 启动、回到前台和每 2 分钟会自动同步一次；登录后也会立即同步。

## 动态广场

- `GET /api/plaza/cards` 公开读取已通过的卡；
- `POST /api/plaza/cards` 登录后上传（当前自动 approved）；
- `DELETE /api/plaza/cards/:id` 作者或管理员删除；
- 广场卡单独存，不随 30 天清理删除；
- 前端「添加朋友 → 广场 → 云端广场」可切换并上传本地角色；
- 「我的投稿」显示每张卡的公开状态并支持作者删除；当前上传自动通过，管理员审核界面后续补。
- 上传只带 224px 小头像和展示字段，**不上传主页背景/原图**；请求体超过约 850KB 会在本地直接提示。

## 真人好友

- `POST /api/friends/request` `{username}`：按用户名申请；
- `GET /api/friends`：好友、收到的申请、发出的申请；
- `POST /api/friends/accept` `{id}` / `POST /api/friends/reject` `{id}`；
- `POST /api/dm/send` `{to,text}`：仅好友可发；
- `GET /api/dm/poll?since=`：拉取 7 天内的中转消息；
- `GET /api/dm/status?ids=`：发送方查看已发送/已送达/过期；
- Cron 每天删除过期的中转消息。

## 真人群聊（真人 + AI 共享）

- `POST /api/groups` `{name, humanUsernames:[], bots:[{id,name,avatar}]}`：登录用户建群；
  - `humanUsernames` 里的人必须已经是好友（`friendships.status='accepted'`），否则 403；
  - owner 自动入群，不需要也不要把自己写进 `humanUsernames`（重复项自动忽略）；
  - AI 成员只存 `id / name / avatar` 展示元数据，**不上传、不保存模型 Key / 提示词 / 接口地址**；
  - 返回 `{ok, group}`，`group` 含 `members`、`bots`、`lastMessage`。
- `GET /api/groups`：我加入的群（按最近活跃排序，最多 100 个），每个群带 `members`（含用户名与角色 `owner/member`）、`bots`、`lastMessage`；
- `GET /api/groups/:id/messages?since=&limit=`：群成员校验；返回 `createdAt > since` 的消息（按时间升序），`limit` 默认 100、最大 500；
- `POST /api/groups/:id/messages`：群成员校验；
  - 真人消息：`{body}`；
  - AI 消息：`{body, botId, botName?}`，`botId` 必须是本群 `bots` 里登记过的，`botName` 可省略（默认用建群时登记的名字）；
  - 返回 `{ok, id, createdAt, message}`。

消息结构：

```json
{"id":"...","groupId":"...","senderUserId":"...","senderName":"阿岚","botId":null,"body":"大家好","createdAt":1730000000000}
```

- 真人消息：`senderUserId` 为用户 id，`botId` 为 `null`；
- AI 消息：`senderUserId` 为 `null`，`senderName` 为 AI 名字，`botId` 为登记的 AI id（客户端据此按角色卡渲染）；
- 同一群内 `createdAt` 单调递增，客户端用最后一条的 `createdAt` 当 `since` 增量拉取，不会因为同一毫秒发多条而漏消息；
- 群里任何人都可以为群内已登记的 AI 发消息，AI 实际在谁的设备上运行、用谁的 Key 由客户端决定；服务端不调用模型，也不产生费用；
- 限制：真人成员 50（含 owner）、AI 成员 20、群名 40 字、消息 4000 字、AI 头像 40000 字符；群消息走独立接口，不进 `/api/sync` 备份。

## API

- `POST /api/auth/register` `{username,password}`
- `POST /api/auth/login` `{username,password}`
- `POST /api/auth/logout`
- `GET /api/me`
- `POST /api/sync/push` `{items:[{kind,id,updatedAt,payload}]}`
- `GET /api/sync/pull?since=`
- `GET /api/groups`
- `POST /api/groups` `{name,humanUsernames,bots}`
- `GET /api/groups/:id/messages?since=`
- `POST /api/groups/:id/messages` `{body,botId?,botName?}`

`kind` 允许：`characters / conversations / messages / memories / stickers / settings`。

真人好友的 DM 只走中转和本地，群聊消息只走群接口，都不进同步备份。

## 本地优先规则

1. 先拉云端比本地新的条目；
2. 写入本地后，再把本地全量条目推回云端；
3. 服务端只接受 `updatedAt` 更大的版本，避免旧数据覆盖新数据；
4. 新设备如果本地只有初始演示角色，登录前会先清掉演示数据，避免和云端角色重复；
5. 删除暂不做跨端同步（本地删了，云端旧记录下次可能被拉回），后续加墓碑。

## 30 天清理

`users.last_seen_at` 在登录/同步时更新。Cron 每天执行：

```sql
SELECT id FROM users WHERE last_seen_at < now - 30 days;
DELETE FROM sync_items WHERE user_id = ?;
DELETE FROM sessions WHERE user_id = ?;
```

只清同步数据，不删 `users` 行；账号和公开广场卡保留。用户再登录时，如果本地还有数据会重新上传。

群聊数据（`groups / group_members / group_bots / group_messages`）**目前不参与 30 天清理**：不活跃用户的群和消息会一直保留，后续再补「群主长期不活跃」的清理策略。

## 部署

```bash
pnpm add -D wrangler
npx wrangler d1 create jianyie
npx wrangler d1 execute jianyie --remote --file=server/schema.sql
npx wrangler deploy
```

需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。`wrangler.toml` 里已有 D1 绑定与每日 Cron。`schema.sql` 全部是 `CREATE TABLE IF NOT EXISTS`，可重复执行；升级后重新跑一次就会补上群聊表。

## 注意

- 当前是明文同步（Cloudflare 存储层加密），不是端到端加密；不要把密钥写进角色卡；
- 密码哈希迭代次数为 2 万，是为了适配 Workers 免费版 CPU 限制，安全性弱于常规服务端，后续可换更强的 KDF 或付费 Workers；
- 没有邮箱找回；忘记密码只能换账号；
- 没有限流/验证码，公开上线前应加 Turnstile、IP 限流和登录失败次数限制；
- 群聊目前只有 MVP：没有退群 / 移除成员 / 改名 / 群主转让；没有服务端推送，前端需要像 DM 一样轮询 `since`；
- 群成员都能替群内已登记的 AI 发消息，服务端不校验「这句话是不是 AI 生成的」，也不做群内频率限制；
- CORS 仍是固定白名单（`xysy92ds.github.io / jianyie.pages.dev / localhost / capacitor`），新增域名要改 Worker 里的 `ALLOWED_ORIGINS`。
