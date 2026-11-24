# 角色广场：不用服务器，能走到哪一步

## 现在是什么

「添加朋友 → 广场」读的是一份**静态 JSON**（默认 `public/plaza/cards.json`），
在浏览器里完成搜索、标签筛选、热门/最新排序和导入。

- **浏览、搜索、导入**：不需要服务器，挂静态托管即可；
- **别人上传**：静态托管做不到「任何人打开就能提交」，需要维护者合并 JSON，或对方自己托管一份 JSON；
- **地址可配**：广场右上角「地址」可以填任意静态 `cards.json`，比如 GitHub Raw、Cloudflare Pages。

真正的实时上传、点赞、审核，需要后端（Supabase、Cloudflare D1 + Worker 等），
那仍然不需要自己买服务器，但已经不属于「纯静态」了。

## 数据格式

```json
{
  "version": 1,
  "cards": [
    {
      "id": "demo-zhixia",
      "author": "笺页",
      "uploadedAt": 1763827200000,
      "downloads": 128,
      "avatar": "https://example.com/avatar.png",
      "qq": {
        "nickname": "知夏",
        "signature": "书店打烊了，猫还在营业",
        "interests": ["书", "猫"],
        "aliases": ["知夏", "夏夏"]
      },
      "card": {
        "name": "林知夏",
        "description": "……",
        "personality": "……",
        "first_mes": "……",
        "mes_example": "……",
        "tags": ["日常", "慢热"]
      }
    }
  ]
}
```

- `card` 按 SillyTavern V2 字段；只保留白名单字段，`extensions` 不会从广场合并；
- `avatar` 只接受 `http(s)` 或 `data:image/`；
- 单次最多加载 200 张，字段会截断，坏条目直接丢弃。

## 三种「无服务器」分享方式

1. **合并到内置广场**：导出角色卡 → 提 Issue / PR 给维护者 → 合并进 `cards.json` → 重新部署；
2. **自己开一个广场**：把 `cards.json` 放到 GitHub Pages / Cloudflare Pages / 任意静态空间，
   在「广场地址」里填链接，别人也能用这个地址；
3. **直接发文件**：角色卡 JSON 发给朋友，对方在「添加朋友 → 导入」里选文件。

## 想要实时上传怎么办

需要至少一个共享写入点：

- Supabase（Postgres + Storage + Auth）免费层，前端直接调；
- Cloudflare D1 + Worker / Pages Functions；
- 任意一个小后端 + 数据库。

要注意：公开上传必须审核，角色卡里可能带 NSFW、恶意提示词或隐私信息；
不要在前端放管理员 Key；至少加登录、限流和举报入口。

## 安全与隐私

- 广场只渲染文本，Vue 默认转义 HTML，不执行卡片里的脚本；
- 导入前会展示设定和开场白，第三方卡的提示词由作者提供，自己判断；
- 不要把聊天记录、API Key、真实联系方式放进公开卡片。
