# 云端：账号与本地优先同步

## 现在有什么

- Worker：`https://jianyie-api.jianyie.workers.dev`
- D1 数据库 `jianyie`（APAC）
- 账号：用户名 + 密码（用户名唯一、密码 PBKDF2 哈希），游客默认不上传
- 同步：角色、会话、消息、记忆、表情包，按 `updatedAt` 做增量拉取/推送
- 清理：Cron 每天 03:00 检查，连续 30 天不活跃的账号只清云端同步数据，账号保留
- 广场表 `plaza_cards` 独立保存，不随 30 天清理删除

API Key 不参与同步；新设备登录后需要自己重新填模型 Key。

## API

- `POST /api/auth/register` `{username,password}`
- `POST /api/auth/login` `{username,password}`
- `POST /api/auth/logout`
- `GET /api/me`
- `POST /api/sync/push` `{items:[{kind,id,updatedAt,payload}]}`
- `GET /api/sync/pull?since=`

`kind` 允许：`characters / conversations / messages / memories / stickers`。

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

## 部署

```bash
pnpm add -D wrangler
npx wrangler d1 create jianyie
npx wrangler d1 execute jianyie --remote --file=server/schema.sql
npx wrangler deploy
```

需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。`wrangler.toml` 里已有 D1 绑定与每日 Cron。

## 注意

- 当前是明文同步（Cloudflare 存储层加密），不是端到端加密；不要把密钥写进角色卡；
- 密码哈希迭代次数为 2 万，是为了适配 Workers 免费版 CPU 限制，安全性弱于常规服务端，后续可换更强的 KDF 或付费 Workers；
- 没有邮箱找回；忘记密码只能换账号；
- 没有限流/验证码，公开上线前应加 Turnstile、IP 限流和登录失败次数限制。
